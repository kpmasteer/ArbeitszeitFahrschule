import type { JsonValue } from './models'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

export function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function minutesFromTime(value: string): number {
  if (!isTime(value)) throw new RangeError(`Ungültige Uhrzeit: ${value}`)
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function addDays(dateValue: string, days: number): string {
  if (!isIsoDate(dateValue)) throw new RangeError(`Ungültiges Datum: ${dateValue}`)
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
}

export function formatClockMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : isPlainObject(value) &&
      Object.values(value).every((item) => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}

export function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function stableStringify(value: unknown): string {
  const seen = new Set<object>()
  const normalize = (current: unknown): unknown => {
    if (current === null || typeof current !== 'object') return current
    if (seen.has(current)) throw new TypeError('Zyklische Daten können nicht serialisiert werden.')
    seen.add(current)
    const normalized = Array.isArray(current)
      ? current.map(normalize)
      : Object.fromEntries(
          Object.entries(current as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalize(item)]),
        )
    seen.delete(current)
    return normalized
  }
  return JSON.stringify(normalize(value))
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false
  }
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
