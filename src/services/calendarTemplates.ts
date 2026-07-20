import type { ExportWorkBlock, WorkBlockExportMetrics } from './models'
import { formatClockMinutes } from './serviceUtils'

export const CALENDAR_TEMPLATE_PLACEHOLDERS = [
  'tätigkeit',
  'arbeitszeit',
  'ausbstunden',
  'verdienst',
  'fahrzeugklasse',
  'bemerkung',
  'start',
  'ende',
] as const

export type CalendarTemplatePlaceholder = (typeof CALENDAR_TEMPLATE_PLACEHOLDERS)[number]

export type CalendarTemplateContext = Record<CalendarTemplatePlaceholder, string> &
  Record<string, string>

export interface CalendarTemplateValidation {
  valid: boolean
  placeholders: string[]
  unknownPlaceholders: string[]
}

export interface RenderCalendarTemplateOptions {
  unknownPlaceholder?: 'keep' | 'empty' | 'error'
}

export interface CalendarContextOptions<T extends ExportWorkBlock> {
  activityLabel?: string | ((block: T) => string | undefined)
  locale?: string
  currency?: string
  extra?: Record<string, string>
}

export const DEFAULT_CALENDAR_TITLE_TEMPLATE = 'Fahrschule – {tätigkeit}'
export const DEFAULT_CALENDAR_DESCRIPTION_TEMPLATE =
  '{arbeitszeit} · {ausbstunden} · {verdienst}'

const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/gu

export function extractCalendarTemplatePlaceholders(template: string): string[] {
  const placeholders = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1].trim().toLocaleLowerCase('de-DE'))
  }
  return [...placeholders]
}

export function validateCalendarTemplate(
  template: string,
  allowedPlaceholders: readonly string[] = CALENDAR_TEMPLATE_PLACEHOLDERS,
): CalendarTemplateValidation {
  const placeholders = extractCalendarTemplatePlaceholders(template)
  const allowed = new Set(allowedPlaceholders.map((item) => item.toLocaleLowerCase('de-DE')))
  const unknownPlaceholders = placeholders.filter((item) => !allowed.has(item))
  return {
    valid: unknownPlaceholders.length === 0,
    placeholders,
    unknownPlaceholders,
  }
}

export function renderCalendarTemplate(
  template: string,
  context: Partial<CalendarTemplateContext>,
  options: RenderCalendarTemplateOptions = {},
): string {
  const normalized = new Map(
    Object.entries(context).map(([key, value]) => [
      key.toLocaleLowerCase('de-DE'),
      String(value ?? ''),
    ]),
  )
  return template.replace(PLACEHOLDER_PATTERN, (placeholder, rawKey: string) => {
    const key = rawKey.trim().toLocaleLowerCase('de-DE')
    if (normalized.has(key)) return normalized.get(key) ?? ''
    switch (options.unknownPlaceholder ?? 'keep') {
      case 'empty':
        return ''
      case 'error':
        throw new RangeError(`Unbekannter Kalender-Platzhalter: ${placeholder}`)
      default:
        return placeholder
    }
  })
}

function resolveActivityLabel<T extends ExportWorkBlock>(
  block: T,
  configured: CalendarContextOptions<T>['activityLabel'],
): string {
  const value = typeof configured === 'function' ? configured(block) : configured
  return value?.trim() || block.activity?.trim() || block.categoryId?.trim() || 'Arbeitszeit'
}

export function createCalendarTemplateContext<T extends ExportWorkBlock>(
  block: T,
  metrics: WorkBlockExportMetrics,
  options: CalendarContextOptions<T> = {},
): CalendarTemplateContext {
  const locale = options.locale ?? 'de-DE'
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: options.currency ?? 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return {
    tätigkeit: resolveActivityLabel(block, options.activityLabel),
    arbeitszeit: `${formatClockMinutes(metrics.workMinutes)} Std.`,
    ausbstunden: `${decimal.format(metrics.trainingHours)} AusbStd.`,
    verdienst: money.format(metrics.earningsCents / 100),
    fahrzeugklasse: block.vehicleClass?.trim() ?? '',
    bemerkung: block.notes?.trim() ?? '',
    start: block.startTime,
    ende: block.endTime,
    ...options.extra,
  }
}
