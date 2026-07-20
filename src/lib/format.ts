export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  return `${hours}:${String(rest).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  return `${formatMinutes(minutes)} Std.`
}

export function formatDecimalHours(minutes: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minutes / 60)
}

export function formatTrainingHours(minutes: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minutes / 45)
}

export function formatMoneyCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100)
}

export function formatRate(rate: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(rate)
}

export function parseDecimalInput(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function formatClockRange(start: string, end: string): string {
  return `${start}–${end} Uhr`
}

export function pluralize(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}
