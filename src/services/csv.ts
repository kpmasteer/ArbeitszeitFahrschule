import type {
  ExportWorkBlock,
  WorkBlockExportMetrics,
  WorkBlockMetricsResolver,
} from './models'
import { formatClockMinutes, isIsoDate, isTime } from './serviceUtils'

export interface WorkBlockCsvOptions<T extends ExportWorkBlock> {
  delimiter?: string
  lineEnding?: '\r\n' | '\n'
  includeBom?: boolean
  locale?: string
  currency?: string
  sortChronologically?: boolean
  protectSpreadsheetFormulas?: boolean
  activityLabel?: (block: T) => string | undefined
}

export const WORK_BLOCK_CSV_HEADERS = [
  'ID',
  'Datum',
  'Beginn',
  'Ende',
  'Tätigkeit',
  'Anwesenheit',
  'Pause',
  'Arbeitszeit',
  'Zeitstunden',
  'Ausbildungsstunden',
  'Verdienst',
  'Vergütung',
  'Fahrzeugklasse',
  'Fahrschüler / Auftrag',
  'Ort',
  'Bemerkung',
] as const

function validateMetrics(metrics: WorkBlockExportMetrics): void {
  const values = Object.entries(metrics)
  const invalid = values.find(([, value]) => typeof value !== 'number' || !Number.isFinite(value))
  if (invalid) throw new TypeError(`Ungültiger CSV-Berechnungswert: ${invalid[0]}`)
  if (
    metrics.attendanceMinutes < 0 ||
    metrics.breakMinutes < 0 ||
    metrics.workMinutes < 0 ||
    metrics.paidMinutes < 0 ||
    metrics.earningsCents < 0
  ) {
    throw new RangeError('CSV-Berechnungswerte dürfen nicht negativ sein.')
  }
}

function escapeCell(
  rawValue: unknown,
  delimiter: string,
  protectSpreadsheetFormulas: boolean,
): string {
  let value = rawValue == null ? '' : String(rawValue)
  if (protectSpreadsheetFormulas && /^[\s]*[=+\-@]/u.test(value)) value = `'${value}`
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\r') ||
    value.includes('\n') ||
    /^\s|\s$/u.test(value)
  ) {
    value = `"${value.replaceAll('"', '""')}"`
  }
  return value
}

function compareBlocks(left: ExportWorkBlock, right: ExportWorkBlock): number {
  return (
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.endTime.localeCompare(right.endTime) ||
    left.id.localeCompare(right.id)
  )
}

/** Creates a German Excel-friendly UTF-8 CSV (semicolon and BOM by default). */
export function createWorkBlocksCsv<T extends ExportWorkBlock>(
  workBlocks: readonly T[],
  resolveMetrics: WorkBlockMetricsResolver<T>,
  options: WorkBlockCsvOptions<T> = {},
): string {
  const delimiter = options.delimiter ?? ';'
  if (!delimiter || /[\r\n"]/u.test(delimiter)) {
    throw new RangeError('CSV-Trennzeichen darf weder leer sein noch Zeilenumbruch/Anführungszeichen enthalten.')
  }
  const lineEnding = options.lineEnding ?? '\r\n'
  const locale = options.locale ?? 'de-DE'
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: options.currency ?? 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
  const blocks = options.sortChronologically === false
    ? [...workBlocks]
    : [...workBlocks].sort(compareBlocks)
  const rows: unknown[][] = [WORK_BLOCK_CSV_HEADERS.slice()]
  blocks.forEach((block) => {
    if (!isIsoDate(block.date) || !isTime(block.startTime) || !isTime(block.endTime)) {
      throw new RangeError(`Arbeitsblock „${block.id}“ enthält ein ungültiges Datum oder eine ungültige Uhrzeit.`)
    }
    const metrics = resolveMetrics(block)
    validateMetrics(metrics)
    const personOrOrder = [block.studentOrAssignment, block.student, block.order]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' / ')
    rows.push([
      block.id,
      block.date,
      block.startTime,
      block.endTime,
      options.activityLabel?.(block) ?? block.activity ?? block.categoryId ?? '',
      formatClockMinutes(metrics.attendanceMinutes),
      formatClockMinutes(metrics.breakMinutes),
      formatClockMinutes(metrics.workMinutes),
      number.format(metrics.timeHours),
      number.format(metrics.trainingHours),
      money.format(metrics.earningsCents / 100),
      block.isPaid === false ? 'unvergütet' : 'vergütet',
      block.vehicleClass ?? '',
      personOrOrder,
      block.location ?? '',
      block.notes ?? '',
    ])
  })
  const protect = options.protectSpreadsheetFormulas !== false
  const content = rows
    .map((row) => row.map((value) => escapeCell(value, delimiter, protect)).join(delimiter))
    .join(lineEnding)
  return `${options.includeBom === false ? '' : '\uFEFF'}${content}${lineEnding}`
}

export function createCsvBlob(csv: string): Blob {
  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}

export function createCsvFilename(scope: string, date = new Date()): string {
  const safeScope = scope
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLocaleLowerCase('de-DE') || 'export'
  const stamp = date.toISOString().slice(0, 10)
  return `fahrschulzeit-${safeScope}-${stamp}.csv`
}
