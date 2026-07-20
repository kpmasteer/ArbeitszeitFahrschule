import type { EntityRecord } from './models'
import { stableStringify } from './serviceUtils'

export type CalendarSyncStatus = 'pending' | 'synced' | 'modified' | 'missing' | 'error'
export type CalendarSyncProvider = 'ics' | 'native'

export interface CalendarSyncError {
  code: string
  message: string
  occurredAt: string
  retryable: boolean
}

/** Persisted one-to-one mapping between a work block and an external event. */
export interface CalendarSyncRecord extends EntityRecord {
  workBlockId: string
  provider: CalendarSyncProvider
  status: CalendarSyncStatus
  targetCalendarId?: string
  externalEventId?: string
  eventUid?: string
  sourceFingerprint: string
  syncedFingerprint?: string
  sequence: number
  createdAt: string
  updatedAt: string
  lastAttemptAt?: string
  lastSyncedAt?: string
  error?: CalendarSyncError
}

export interface CreateCalendarSyncRecordOptions {
  provider?: CalendarSyncProvider
  targetCalendarId?: string
  eventUid?: string
  now?: Date | string
}

export interface MarkCalendarSyncedOptions {
  externalEventId?: string
  eventUid?: string
  targetCalendarId?: string
  provider?: CalendarSyncProvider
  now?: Date | string
}

export interface MarkCalendarSyncErrorOptions {
  code?: string
  retryable?: boolean
  now?: Date | string
}

export interface CalendarSyncSummary {
  total: number
  pending: number
  synced: number
  modified: number
  missing: number
  error: number
  needsAttention: number
}

function timestamp(value: Date | string | undefined): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new RangeError('Ungültiger Zeitstempel.')
    return value.toISOString()
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isFinite(parsed.getTime())) throw new RangeError('Ungültiger Zeitstempel.')
    return parsed.toISOString()
  }
  return new Date().toISOString()
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Stable, non-cryptographic revision marker used only for change detection.
 * Callers should pass the calendar-relevant subset when UI-only fields should
 * not mark an event as modified.
 */
export function createCalendarFingerprint(value: unknown): string {
  return `v1-${fnv1a(stableStringify(value))}`
}

export function createPendingCalendarSyncRecord(
  workBlockId: string,
  sourceFingerprint: string,
  options: CreateCalendarSyncRecordOptions = {},
): CalendarSyncRecord {
  if (!workBlockId.trim()) throw new TypeError('Eine Arbeitsblock-ID ist erforderlich.')
  if (!sourceFingerprint.trim()) throw new TypeError('Ein Quell-Fingerprint ist erforderlich.')
  const now = timestamp(options.now)
  return {
    id: workBlockId,
    workBlockId,
    provider: options.provider ?? 'ics',
    status: 'pending',
    targetCalendarId: options.targetCalendarId,
    eventUid: options.eventUid,
    sourceFingerprint,
    sequence: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Resolves a persisted status against the current work-block fingerprint. */
export function resolveCalendarSyncStatus(
  record: CalendarSyncRecord | undefined,
  currentFingerprint?: string,
): CalendarSyncStatus {
  if (!record) return 'pending'
  if (
    currentFingerprint &&
    record.syncedFingerprint &&
    currentFingerprint !== record.syncedFingerprint &&
    (record.status === 'synced' || record.status === 'modified')
  ) {
    return 'modified'
  }
  return record.status
}

export function markCalendarSyncModified(
  record: CalendarSyncRecord,
  sourceFingerprint: string,
  now?: Date | string,
): CalendarSyncRecord {
  const changed = sourceFingerprint !== record.syncedFingerprint
  return {
    ...record,
    sourceFingerprint,
    status: record.syncedFingerprint ? (changed ? 'modified' : 'synced') : 'pending',
    updatedAt: timestamp(now),
    error: undefined,
  }
}

export function markCalendarSynced(
  record: CalendarSyncRecord,
  sourceFingerprint = record.sourceFingerprint,
  options: MarkCalendarSyncedOptions = {},
): CalendarSyncRecord {
  const now = timestamp(options.now)
  return {
    ...record,
    provider: options.provider ?? record.provider,
    status: 'synced',
    targetCalendarId: options.targetCalendarId ?? record.targetCalendarId,
    externalEventId: options.externalEventId ?? record.externalEventId,
    eventUid: options.eventUid ?? record.eventUid,
    sourceFingerprint,
    syncedFingerprint: sourceFingerprint,
    sequence: record.sequence + (record.lastSyncedAt ? 1 : 0),
    updatedAt: now,
    lastAttemptAt: now,
    lastSyncedAt: now,
    error: undefined,
  }
}

export function markCalendarEventMissing(
  record: CalendarSyncRecord,
  now?: Date | string,
): CalendarSyncRecord {
  const updatedAt = timestamp(now)
  return {
    ...record,
    status: 'missing',
    externalEventId: undefined,
    updatedAt,
    lastAttemptAt: updatedAt,
    error: undefined,
  }
}

export function markCalendarSyncError(
  record: CalendarSyncRecord,
  message: string,
  options: MarkCalendarSyncErrorOptions = {},
): CalendarSyncRecord {
  if (!message.trim()) throw new TypeError('Eine Fehlermeldung ist erforderlich.')
  const updatedAt = timestamp(options.now)
  return {
    ...record,
    status: 'error',
    updatedAt,
    lastAttemptAt: updatedAt,
    error: {
      code: options.code ?? 'CALENDAR_SYNC_FAILED',
      message,
      occurredAt: updatedAt,
      retryable: options.retryable ?? true,
    },
  }
}

export function resetCalendarSync(
  record: CalendarSyncRecord,
  sourceFingerprint = record.sourceFingerprint,
  now?: Date | string,
): CalendarSyncRecord {
  return {
    ...record,
    status: 'pending',
    externalEventId: undefined,
    syncedFingerprint: undefined,
    sourceFingerprint,
    sequence: 0,
    updatedAt: timestamp(now),
    lastAttemptAt: undefined,
    lastSyncedAt: undefined,
    error: undefined,
  }
}

export function calendarSyncNeedsAttention(
  record: CalendarSyncRecord | undefined,
  currentFingerprint?: string,
): boolean {
  return resolveCalendarSyncStatus(record, currentFingerprint) !== 'synced'
}

export function summarizeCalendarSync(
  records: readonly CalendarSyncRecord[],
): CalendarSyncSummary {
  const summary: CalendarSyncSummary = {
    total: records.length,
    pending: 0,
    synced: 0,
    modified: 0,
    missing: 0,
    error: 0,
    needsAttention: 0,
  }
  records.forEach((record) => {
    summary[record.status] += 1
    if (record.status !== 'synced') summary.needsAttention += 1
  })
  return summary
}
