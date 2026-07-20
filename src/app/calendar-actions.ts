import type { AppSettings, AppWorkBlock, WorkCategory } from './app-types'
import { calculateWorkBlock } from '../domain'
import {
  createCalendarTemplateContext,
  createCsvFilename,
  createIcsCalendar,
  createIcsFilename,
  createWorkBlocksCsv,
  downloadTextFile,
  renderCalendarTemplate,
  type CalendarSyncRecord,
  type WorkBlockExportMetrics,
} from '../services'
import {
  checkCalendarPermission,
  createNativeCalendarEvent,
  deleteNativeCalendarEvent,
  getCalendarCapability,
  requestCalendarPermission,
  updateNativeCalendarEvent,
  type NativeCalendarEventDraft,
} from '../native/calendar-gateway'

const EVENT_COLORS: Record<AppSettings['calendar']['color'], string> = {
  red: '#D63B46',
  orange: '#E77D22',
  yellow: '#E3B628',
  green: '#3C9863',
  blue: '#3978C5',
  violet: '#7554B8',
  gray: '#73777F',
}

export function metricsFor(block: AppWorkBlock, settings: AppSettings): WorkBlockExportMetrics {
  const calculation = calculateWorkBlock(block, settings.pay)
  return {
    attendanceMinutes: calculation.attendanceMinutes,
    breakMinutes: calculation.breakMinutes,
    workMinutes: calculation.workMinutes,
    paidMinutes: calculation.paidWorkMinutes,
    timeHours: calculation.timeHours,
    trainingHours: calculation.trainingHours,
    earningsCents: calculation.earningsCents,
  }
}

function categoryLabel(block: AppWorkBlock, categories: readonly WorkCategory[]): string {
  return block.activity?.trim()
    || categories.find((category) => category.id === block.categoryId)?.name
    || 'Arbeitszeit'
}

export function downloadCsvExport(
  blocks: readonly AppWorkBlock[],
  categories: readonly WorkCategory[],
  settings: AppSettings,
  scope: string,
): boolean {
  const csv = createWorkBlocksCsv(blocks, (block) => metricsFor(block, settings), {
    currency: settings.currency,
    activityLabel: (block) => categoryLabel(block, categories),
  })
  return downloadTextFile(csv, createCsvFilename(scope), 'text/csv;charset=utf-8')
}

export function downloadIcsExport(
  blocks: readonly AppWorkBlock[],
  categories: readonly WorkCategory[],
  settings: AppSettings,
  scope: string,
): boolean {
  const content = createIcsCalendar(blocks, (block) => metricsFor(block, settings), {
    calendarName: settings.calendar.targetCalendarName || 'Fahrschulzeit',
    titleTemplate: settings.calendar.titleTemplate,
    descriptionTemplate: settings.calendar.includeEarnings
      ? `${settings.calendar.descriptionTemplate}\n{verdienst}`
      : settings.calendar.descriptionTemplate,
    currency: settings.currency,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
    color: settings.calendar.color,
    activityLabel: (block) => categoryLabel(block, categories),
  })
  return downloadTextFile(content, createIcsFilename(scope), 'text/calendar;charset=utf-8')
}

function timestampRange(block: AppWorkBlock): { startDate: number; endDate: number } {
  const start = new Date(`${block.date}T${block.startTime}:00`)
  const end = new Date(`${block.date}T${block.endTime}:00`)
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1)
  return { startDate: start.getTime(), endDate: end.getTime() }
}

export function nativeEventDraft(
  block: AppWorkBlock,
  categories: readonly WorkCategory[],
  settings: AppSettings,
): NativeCalendarEventDraft {
  const metrics = metricsFor(block, settings)
  const context = createCalendarTemplateContext(block, metrics, {
    currency: settings.currency,
    activityLabel: categoryLabel(block, categories),
  })
  const title = renderCalendarTemplate(
    block.calendarText?.trim() || settings.calendar.titleTemplate,
    context,
    { unknownPlaceholder: 'keep' },
  )
  const renderedDescription = renderCalendarTemplate(
    settings.calendar.descriptionTemplate,
    context,
    { unknownPlaceholder: 'keep' },
  )
  const descriptionParts = [
    renderedDescription,
    settings.calendar.includeEarnings ? context.verdienst : '',
    block.notes,
    `Fahrschulzeit-ID: ${block.id}`,
  ].filter(Boolean)

  return {
    title: title || 'Fahrschule',
    description: descriptionParts.join('\n'),
    ...timestampRange(block),
    location: block.location,
    color: EVENT_COLORS[settings.calendar.color],
    calendarId: settings.calendar.targetCalendarId,
  }
}

export interface CalendarTransferCallbacks {
  markSynced(blockId: string, provider: 'ics' | 'native', externalEventId?: string): Promise<void>
  markFailed(blockId: string, message: string): Promise<void>
}

export interface CalendarTransferResult {
  readonly mode: 'ics' | 'native'
  readonly successful: number
  readonly failed: number
}

export async function transferCalendarBlocks(
  blocks: readonly AppWorkBlock[],
  categories: readonly WorkCategory[],
  settings: AppSettings,
  syncRecords: readonly CalendarSyncRecord[],
  callbacks: CalendarTransferCallbacks,
  scope = 'arbeitszeiten',
): Promise<CalendarTransferResult> {
  if (blocks.length === 0) return { mode: getCalendarCapability().mode, successful: 0, failed: 0 }
  const capability = getCalendarCapability()

  if (capability.mode === 'ics') {
    const downloaded = downloadIcsExport(blocks, categories, settings, scope)
    if (!downloaded) throw new Error('Die Kalenderdatei konnte nicht bereitgestellt werden.')
    await Promise.all(blocks.map((block) => callbacks.markSynced(block.id, 'ics')))
    return { mode: 'ics', successful: blocks.length, failed: 0 }
  }

  if (!settings.calendar.targetCalendarId) {
    throw new Error('Bitte wähle zuerst in den Einstellungen einen Zielkalender aus.')
  }
  const permission = await checkCalendarPermission()
  if (permission !== 'granted') {
    const result = await requestCalendarPermission()
    if (result !== 'granted') throw new Error('Der vollständige Kalenderzugriff wurde nicht freigegeben.')
  }

  let successful = 0
  let failed = 0
  for (const block of blocks) {
    try {
      const draft = nativeEventDraft(block, categories, settings)
      const record = syncRecords.find((entry) => entry.workBlockId === block.id)
      let externalEventId = record?.externalEventId
      if (externalEventId && record?.targetCalendarId !== settings.calendar.targetCalendarId) {
        await deleteNativeCalendarEvent(externalEventId)
        externalEventId = undefined
      }
      if (externalEventId) {
        await updateNativeCalendarEvent(externalEventId, draft)
      } else {
        externalEventId = await createNativeCalendarEvent(draft)
      }
      await callbacks.markSynced(block.id, 'native', externalEventId)
      successful += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kalenderübertragung fehlgeschlagen.'
      await callbacks.markFailed(block.id, message)
      failed += 1
    }
  }
  return { mode: 'native', successful, failed }
}

export async function deleteLinkedCalendarEvent(record: CalendarSyncRecord | undefined): Promise<void> {
  if (getCalendarCapability().mode !== 'native' || !record?.externalEventId) return
  await deleteNativeCalendarEvent(record.externalEventId)
}
