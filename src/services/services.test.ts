import { describe, expect, it } from 'vitest'
import type { WorkBlockExportMetrics } from './models'
import {
  APP_STORE_NAMES,
  BackupValidationError,
  calendarSyncNeedsAttention,
  createBackupEnvelope,
  createCalendarFingerprint,
  createCalendarTemplateContext,
  createDayIcs,
  createMemoryRepository,
  createMonthIcs,
  createPendingCalendarSyncRecord,
  createWorkBlocksCsv,
  exportRepositoryBackup,
  importRepositoryBackup,
  markCalendarSynced,
  parseBackup,
  renderCalendarTemplate,
} from './index'

const block = {
  id: 'block-1',
  date: '2026-07-15',
  startTime: '21:30',
  endTime: '00:15',
  breaks: [],
  categoryId: 'practice',
  activity: 'Nachtfahrt',
  vehicleClass: 'B',
  notes: '=vertraulich',
  isPaid: true,
} as const

const metrics: WorkBlockExportMetrics = {
  attendanceMinutes: 165,
  breakMinutes: 0,
  workMinutes: 165,
  paidMinutes: 165,
  timeHours: 2.75,
  trainingHours: 3.6666666667,
  earningsCents: 8250,
}

describe('local repository and backup', () => {
  it('uses an isolated memory fallback and returns clones', async () => {
    const repository = createMemoryRepository()
    expect(await repository.ready()).toBe('memory')
    await repository.put(APP_STORE_NAMES.workBlocks, block)
    const loaded = await repository.get<typeof block>(APP_STORE_NAMES.workBlocks, block.id)
    expect(loaded).toEqual(block)
    expect(loaded).not.toBe(block)
  })

  it('round-trips a versioned repository backup and rejects invalid data before writing', async () => {
    const source = createMemoryRepository()
    await source.put(APP_STORE_NAMES.workBlocks, block)
    const sync = createPendingCalendarSyncRecord(
      block.id,
      createCalendarFingerprint(block),
      { now: '2026-07-15T20:00:00.000Z' },
    )
    await source.put(APP_STORE_NAMES.calendarSync, sync)
    const json = await exportRepositoryBackup(source, {
      appVersion: '0.1.0',
      exportedAt: '2026-07-20T10:00:00.000Z',
    })
    expect(parseBackup(json).valid).toBe(true)

    const target = createMemoryRepository()
    await importRepositoryBackup(target, json)
    expect(await target.get(APP_STORE_NAMES.workBlocks, block.id)).toEqual(block)

    await expect(importRepositoryBackup(target, '{"schemaVersion":99}')).rejects.toBeInstanceOf(
      BackupValidationError,
    )
    expect(await target.count(APP_STORE_NAMES.workBlocks)).toBe(1)
  })

  it('keeps additional JSON-safe settings fields', () => {
    const backup = createBackupEnvelope({
      workBlocks: [],
      categories: [],
      settings: [{ id: 'app', value: { futureUiOption: { enabled: true } } }],
      calendarSync: [],
    })
    expect(backup.data.settings[0].value).toEqual({ futureUiOption: { enabled: true } })
  })
})

describe('exports and calendar state', () => {
  it('renders documented German placeholders', () => {
    const context = createCalendarTemplateContext(block, metrics)
    expect(renderCalendarTemplate('{tätigkeit} · {arbeitszeit} · {verdienst}', context)).toBe(
      'Nachtfahrt · 2:45 Std. · 82,50 €',
    )
  })

  it('creates safe, German Excel-friendly CSV', () => {
    const csv = createWorkBlocksCsv([block], () => metrics)
    expect(csv.startsWith('\uFEFFID;Datum;')).toBe(true)
    expect(csv).toContain("'=vertraulich")
    expect(csv).toContain('3,67')
  })

  it('creates overnight ICS events assigned to the start day and filters scopes', () => {
    const options = { now: new Date('2026-07-20T10:00:00.000Z') }
    const day = createDayIcs([block], '2026-07-15', () => metrics, options)
    expect(day).toContain('DTSTART:20260715T213000')
    expect(day).toContain('DTEND:20260716T001500')
    expect(day).toContain('UID:block-1@fahrschulzeit.local')
    expect(createDayIcs([block], '2026-07-16', () => metrics, options)).not.toContain('BEGIN:VEVENT')
    expect(createMonthIcs([block], '2026-07', () => metrics, options)).toContain('BEGIN:VEVENT')
    day.split('\r\n').forEach((line) => {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75)
    })
  })

  it('detects changes after a successful calendar write', () => {
    const original = createCalendarFingerprint(block)
    const pending = createPendingCalendarSyncRecord(block.id, original, {
      now: '2026-07-15T20:00:00.000Z',
    })
    const synced = markCalendarSynced(pending, original, {
      externalEventId: 'event-1',
      now: '2026-07-15T20:01:00.000Z',
    })
    expect(calendarSyncNeedsAttention(synced, original)).toBe(false)
    expect(calendarSyncNeedsAttention(synced, createCalendarFingerprint({ ...block, notes: 'neu' }))).toBe(true)
  })
})
