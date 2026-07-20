import {
  createCalendarTemplateContext,
  DEFAULT_CALENDAR_DESCRIPTION_TEMPLATE,
  DEFAULT_CALENDAR_TITLE_TEMPLATE,
  renderCalendarTemplate,
  type CalendarTemplateContext,
} from './calendarTemplates'
import type {
  ExportWorkBlock,
  WorkBlockMetricsResolver,
} from './models'
import {
  addDays,
  isIsoDate,
  isIsoDateTime,
  isTime,
  minutesFromTime,
} from './serviceUtils'

export type CalendarColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray'

export interface IcsOptions<T extends ExportWorkBlock> {
  calendarName?: string
  titleTemplate?: string
  descriptionTemplate?: string
  locale?: string
  currency?: string
  timeZone?: string
  uidDomain?: string
  productId?: string
  color?: CalendarColor | `#${string}`
  now?: Date
  activityLabel?: string | ((block: T) => string | undefined)
  extraContext?: (block: T) => Record<string, string>
  sequence?: (block: T) => number
}

const COLOR_HEX: Record<CalendarColor, string> = {
  red: '#D63B46',
  orange: '#E77D22',
  yellow: '#E3B628',
  green: '#3C9863',
  blue: '#3978C5',
  violet: '#7554B8',
  gray: '#73777F',
}

function validateOptions<T extends ExportWorkBlock>(options: IcsOptions<T>): void {
  if (options.timeZone && !/^[A-Za-z0-9_+./-]+$/u.test(options.timeZone)) {
    throw new RangeError('Ungültige IANA-Zeitzone für den ICS-Export.')
  }
  if (options.uidDomain && !/^[A-Za-z0-9.-]+$/u.test(options.uidDomain)) {
    throw new RangeError('Ungültige UID-Domain für den ICS-Export.')
  }
  if (options.color?.startsWith('#') && !/^#[0-9A-Fa-f]{6}$/u.test(options.color)) {
    throw new RangeError('ICS-Farbe muss ein Name oder ein sechsstelliger Hex-Wert sein.')
  }
  if (
    options.color &&
    !options.color.startsWith('#') &&
    !Object.hasOwn(COLOR_HEX, options.color)
  ) {
    throw new RangeError('Unbekannte ICS-Kalenderfarbe.')
  }
  if (options.now && !Number.isFinite(options.now.getTime())) {
    throw new RangeError('Ungültiger ICS-Erstellungszeitpunkt.')
  }
}

function formatIcsLocal(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`
}

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')
}

function formatStoredTimestamp(value: string | undefined): string | undefined {
  if (!value || !isIsoDateTime(value)) return undefined
  return formatIcsUtc(new Date(value))
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return unescape(encodeURIComponent(value)).length
}

/** RFC 5545 content lines are folded at 75 UTF-8 octets. */
export function foldIcsLine(line: string): string[] {
  if (byteLength(line) <= 75) return [line]
  const lines: string[] = []
  let current = ''
  for (const character of line) {
    if (byteLength(`${current}${character}`) > 75) {
      lines.push(current)
      current = ` ${character}`
    } else {
      current += character
    }
  }
  if (current) lines.push(current)
  return lines
}

function safeUidPart(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._~-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return normalized || 'arbeitsblock'
}

export function createWorkBlockEventUid(
  blockId: string,
  uidDomain = 'fahrschulzeit.local',
): string {
  return `${safeUidPart(blockId)}@${uidDomain}`
}

function colorHex(color: IcsOptions<ExportWorkBlock>['color']): string | undefined {
  if (!color) return undefined
  if (color.startsWith('#')) return color.toUpperCase()
  return COLOR_HEX[color as CalendarColor]
}

function property(name: string, value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : `${name}:${value}`
}

function eventDateRange(block: ExportWorkBlock): {
  start: string
  end: string
} {
  if (!isIsoDate(block.date) || !isTime(block.startTime) || !isTime(block.endTime)) {
    throw new RangeError(`Arbeitsblock „${block.id}“ enthält ein ungültiges Datum oder eine ungültige Uhrzeit.`)
  }
  const startMinutes = minutesFromTime(block.startTime)
  const endMinutes = minutesFromTime(block.endTime)
  if (startMinutes === endMinutes) {
    throw new RangeError(`Arbeitsblock „${block.id}“ darf nicht bei identischer Uhrzeit beginnen und enden.`)
  }
  const endDate = endMinutes < startMinutes
    ? addDays(block.date, 1)
    : block.date
  return {
    start: formatIcsLocal(block.date, block.startTime),
    end: formatIcsLocal(endDate, block.endTime),
  }
}

function buildEventLines<T extends ExportWorkBlock>(
  block: T,
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: IcsOptions<T>,
  stamp: string,
): string[] {
  const metrics = resolveMetrics(block)
  Object.entries(metrics).forEach(([key, value]) => {
    if (!Number.isFinite(value)) throw new TypeError(`Ungültiger ICS-Berechnungswert: ${key}`)
  })
  const context: CalendarTemplateContext = createCalendarTemplateContext(block, metrics, {
    locale: options.locale,
    currency: options.currency,
    activityLabel: options.activityLabel,
    extra: options.extraContext?.(block),
  })
  const titleTemplate = block.calendarText?.trim() || options.titleTemplate || DEFAULT_CALENDAR_TITLE_TEMPLATE
  const summary = renderCalendarTemplate(titleTemplate, context, {
    unknownPlaceholder: 'keep',
  }).trim() || 'Fahrschule'
  const description = renderCalendarTemplate(
    options.descriptionTemplate ?? DEFAULT_CALENDAR_DESCRIPTION_TEMPLATE,
    context,
    { unknownPlaceholder: 'keep' },
  ).trim()
  const { start, end } = eventDateRange(block)
  const timeZoneParameter = options.timeZone ? `;TZID=${options.timeZone}` : ''
  const sequence = options.sequence?.(block) ?? 0
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new RangeError('ICS-SEQUENCE muss eine nichtnegative ganze Zahl sein.')
  }
  const resolvedColor = colorHex(options.color)
  const created = formatStoredTimestamp(block.createdAt)
  const modified = formatStoredTimestamp(block.updatedAt)
  const category = context.tätigkeit
  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(createWorkBlockEventUid(block.id, options.uidDomain))}`,
    `DTSTAMP:${stamp}`,
    created ? `CREATED:${created}` : undefined,
    modified ? `LAST-MODIFIED:${modified}` : undefined,
    `DTSTART${timeZoneParameter}:${start}`,
    `DTEND${timeZoneParameter}:${end}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    property('DESCRIPTION', escapeIcsText(description)),
    property('LOCATION', block.location ? escapeIcsText(block.location.trim()) : undefined),
    property('CATEGORIES', category ? escapeIcsText(category) : undefined),
    `SEQUENCE:${sequence}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    property('COLOR', resolvedColor),
    property('X-APPLE-CALENDAR-COLOR', resolvedColor),
    `X-FAHRSCHULZEIT-BLOCK-ID:${escapeIcsText(block.id)}`,
    'END:VEVENT',
  ].filter((line): line is string => Boolean(line))
}

/** Generates a complete VCALENDAR containing one VEVENT per work block. */
export function createIcsCalendar<T extends ExportWorkBlock>(
  workBlocks: readonly T[],
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: IcsOptions<T> = {},
): string {
  validateOptions(options)
  const ids = workBlocks.map((block) => block.id)
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('ICS-Export enthält doppelte Arbeitsblock-IDs und damit doppelte UIDs.')
  }
  const stamp = formatIcsUtc(options.now ?? new Date())
  const calendarName = options.calendarName?.trim() || 'Fahrschulzeit'
  const calendarColor = colorHex(options.color)
  const sorted = [...workBlocks].sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.id.localeCompare(right.id),
  )
  const logicalLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeIcsText(options.productId ?? '-//Fahrschulzeit//Arbeitszeit v0.1.0//DE')}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    options.timeZone ? `X-WR-TIMEZONE:${options.timeZone}` : undefined,
    calendarColor ? `X-APPLE-CALENDAR-COLOR:${calendarColor}` : undefined,
    ...sorted.flatMap((block) => buildEventLines(block, resolveMetrics, options, stamp)),
    'END:VCALENDAR',
  ].filter((line): line is string => Boolean(line))
  return `${logicalLines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}

export function createWorkBlockIcs<T extends ExportWorkBlock>(
  workBlock: T,
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: IcsOptions<T> = {},
): string {
  return createIcsCalendar([workBlock], resolveMetrics, options)
}

/** Overnight blocks remain assigned to their start date. */
export function createDayIcs<T extends ExportWorkBlock>(
  workBlocks: readonly T[],
  date: string,
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: IcsOptions<T> = {},
): string {
  if (!isIsoDate(date)) throw new RangeError('Tag muss dem Format YYYY-MM-DD entsprechen.')
  return createIcsCalendar(
    workBlocks.filter((block) => block.date === date),
    resolveMetrics,
    options,
  )
}

export function createMonthIcs<T extends ExportWorkBlock>(
  workBlocks: readonly T[],
  month: string,
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: IcsOptions<T> = {},
): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new RangeError('Monat muss dem Format YYYY-MM entsprechen.')
  }
  return createIcsCalendar(
    workBlocks.filter((block) => block.date.startsWith(`${month}-`)),
    resolveMetrics,
    options,
  )
}

export function createIcsBlob(content: string): Blob {
  return new Blob([content], { type: 'text/calendar;charset=utf-8' })
}

export function createIcsFilename(scope: string): string {
  const safeScope = scope
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLocaleLowerCase('de-DE') || 'export'
  return `fahrschulzeit-${safeScope}.ics`
}

// Explicit aliases make the block/day/month intent discoverable to callers.
export const generateIcsForWorkBlock = createWorkBlockIcs
export const generateIcsForDay = createDayIcs
export const generateIcsForMonth = createMonthIcs
