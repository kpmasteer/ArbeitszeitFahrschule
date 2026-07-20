import type { PaySettings, WorkBlock } from '../domain'
import type { CalendarSyncRecord } from '../services/calendarSync'

export type CategoryIcon =
  | 'steering-wheel'
  | 'presentation'
  | 'clipboard-check'
  | 'briefcase'
  | 'route'
  | 'graduation-cap'
  | 'shapes'

export interface WorkCategory {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly icon: CategoryIcon
  readonly active: boolean
  readonly sortOrder: number
  readonly rate?: number
}

export type HoursDisplayMode =
  | 'clock'
  | 'decimal'
  | 'training'
  | 'clock-training'
  | 'all'

export type ThemeMode = 'system' | 'light' | 'dark'
export type MinuteStep = 1 | 5 | 15
export type CalendarColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray'

export interface CalendarSyncSettings {
  readonly targetCalendarId?: string
  readonly targetCalendarName?: string
  readonly titleTemplate: string
  readonly descriptionTemplate: string
  readonly color: CalendarColor
  readonly automatic: boolean
  readonly updateAutomatically: boolean
  readonly deleteAutomatically: boolean
  readonly includeEarnings: boolean
}

export interface AppSettings {
  readonly pay: PaySettings
  readonly currency: 'EUR'
  readonly defaultBreakMinutes: number
  readonly defaultCategoryId: string
  readonly minuteStep: MinuteStep
  readonly overnightAllocation: 'start-date' | 'split-next-day'
  readonly defaultStartTime: string
  readonly defaultEndTime: string
  readonly displayMode: HoursDisplayMode
  readonly weekStartsMonday: true
  readonly use24Hour: true
  readonly theme: ThemeMode
  readonly compactCalendar: boolean
  readonly calendar: CalendarSyncSettings
  readonly showSampleData: boolean
}

export type CalendarSyncState = 'pending' | 'synced' | 'changed' | 'missing' | 'error'

export interface AppWorkBlock extends WorkBlock {
  readonly createdAt: string
  readonly updatedAt: string
  readonly sample?: boolean
  readonly syncState?: CalendarSyncState
  readonly calendarEventId?: string
}

export interface AppState {
  readonly blocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly syncRecords: readonly CalendarSyncRecord[]
}

export interface WorkBlockDraft {
  readonly id?: string
  readonly date: string
  readonly startTime: string
  readonly endTime: string
  readonly breaks: WorkBlock['breaks']
  readonly categoryId: string
  readonly rateOverride?: number
  readonly isPaid: boolean
  readonly activity?: string
  readonly vehicleClass?: string
  readonly studentOrAssignment?: string
  readonly notes?: string
  readonly location?: string
  readonly calendarText?: string
}
