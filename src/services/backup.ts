import type { CalendarSyncRecord } from './calendarSync'
import {
  APP_STORE_NAMES,
  type BackupCategory,
  type BackupWorkBlock,
  type EntityRecord,
  type SettingRecord,
} from './models'
import type { LocalRepository } from './repository'
import {
  cloneValue,
  isIsoDate,
  isIsoDateTime,
  isJsonValue,
  isPlainObject,
  isTime,
} from './serviceUtils'

export const BACKUP_FORMAT = 'fahrschulzeit-backup' as const
export const BACKUP_SCHEMA_VERSION = 1 as const

export interface BackupDataV1 {
  readonly workBlocks: readonly BackupWorkBlock[]
  readonly categories: readonly BackupCategory[]
  readonly settings: readonly SettingRecord[]
  readonly calendarSync: readonly CalendarSyncRecord[]
}

export interface BackupEnvelopeV1 {
  format: typeof BACKUP_FORMAT
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  appVersion: string
  exportedAt: string
  data: BackupDataV1
}

export interface BackupValidationIssue {
  path: string
  code:
    | 'invalid_json'
    | 'invalid_type'
    | 'invalid_value'
    | 'missing_field'
    | 'unsupported_version'
    | 'duplicate_id'
    | 'too_large'
  message: string
}

export type BackupValidationResult =
  | { valid: true; backup: BackupEnvelopeV1; issues: [] }
  | { valid: false; backup?: undefined; issues: BackupValidationIssue[] }

export interface BackupParseOptions {
  maxBytes?: number
  maxRecords?: number
}

export interface CreateBackupOptions {
  appVersion?: string
  exportedAt?: Date | string
  pretty?: boolean
}

export interface ImportBackupOptions extends BackupParseOptions {
  mode?: 'replace' | 'merge'
}

export interface ImportBackupResult {
  mode: 'replace' | 'merge'
  counts: {
    workBlocks: number
    categories: number
    settings: number
    calendarSync: number
  }
  exportedAt: string
  sourceAppVersion: string
}

export class BackupValidationError extends Error {
  readonly issues: BackupValidationIssue[]

  constructor(issues: BackupValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'))
    this.name = 'BackupValidationError'
    this.issues = issues
  }
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_RECORDS = 100_000
const SYNC_STATUSES = new Set(['pending', 'synced', 'modified', 'missing', 'error'])
const SYNC_PROVIDERS = new Set(['ics', 'native'])

function issue(
  issues: BackupValidationIssue[],
  path: string,
  code: BackupValidationIssue['code'],
  message: string,
): void {
  // Avoid building an unbounded error list for hostile/corrupt files.
  if (issues.length < 200) issues.push({ path, code, message })
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && isIsoDateTime(value)
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
): string | undefined {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    issue(issues, `${path}.${key}`, value === undefined ? 'missing_field' : 'invalid_type', 'Nicht leerer Text erwartet.')
    return undefined
  }
  return value
}

function validateOptionalTimestamp(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
): void {
  const value = record[key]
  if (value !== undefined && !validTimestamp(value)) {
    issue(issues, `${path}.${key}`, 'invalid_value', 'Gültiger ISO-Zeitstempel erwartet.')
  }
}

function validateOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
): void {
  const value = record[key]
  if (value !== undefined && typeof value !== 'string') {
    issue(issues, `${path}.${key}`, 'invalid_type', 'Text erwartet.')
  }
}

function validateJsonRecord(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    issue(issues, path, 'invalid_type', 'Objekt erwartet.')
    return false
  }
  if (!isJsonValue(value)) {
    issue(issues, path, 'invalid_value', 'Datensatz enthält nicht JSON-kompatible Werte.')
    return false
  }
  return true
}

function validateWorkBlock(
  value: unknown,
  index: number,
  issues: BackupValidationIssue[],
): value is BackupWorkBlock {
  const path = `data.workBlocks[${index}]`
  if (!validateJsonRecord(value, path, issues)) return false
  requireString(value, 'id', path, issues)
  if (!isIsoDate(value.date)) {
    issue(issues, `${path}.date`, 'invalid_value', 'Datum im Format YYYY-MM-DD erwartet.')
  }
  if (!isTime(value.startTime)) {
    issue(issues, `${path}.startTime`, 'invalid_value', 'Uhrzeit im Format HH:MM erwartet.')
  }
  if (!isTime(value.endTime)) {
    issue(issues, `${path}.endTime`, 'invalid_value', 'Uhrzeit im Format HH:MM erwartet.')
  }
  if (!Array.isArray(value.breaks)) {
    issue(issues, `${path}.breaks`, 'invalid_type', 'Pausenliste erwartet.')
  } else {
    value.breaks.forEach((candidate, breakIndex) => {
      const breakPath = `${path}.breaks[${breakIndex}]`
      if (!isPlainObject(candidate)) {
        issue(issues, breakPath, 'invalid_type', 'Pausenobjekt erwartet.')
      } else if (candidate.kind === 'duration') {
        if (!Number.isInteger(candidate.minutes) || Number(candidate.minutes) < 0) {
          issue(issues, `${breakPath}.minutes`, 'invalid_value', 'Nichtnegative ganze Minutenzahl erwartet.')
        }
      } else if (candidate.kind === 'interval') {
        if (!isTime(candidate.startTime) || !isTime(candidate.endTime)) {
          issue(issues, breakPath, 'invalid_value', 'Pausenbeginn und -ende müssen HH:MM entsprechen.')
        }
      } else {
        issue(issues, `${breakPath}.kind`, 'invalid_value', 'Pausenart „duration“ oder „interval“ erwartet.')
      }
    })
  }
  if (value.rateOverride !== undefined && (
    typeof value.rateOverride !== 'number' ||
    !Number.isFinite(value.rateOverride) ||
    value.rateOverride < 0
  )) {
    issue(issues, `${path}.rateOverride`, 'invalid_value', 'Nichtnegative endliche Zahl erwartet.')
  }
  if (value.isPaid !== undefined && typeof value.isPaid !== 'boolean') {
    issue(issues, `${path}.isPaid`, 'invalid_type', 'Boolean erwartet.')
  }
  ;[
    'categoryId',
    'activity',
    'student',
    'order',
    'studentOrAssignment',
    'vehicleClass',
    'notes',
    'location',
    'calendarText',
  ].forEach((key) => validateOptionalString(value, key, path, issues))
  validateOptionalTimestamp(value, 'createdAt', path, issues)
  validateOptionalTimestamp(value, 'updatedAt', path, issues)
  return true
}

function validateCategory(
  value: unknown,
  index: number,
  issues: BackupValidationIssue[],
): value is BackupCategory {
  const path = `data.categories[${index}]`
  if (!validateJsonRecord(value, path, issues)) return false
  requireString(value, 'id', path, issues)
  requireString(value, 'name', path, issues)
  if (value.rate !== undefined && (
    typeof value.rate !== 'number' || !Number.isFinite(value.rate) || value.rate < 0
  )) {
    issue(issues, `${path}.rate`, 'invalid_value', 'Nichtnegative endliche Zahl erwartet.')
  }
  if (value.sortOrder !== undefined && !Number.isFinite(value.sortOrder as number)) {
    issue(issues, `${path}.sortOrder`, 'invalid_value', 'Endliche Zahl erwartet.')
  }
  if (value.active !== undefined && typeof value.active !== 'boolean') {
    issue(issues, `${path}.active`, 'invalid_type', 'Boolean erwartet.')
  }
  ;['icon', 'color'].forEach((key) => validateOptionalString(value, key, path, issues))
  validateOptionalTimestamp(value, 'createdAt', path, issues)
  validateOptionalTimestamp(value, 'updatedAt', path, issues)
  return true
}

function validateSetting(
  value: unknown,
  index: number,
  issues: BackupValidationIssue[],
): value is SettingRecord {
  const path = `data.settings[${index}]`
  if (!validateJsonRecord(value, path, issues)) return false
  requireString(value, 'id', path, issues)
  if (!Object.hasOwn(value, 'value')) {
    issue(issues, `${path}.value`, 'missing_field', 'Einstellungswert fehlt.')
  } else if (!isJsonValue(value.value)) {
    issue(issues, `${path}.value`, 'invalid_value', 'JSON-kompatibler Einstellungswert erwartet.')
  }
  return true
}

function validateCalendarSync(
  value: unknown,
  index: number,
  issues: BackupValidationIssue[],
): value is CalendarSyncRecord {
  const path = `data.calendarSync[${index}]`
  if (!validateJsonRecord(value, path, issues)) return false
  requireString(value, 'id', path, issues)
  requireString(value, 'workBlockId', path, issues)
  requireString(value, 'sourceFingerprint', path, issues)
  if (!SYNC_STATUSES.has(String(value.status))) {
    issue(issues, `${path}.status`, 'invalid_value', 'Unbekannter Synchronisationsstatus.')
  }
  if (!SYNC_PROVIDERS.has(String(value.provider))) {
    issue(issues, `${path}.provider`, 'invalid_value', 'Kalenderanbieter „ics“ oder „native“ erwartet.')
  }
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 0) {
    issue(issues, `${path}.sequence`, 'invalid_value', 'Nichtnegative ganze Sequenznummer erwartet.')
  }
  ;[
    'targetCalendarId',
    'externalEventId',
    'eventUid',
    'syncedFingerprint',
  ].forEach((key) => validateOptionalString(value, key, path, issues))
  ;['createdAt', 'updatedAt', 'lastAttemptAt', 'lastSyncedAt'].forEach((key) =>
    validateOptionalTimestamp(value, key, path, issues),
  )
  if (!validTimestamp(value.createdAt)) {
    issue(issues, `${path}.createdAt`, 'missing_field', 'Gültiger Erstellungszeitpunkt erforderlich.')
  }
  if (!validTimestamp(value.updatedAt)) {
    issue(issues, `${path}.updatedAt`, 'missing_field', 'Gültiger Änderungszeitpunkt erforderlich.')
  }
  if (value.error !== undefined) {
    if (!isPlainObject(value.error)) {
      issue(issues, `${path}.error`, 'invalid_type', 'Fehlerobjekt erwartet.')
    } else {
      requireString(value.error, 'code', `${path}.error`, issues)
      requireString(value.error, 'message', `${path}.error`, issues)
      if (!validTimestamp(value.error.occurredAt)) {
        issue(issues, `${path}.error.occurredAt`, 'invalid_value', 'Gültiger ISO-Zeitstempel erwartet.')
      }
      if (typeof value.error.retryable !== 'boolean') {
        issue(issues, `${path}.error.retryable`, 'invalid_type', 'Boolean erwartet.')
      }
    }
  }
  return true
}

function validateUniqueIds(
  records: readonly unknown[],
  path: string,
  issues: BackupValidationIssue[],
): void {
  const seen = new Set<string>()
  records.forEach((record, index) => {
    if (!isPlainObject(record) || typeof record.id !== 'string') return
    if (seen.has(record.id)) {
      issue(issues, `${path}[${index}].id`, 'duplicate_id', `Doppelte ID „${record.id}“.`)
    }
    seen.add(record.id)
  })
}

export function validateBackup(
  input: unknown,
  options: BackupParseOptions = {},
): BackupValidationResult {
  const issues: BackupValidationIssue[] = []
  if (!isPlainObject(input)) {
    issue(issues, '$', 'invalid_type', 'Backup-Objekt erwartet.')
    return { valid: false, issues }
  }
  if (input.format !== BACKUP_FORMAT) {
    issue(issues, 'format', 'invalid_value', `Format „${BACKUP_FORMAT}“ erwartet.`)
  }
  if (input.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    issue(
      issues,
      'schemaVersion',
      'unsupported_version',
      `Backup-Schema ${String(input.schemaVersion)} wird nicht unterstützt. Erwartet wird Version ${BACKUP_SCHEMA_VERSION}.`,
    )
  }
  requireString(input, 'appVersion', '$', issues)
  if (!validTimestamp(input.exportedAt)) {
    issue(issues, 'exportedAt', 'invalid_value', 'Gültiger ISO-Zeitstempel erwartet.')
  }
  if (!isPlainObject(input.data)) {
    issue(issues, 'data', 'invalid_type', 'Backup-Datenobjekt erwartet.')
    return { valid: false, issues }
  }
  const data = input.data

  const collections = ['workBlocks', 'categories', 'settings', 'calendarSync'] as const
  collections.forEach((key) => {
    if (!Array.isArray(data[key])) {
      issue(issues, `data.${key}`, 'invalid_type', 'Liste erwartet.')
    }
  })
  if (issues.some((entry) => entry.code === 'invalid_type' && entry.path.startsWith('data.'))) {
    return { valid: false, issues }
  }

  const workBlocks = data.workBlocks as unknown[]
  const categories = data.categories as unknown[]
  const settings = data.settings as unknown[]
  const calendarSync = data.calendarSync as unknown[]
  const recordCount = workBlocks.length + categories.length + settings.length + calendarSync.length
  if (recordCount > (options.maxRecords ?? DEFAULT_MAX_RECORDS)) {
    issue(issues, 'data', 'too_large', 'Backup enthält zu viele Datensätze.')
    return { valid: false, issues }
  }

  workBlocks.forEach((value, index) => validateWorkBlock(value, index, issues))
  categories.forEach((value, index) => validateCategory(value, index, issues))
  settings.forEach((value, index) => validateSetting(value, index, issues))
  calendarSync.forEach((value, index) => validateCalendarSync(value, index, issues))
  collections.forEach((key) => validateUniqueIds(data[key] as unknown[], `data.${key}`, issues))

  if (issues.length > 0) return { valid: false, issues }
  return { valid: true, backup: cloneValue(input as unknown as BackupEnvelopeV1), issues: [] }
}

export function parseBackup(
  input: string | unknown,
  options: BackupParseOptions = {},
): BackupValidationResult {
  let value = input
  if (typeof input === 'string') {
    const bytes = typeof TextEncoder === 'undefined'
      ? input.length * 2
      : new TextEncoder().encode(input).byteLength
    if (bytes > (options.maxBytes ?? DEFAULT_MAX_BYTES)) {
      return {
        valid: false,
        issues: [{ path: '$', code: 'too_large', message: 'Backup-Datei ist zu groß.' }],
      }
    }
    try {
      value = JSON.parse(input.replace(/^\uFEFF/u, '')) as unknown
    } catch {
      return {
        valid: false,
        issues: [{ path: '$', code: 'invalid_json', message: 'Datei enthält kein gültiges JSON.' }],
      }
    }
  }
  return validateBackup(value, options)
}

function normalizeTimestamp(value: Date | string | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date()
  if (!Number.isFinite(date.getTime())) throw new RangeError('Ungültiger Exportzeitpunkt.')
  return date.toISOString()
}

export function createBackupEnvelope(
  data: BackupDataV1,
  options: CreateBackupOptions = {},
): BackupEnvelopeV1 {
  // JSON round-trip intentionally removes undefined optional UI fields while
  // retaining every additional JSON-compatible property.
  let normalizedData: BackupDataV1
  try {
    normalizedData = JSON.parse(JSON.stringify(data)) as BackupDataV1
  } catch (error) {
    throw new TypeError(`Backup-Daten sind nicht serialisierbar: ${String(error)}`)
  }
  const backup: BackupEnvelopeV1 = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion ?? '0.1.0',
    exportedAt: normalizeTimestamp(options.exportedAt),
    data: normalizedData,
  }
  const result = validateBackup(backup)
  if (!result.valid) throw new BackupValidationError(result.issues)
  return result.backup
}

export function serializeBackup(
  data: BackupDataV1,
  options: CreateBackupOptions = {},
): string {
  const backup = createBackupEnvelope(data, options)
  return `${JSON.stringify(backup, null, options.pretty === false ? undefined : 2)}\n`
}

export async function exportRepositoryBackup(
  repository: LocalRepository,
  options: CreateBackupOptions = {},
): Promise<string> {
  const stores = await repository.dumpStores([
    APP_STORE_NAMES.workBlocks,
    APP_STORE_NAMES.categories,
    APP_STORE_NAMES.settings,
    APP_STORE_NAMES.calendarSync,
  ])
  return serializeBackup(
    {
      workBlocks: stores[APP_STORE_NAMES.workBlocks] as BackupWorkBlock[],
      categories: stores[APP_STORE_NAMES.categories] as BackupCategory[],
      settings: stores[APP_STORE_NAMES.settings] as SettingRecord[],
      calendarSync: stores[APP_STORE_NAMES.calendarSync] as CalendarSyncRecord[],
    },
    options,
  )
}

function mergeById<T extends EntityRecord>(
  current: readonly T[],
  imported: readonly T[],
): T[] {
  const merged = new Map(current.map((record) => [record.id, cloneValue(record)]))
  imported.forEach((record) => merged.set(record.id, cloneValue(record)))
  return [...merged.values()]
}

export async function importRepositoryBackup(
  repository: LocalRepository,
  input: string | unknown,
  options: ImportBackupOptions = {},
): Promise<ImportBackupResult> {
  const parsed = parseBackup(input, options)
  if (!parsed.valid) throw new BackupValidationError(parsed.issues)
  const mode = options.mode ?? 'replace'
  let data = parsed.backup.data
  if (mode === 'merge') {
    const current = await repository.dumpStores([
      APP_STORE_NAMES.workBlocks,
      APP_STORE_NAMES.categories,
      APP_STORE_NAMES.settings,
      APP_STORE_NAMES.calendarSync,
    ])
    data = {
      workBlocks: mergeById(current[APP_STORE_NAMES.workBlocks] as BackupWorkBlock[], data.workBlocks),
      categories: mergeById(current[APP_STORE_NAMES.categories] as BackupCategory[], data.categories),
      settings: mergeById(current[APP_STORE_NAMES.settings] as SettingRecord[], data.settings),
      calendarSync: mergeById(current[APP_STORE_NAMES.calendarSync] as CalendarSyncRecord[], data.calendarSync),
    }
  }
  await repository.replaceStores({
    [APP_STORE_NAMES.workBlocks]: data.workBlocks,
    [APP_STORE_NAMES.categories]: data.categories,
    [APP_STORE_NAMES.settings]: data.settings,
    [APP_STORE_NAMES.calendarSync]: data.calendarSync,
  })
  return {
    mode,
    counts: {
      workBlocks: data.workBlocks.length,
      categories: data.categories.length,
      settings: data.settings.length,
      calendarSync: data.calendarSync.length,
    },
    exportedAt: parsed.backup.exportedAt,
    sourceAppVersion: parsed.backup.appVersion,
  }
}
