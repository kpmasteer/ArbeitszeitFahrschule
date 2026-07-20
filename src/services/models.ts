/** Shared, persistence-safe contracts used by the local services. */

export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

export interface EntityRecord {
  id: string
}

export interface DurationBreakRecord {
  kind: 'duration'
  minutes: number
}

export interface IntervalBreakRecord {
  kind: 'interval'
  startTime: string
  endTime: string
}

export type BackupBreakRecord = DurationBreakRecord | IntervalBreakRecord

/**
 * The minimum work-block shape understood by backup and export services.
 * Additional application fields are retained during backup/import.
 */
export interface BackupWorkBlock extends EntityRecord {
  date: string
  startTime: string
  endTime: string
  breaks: readonly BackupBreakRecord[]
  categoryId?: string
  rateOverride?: number
  isPaid?: boolean
  activity?: string
  student?: string
  order?: string
  studentOrAssignment?: string
  vehicleClass?: string
  notes?: string
  location?: string
  calendarText?: string
  createdAt?: string
  updatedAt?: string
}

export interface BackupCategory extends EntityRecord {
  name: string
  active?: boolean
  sortOrder?: number
  rate?: number
  icon?: string
  createdAt?: string
  updatedAt?: string
}

/** Settings are stored as individual records so additions require no migration. */
export interface SettingRecord extends EntityRecord {
  value: unknown
}

/** Minimal shape accepted by calendar and CSV exports. */
export interface ExportWorkBlock extends EntityRecord {
  date: string
  startTime: string
  endTime: string
  categoryId?: string
  activity?: string
  student?: string
  order?: string
  studentOrAssignment?: string
  vehicleClass?: string
  notes?: string
  location?: string
  calendarText?: string
  isPaid?: boolean
  createdAt?: string
  updatedAt?: string
}

/** Values calculated by the domain layer and consumed by exporters. */
export interface WorkBlockExportMetrics {
  attendanceMinutes: number
  breakMinutes: number
  /** Net working time after breaks, also for unpaid blocks. */
  workMinutes: number
  /** Billable/paid minutes; zero for unpaid blocks. */
  paidMinutes: number
  timeHours: number
  trainingHours: number
  earningsCents: number
}

export type WorkBlockMetricsResolver<T extends ExportWorkBlock> = (
  block: T,
) => WorkBlockExportMetrics

export const APP_STORE_NAMES = {
  workBlocks: 'workBlocks',
  categories: 'categories',
  settings: 'settings',
  calendarSync: 'calendarSync',
} as const

export type AppStoreName = (typeof APP_STORE_NAMES)[keyof typeof APP_STORE_NAMES]

export const DEFAULT_APP_STORES: readonly AppStoreName[] = Object.freeze(
  Object.values(APP_STORE_NAMES),
)
