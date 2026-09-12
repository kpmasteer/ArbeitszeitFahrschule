import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { calculateWorkBlock } from '../domain'
import {
  createCalendarFingerprint,
  createPendingCalendarSyncRecord,
  markCalendarSynced,
  markCalendarSyncError,
  markCalendarSyncModified,
  resolveCalendarSyncStatus,
  type CalendarSyncProvider,
  type CalendarSyncRecord,
  type CalendarSyncStatus,
} from '../services/calendarSync'
import { exportRepositoryBackup, importRepositoryBackup } from '../services/backup'
import { APP_STORE_NAMES, type SettingRecord } from '../services/models'
import { createLocalRepository, type RepositoryMode } from '../services/repository'
import type { AppSettings, AppWorkBlock, PaymentDraft, PaymentRecord, WorkBlockDraft, WorkCategory } from './app-types'
import { APP_VERSION, createSampleBlocks, DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './defaults'
import { currentMonthKey } from '../lib/date'
import { migratePaymentRecords } from './payment-migration'

const repository = createLocalRepository({ version: 2 })
const SETTINGS_ID = 'app-settings'
const PAYMENTS_ID = 'payment-records'

interface AppStoreContextValue {
  readonly ready: boolean
  readonly storageMode: RepositoryMode
  readonly storageError?: string
  readonly blocks: readonly AppWorkBlock[]
  readonly allBlocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly syncRecords: readonly CalendarSyncRecord[]
  readonly payments: readonly PaymentRecord[]
  readonly pendingSyncCount: number
  syncStatusFor(block: AppWorkBlock): CalendarSyncStatus
  saveBlock(draft: WorkBlockDraft): Promise<AppWorkBlock>
  importBlocks(drafts: readonly WorkBlockDraft[]): Promise<readonly AppWorkBlock[]>
  deleteBlock(id: string): Promise<void>
  savePayment(draft: PaymentDraft): Promise<PaymentRecord>
  deletePayment(id: string): Promise<void>
  updateSettings(next: AppSettings): Promise<void>
  updateCategory(category: WorkCategory): Promise<void>
  addCategory(name: string): Promise<WorkCategory>
  markSynced(blockId: string, provider: CalendarSyncProvider, externalEventId?: string): Promise<void>
  markSyncFailed(blockId: string, message: string): Promise<void>
  exportBackup(): Promise<string>
  importBackup(content: string): Promise<void>
  resetData(): Promise<void>
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null)

function createId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}

function mergeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS
  const current = value as Partial<AppSettings>
  return {
    ...DEFAULT_SETTINGS,
    ...current,
    pay: {
      ...DEFAULT_SETTINGS.pay,
      ...current.pay,
      categoryRates: {
        ...DEFAULT_SETTINGS.pay.categoryRates,
        ...current.pay?.categoryRates,
      },
    },
    calendar: {
      ...DEFAULT_SETTINGS.calendar,
      ...current.calendar,
    },
    overnightAllocation: 'start-date',
    currency: 'EUR',
    weekStartsMonday: true,
    use24Hour: true,
  }
}

function fingerprint(block: AppWorkBlock, settings: AppSettings): string {
  return createCalendarFingerprint({
    date: block.date,
    startTime: block.startTime,
    endTime: block.endTime,
    categoryId: block.categoryId,
    activity: block.activity,
    vehicleClass: block.vehicleClass,
    notes: block.notes,
    location: block.location,
    calendarText: block.calendarText,
    isPaid: block.isPaid,
    rateOverride: settings.calendar.includeEarnings ? block.rateOverride : undefined,
    calendar: settings.calendar,
  })
}

function sampleSyncRecords(blocks: readonly AppWorkBlock[], settings: AppSettings): CalendarSyncRecord[] {
  return blocks.map((block) => {
    const sourceFingerprint = fingerprint(block, settings)
    const pending = createPendingCalendarSyncRecord(block.id, sourceFingerprint, {
      provider: block.syncState === 'synced' ? 'native' : 'ics',
      eventUid: `${block.id}@fahrschulzeit.local`,
    })
    if (block.syncState === 'synced') {
      return markCalendarSynced(pending, sourceFingerprint, { externalEventId: block.calendarEventId })
    }
    if (block.syncState === 'changed') {
      const synced = markCalendarSynced(pending, 'previous-sample-fingerprint', { externalEventId: block.calendarEventId })
      return markCalendarSyncModified(synced, sourceFingerprint)
    }
    return pending
  })
}

export function AppStoreProvider({ children }: { readonly children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [storageMode, setStorageMode] = useState<RepositoryMode>('uninitialized')
  const [storageError, setStorageError] = useState<string>()
  const [allBlocks, setAllBlocks] = useState<readonly AppWorkBlock[]>([])
  const [categories, setCategories] = useState<readonly WorkCategory[]>(DEFAULT_CATEGORIES)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [syncRecords, setSyncRecords] = useState<readonly CalendarSyncRecord[]>([])
  const [payments, setPayments] = useState<readonly PaymentRecord[]>([])

  const load = useCallback(async () => {
    try {
      const mode = await repository.ready()
      setStorageMode(mode)
      if (mode === 'memory' && repository.fallbackReason) {
        setStorageError('Dauerhafte Gerätespeicherung ist gerade nicht verfügbar. Änderungen gelten nur bis zum Schließen der App.')
      }

      let [storedBlocks, storedCategories, storedSettings, storedSync, storedPayments] = await Promise.all([
        repository.getAll<AppWorkBlock>(APP_STORE_NAMES.workBlocks),
        repository.getAll<WorkCategory>(APP_STORE_NAMES.categories),
        repository.getAll<SettingRecord>(APP_STORE_NAMES.settings),
        repository.getAll<CalendarSyncRecord>(APP_STORE_NAMES.calendarSync),
        repository.getAll<PaymentRecord>(APP_STORE_NAMES.payments),
      ])

      const savedSettings = storedSettings.find((record) => record.id === SETTINGS_ID)
      const savedPayments = storedSettings.find((record) => record.id === PAYMENTS_ID)
      const nextSettings = mergeSettings(savedSettings?.value)

      if (!savedSettings) {
        const samples = createSampleBlocks(currentMonthKey())
        storedBlocks = [...samples]
        storedCategories = [...DEFAULT_CATEGORIES]
        storedSync = sampleSyncRecords(samples, nextSettings)
        await repository.replaceStores({
          [APP_STORE_NAMES.workBlocks]: storedBlocks,
          [APP_STORE_NAMES.categories]: storedCategories,
          [APP_STORE_NAMES.settings]: [{ id: SETTINGS_ID, value: nextSettings } as SettingRecord],
          [APP_STORE_NAMES.calendarSync]: storedSync,
        })
      } else if (storedCategories.length === 0) {
        storedCategories = [...DEFAULT_CATEGORIES]
        await repository.putMany(APP_STORE_NAMES.categories, storedCategories)
      }

      if (storedPayments.length === 0 && savedPayments) {
        storedPayments = migratePaymentRecords(savedPayments.value)
        await repository.putMany(APP_STORE_NAMES.payments, storedPayments)
      } else {
        const migratedPayments = migratePaymentRecords(storedPayments)
        if (JSON.stringify(migratedPayments) !== JSON.stringify(storedPayments)) {
          await repository.putMany(APP_STORE_NAMES.payments, migratedPayments)
        }
        storedPayments = migratedPayments
      }

      setAllBlocks(storedBlocks)
      setCategories(storedCategories.sort((left, right) => left.sortOrder - right.sortOrder))
      setSettings(nextSettings)
      setSyncRecords(storedSync)
      setPayments(storedPayments)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Lokale Daten konnten nicht geladen werden.')
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => repository.close()
  }, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const blocks = useMemo(
    () => settings.showSampleData ? allBlocks : allBlocks.filter((block) => !block.sample),
    [allBlocks, settings.showSampleData],
  )

  const syncStatusFor = useCallback((block: AppWorkBlock): CalendarSyncStatus => {
    const record = syncRecords.find((entry) => entry.workBlockId === block.id)
    return resolveCalendarSyncStatus(record, fingerprint(block, settings))
  }, [settings, syncRecords])

  const pendingSyncCount = useMemo(
    () => blocks.reduce((total, block) => total + (syncStatusFor(block) === 'synced' ? 0 : 1), 0),
    [blocks, syncStatusFor],
  )

  const saveBlock = useCallback(async (draft: WorkBlockDraft): Promise<AppWorkBlock> => {
    const existing = draft.id ? allBlocks.find((block) => block.id === draft.id) : undefined
    const now = new Date().toISOString()
    const block: AppWorkBlock = {
      id: existing?.id ?? createId('block'),
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      breaks: draft.breaks,
      categoryId: draft.categoryId,
      rateOverride: draft.rateOverride,
      isPaid: draft.isPaid,
      activity: draft.activity,
      vehicleClass: draft.vehicleClass,
      studentOrAssignment: draft.studentOrAssignment,
      notes: draft.notes,
      location: draft.location,
      calendarText: draft.calendarText,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sample: false,
    }
    calculateWorkBlock(block, settings.pay)
    await repository.put(APP_STORE_NAMES.workBlocks, block)
    setAllBlocks((current) => existing
      ? current.map((entry) => entry.id === block.id ? block : entry)
      : [...current, block])

    const sourceFingerprint = fingerprint(block, settings)
    const currentSync = syncRecords.find((record) => record.workBlockId === block.id)
    const nextSync = currentSync
      ? markCalendarSyncModified(currentSync, sourceFingerprint)
      : createPendingCalendarSyncRecord(block.id, sourceFingerprint, {
          provider: 'ics',
          eventUid: `${block.id}@fahrschulzeit.local`,
        })
    await repository.put(APP_STORE_NAMES.calendarSync, nextSync)
    setSyncRecords((current) => currentSync
      ? current.map((record) => record.id === nextSync.id ? nextSync : record)
      : [...current, nextSync])
    return block
  }, [allBlocks, settings, syncRecords])

  const importBlocks = useCallback(async (drafts: readonly WorkBlockDraft[]): Promise<readonly AppWorkBlock[]> => {
    const now = new Date().toISOString()
    const imported = drafts.map((draft, index): AppWorkBlock => {
      const block: AppWorkBlock = {
        ...draft,
        id: createId(`import-${index + 1}`),
        createdAt: now,
        updatedAt: now,
        sample: false,
      }
      calculateWorkBlock(block, settings.pay)
      return block
    })
    const records = imported.map((block) => createPendingCalendarSyncRecord(
      block.id,
      fingerprint(block, settings),
      { provider: 'ics', eventUid: `${block.id}@fahrschulzeit.local` },
    ))
    await Promise.all([
      repository.putMany(APP_STORE_NAMES.workBlocks, imported),
      repository.putMany(APP_STORE_NAMES.calendarSync, records),
    ])
    setAllBlocks((current) => [...current, ...imported])
    setSyncRecords((current) => [...current, ...records])
    return imported
  }, [settings])

  const deleteBlock = useCallback(async (id: string): Promise<void> => {
    await Promise.all([
      repository.remove(APP_STORE_NAMES.workBlocks, id),
      repository.remove(APP_STORE_NAMES.calendarSync, id),
    ])
    setAllBlocks((current) => current.filter((block) => block.id !== id))
    setSyncRecords((current) => current.filter((record) => record.workBlockId !== id))
  }, [])

  const savePayment = useCallback(async (draft: PaymentDraft): Promise<PaymentRecord> => {
    if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) {
      throw new RangeError('Der Zahlungseingang muss größer als 0 € sein.')
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.salaryMonth)) {
      throw new RangeError('Bitte einen gültigen Lohnmonat auswählen.')
    }
    const existing = draft.id ? payments.find((payment) => payment.id === draft.id) : undefined
    const now = new Date().toISOString()
    const payment: PaymentRecord = {
      id: existing?.id ?? createId('payment'),
      paymentDate: draft.paymentDate,
      salaryMonth: draft.salaryMonth,
      amountCents: draft.amountCents,
      note: draft.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await repository.put(APP_STORE_NAMES.payments, payment)
    setPayments((current) => existing
      ? current.map((entry) => entry.id === payment.id ? payment : entry)
      : [...current, payment])
    return payment
  }, [payments])

  const deletePayment = useCallback(async (id: string): Promise<void> => {
    await repository.remove(APP_STORE_NAMES.payments, id)
    setPayments((current) => current.filter((payment) => payment.id !== id))
  }, [])

  const updateSettings = useCallback(async (next: AppSettings): Promise<void> => {
    const merged = mergeSettings(next)
    const calendarChanged = JSON.stringify(settings.calendar) !== JSON.stringify(merged.calendar)
    await repository.put<SettingRecord>(APP_STORE_NAMES.settings, { id: SETTINGS_ID, value: merged })
    setSettings(merged)
    if (calendarChanged && syncRecords.length > 0) {
      const blockMap = new Map(allBlocks.map((block) => [block.id, block]))
      const updated = syncRecords.map((record) => {
        const block = blockMap.get(record.workBlockId)
        return block ? markCalendarSyncModified(record, fingerprint(block, merged)) : record
      })
      await repository.putMany(APP_STORE_NAMES.calendarSync, updated)
      setSyncRecords(updated)
    }
  }, [allBlocks, settings.calendar, syncRecords])

  const updateCategory = useCallback(async (category: WorkCategory): Promise<void> => {
    await repository.put(APP_STORE_NAMES.categories, category)
    setCategories((current) => current
      .map((entry) => entry.id === category.id ? category : entry)
      .sort((left, right) => left.sortOrder - right.sortOrder))
    const rates = Object.fromEntries(
      [...categories.filter((entry) => entry.id !== category.id), category]
        .filter((entry) => entry.rate !== undefined)
        .map((entry) => [entry.id, entry.rate!]),
    )
    const nextSettings = { ...settings, pay: { ...settings.pay, categoryRates: rates } }
    await repository.put<SettingRecord>(APP_STORE_NAMES.settings, { id: SETTINGS_ID, value: nextSettings })
    setSettings(nextSettings)
  }, [categories, settings])

  const addCategory = useCallback(async (name: string): Promise<WorkCategory> => {
    const colors = ['#b4232d', '#365b86', '#527064', '#a96c32', '#725a9c', '#6d6b68']
    const category: WorkCategory = {
      id: createId('category'),
      name: name.trim() || 'Neue Tätigkeit',
      color: colors[categories.length % colors.length],
      icon: 'shapes',
      active: true,
      sortOrder: categories.length,
    }
    await repository.put(APP_STORE_NAMES.categories, category)
    setCategories((current) => [...current, category])
    return category
  }, [categories.length])

  const markSynced = useCallback(async (
    blockId: string,
    provider: CalendarSyncProvider,
    externalEventId?: string,
  ): Promise<void> => {
    const block = allBlocks.find((entry) => entry.id === blockId)
    if (!block) throw new Error('Arbeitsblock wurde nicht gefunden.')
    const sourceFingerprint = fingerprint(block, settings)
    const current = syncRecords.find((record) => record.workBlockId === blockId)
      ?? createPendingCalendarSyncRecord(blockId, sourceFingerprint, { provider })
    const next = markCalendarSynced(current, sourceFingerprint, {
      provider,
      externalEventId,
      targetCalendarId: settings.calendar.targetCalendarId,
    })
    await repository.put(APP_STORE_NAMES.calendarSync, next)
    setSyncRecords((records) => records.some((record) => record.id === next.id)
      ? records.map((record) => record.id === next.id ? next : record)
      : [...records, next])
  }, [allBlocks, settings, syncRecords])

  const markSyncFailed = useCallback(async (blockId: string, message: string): Promise<void> => {
    const block = allBlocks.find((entry) => entry.id === blockId)
    if (!block) return
    const current = syncRecords.find((record) => record.workBlockId === blockId)
      ?? createPendingCalendarSyncRecord(blockId, fingerprint(block, settings))
    const next = markCalendarSyncError(current, message)
    await repository.put(APP_STORE_NAMES.calendarSync, next)
    setSyncRecords((records) => records.some((record) => record.id === next.id)
      ? records.map((record) => record.id === next.id ? next : record)
      : [...records, next])
  }, [allBlocks, settings, syncRecords])

  const exportBackup = useCallback(
    () => exportRepositoryBackup(repository, { appVersion: APP_VERSION }),
    [],
  )

  const importBackup = useCallback(async (content: string): Promise<void> => {
    await importRepositoryBackup(repository, content, { mode: 'replace' })
    setReady(false)
    await load()
  }, [load])

  const resetData = useCallback(async (): Promise<void> => {
    const cleanSettings: AppSettings = { ...DEFAULT_SETTINGS, showSampleData: false }
    await repository.replaceStores({
      [APP_STORE_NAMES.workBlocks]: [],
      [APP_STORE_NAMES.categories]: [...DEFAULT_CATEGORIES],
      [APP_STORE_NAMES.settings]: [{ id: SETTINGS_ID, value: cleanSettings } as SettingRecord],
      [APP_STORE_NAMES.calendarSync]: [],
      [APP_STORE_NAMES.payments]: [],
    })
    setAllBlocks([])
    setCategories(DEFAULT_CATEGORIES)
    setSettings(cleanSettings)
    setSyncRecords([])
    setPayments([])
  }, [])

  const value = useMemo<AppStoreContextValue>(() => ({
    ready,
    storageMode,
    storageError,
    blocks,
    allBlocks,
    categories,
    settings,
    syncRecords,
    payments,
    pendingSyncCount,
    syncStatusFor,
    saveBlock,
    importBlocks,
    deleteBlock,
    savePayment,
    deletePayment,
    updateSettings,
    updateCategory,
    addCategory,
    markSynced,
    markSyncFailed,
    exportBackup,
    importBackup,
    resetData,
  }), [
    ready,
    storageMode,
    storageError,
    blocks,
    allBlocks,
    categories,
    settings,
    syncRecords,
    payments,
    pendingSyncCount,
    syncStatusFor,
    saveBlock,
    importBlocks,
    deleteBlock,
    savePayment,
    deletePayment,
    updateSettings,
    updateCategory,
    addCategory,
    markSynced,
    markSyncFailed,
    exportBackup,
    importBackup,
    resetData,
  ])

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreContextValue {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('useAppStore muss innerhalb des AppStoreProvider verwendet werden.')
  return value
}
