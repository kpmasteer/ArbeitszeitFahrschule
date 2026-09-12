import { describe, expect, it } from 'vitest'
import { APP_STORE_NAMES, createMemoryRepository, exportRepositoryBackup, importRepositoryBackup, parseBackup } from './index'

describe('Lohnkontrolle im Backup', () => {
  it('exportiert Zahlungen und Startsaldo und liest Schema 1 weiterhin', async () => {
    const repository = createMemoryRepository()
    await repository.put(APP_STORE_NAMES.settings, {
      id: 'app-settings', value: { payControlStartingBalanceCents: -10000 },
    })
    await repository.put(APP_STORE_NAMES.payments, {
      id: 'payment-1', paymentDate: '2026-02-28', salaryMonth: '2026-01', amountCents: 50000,
      note: 'Teilzahlung', createdAt: '2026-02-28T12:00:00.000Z', updatedAt: '2026-02-28T12:00:00.000Z',
    })

    const current = parseBackup(await exportRepositoryBackup(repository))
    expect(current.valid && current.backup.data.payments).toHaveLength(1)
    expect(current.valid && current.backup.data.settings[0].value).toEqual({ payControlStartingBalanceCents: -10000 })
    const restored = createMemoryRepository()
    await importRepositoryBackup(restored, await exportRepositoryBackup(repository))
    expect(await restored.get(APP_STORE_NAMES.payments, 'payment-1')).toEqual(await repository.get(APP_STORE_NAMES.payments, 'payment-1'))
    expect(await restored.get(APP_STORE_NAMES.settings, 'app-settings')).toEqual(await repository.get(APP_STORE_NAMES.settings, 'app-settings'))

    const legacy = parseBackup({
      format: 'fahrschulzeit-backup', schemaVersion: 1, appVersion: '0.1.1',
      exportedAt: '2026-07-20T10:00:00.000Z',
      data: { workBlocks: [], categories: [], settings: [], calendarSync: [] },
    })
    expect(legacy.valid).toBe(true)
    expect(legacy.valid && legacy.backup.data.payments).toEqual([])
  })
})
