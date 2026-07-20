const pad = (value: number) => String(value).padStart(2, '0')

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function currentMonthKey(): string {
  return todayIso().slice(0, 7)
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function monthFromKey(value: string): Date {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1, 12)
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function shiftMonth(value: string, delta: number): string {
  const date = monthFromKey(value)
  date.setMonth(date.getMonth() + delta)
  return monthKey(date)
}

export function formatMonthLong(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(monthFromKey(value))
}

export function formatDateLong(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseIsoDate(value))
}

export function formatDateShort(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseIsoDate(value))
}

export interface CalendarCell {
  readonly date: string
  readonly day: number
  readonly inMonth: boolean
  readonly isToday: boolean
}

export function calendarCells(value: string): readonly CalendarCell[] {
  const first = monthFromKey(value)
  const mondayIndex = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - mondayIndex)
  const today = todayIso()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const iso = toIsoDate(date)
    return {
      date: iso,
      day: date.getDate(),
      inMonth: iso.startsWith(value),
      isToday: iso === today,
    }
  })
}

export function daysInMonth(value: string): number {
  const date = monthFromKey(value)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const
