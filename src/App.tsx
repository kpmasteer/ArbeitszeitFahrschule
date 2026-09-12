import { CircleAlert } from 'lucide-react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, type AppPage } from './components/AppShell'
import { Logo } from './components/Logo'
import { BackupExportDialog } from './components/BackupExportDialog'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { Toast, type ToastTone } from './components/Toast'
import { useAppStore } from './app/AppStore'
import type { AppWorkBlock, WorkBlockDraft } from './app/app-types'
import {
  deleteLinkedCalendarEvent,
  downloadCsvExport,
  transferCalendarBlocks,
} from './app/calendar-actions'
import { CalendarPage } from './pages/CalendarPage'
import { CapturePage } from './pages/CapturePage'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SyncPage } from './pages/SyncPage'
import { todayIso } from './lib/date'
import { suggestTimeRange } from './lib/timeSuggestions'
import { parseLegacyWorkTimeCsv, workBlockImportKey } from './services/csvImport'
import { APP_VERSION } from './app/defaults'
import {
  checkCalendarPermission,
  getCalendarCapability,
  listDeviceCalendars,
  requestCalendarPermission,
} from './native/calendar-gateway'

interface ToastState {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

export default function App() {
  const store = useAppStore()
  const [page, setPage] = useState<AppPage>('home')
  const [preparedBackup, setPreparedBackup] = useState<{ content: string; filename: string }>()
  const preparingBackup = useRef(false)
  const [editingBlockId, setEditingBlockId] = useState<string>()
  const [templateBlockId, setTemplateBlockId] = useState<string>()
  const [captureDate, setCaptureDate] = useState<string>()
  const [calendarDate, setCalendarDate] = useState<string>()
  const [toast, setToast] = useState<ToastState>()
  const pageRef = useRef<AppPage>('home')
  const historyRef = useRef<AppPage[]>([])

  const editingBlock = useMemo(
    () => store.allBlocks.find((block) => block.id === editingBlockId),
    [editingBlockId, store.allBlocks],
  )
  const templateBlock = useMemo(
    () => store.allBlocks.find((block) => block.id === templateBlockId),
    [store.allBlocks, templateBlockId],
  )

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast((current) => current?.id === toast.id ? undefined : current), 5000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = useCallback((next: AppPage, mode: 'push' | 'replace' = 'push') => {
    if (mode === 'replace') {
      while (historyRef.current.at(-1) === next) historyRef.current.pop()
    }
    if (next === pageRef.current) return
    if (mode === 'push') historyRef.current.push(pageRef.current)
    pageRef.current = next
    setPage(next)
    if (next !== 'capture') {
      setEditingBlockId(undefined)
      setTemplateBlockId(undefined)
      setCaptureDate(undefined)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const goBack = useCallback(async () => {
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
      const closeDialog = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      document.dispatchEvent(closeDialog)
      if (closeDialog.defaultPrevented) return
    }
    const previous = historyRef.current.pop()
    if (!previous) {
      if (Capacitor.isNativePlatform()) await CapacitorApp.exitApp()
      return
    }
    navigate(previous, 'replace')
  }, [navigate])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = CapacitorApp.addListener('backButton', () => { void goBack() })
    return () => { void listener.then((handle) => handle.remove()) }
  }, [goBack])

  const startNew = useCallback((date?: string) => {
    setEditingBlockId(undefined)
    setTemplateBlockId(undefined)
    setCaptureDate(date ?? todayIso())
    navigate('capture')
  }, [navigate])

  const editBlock = (block: AppWorkBlock) => {
    setEditingBlockId(block.id)
    setTemplateBlockId(undefined)
    setCaptureDate(block.date)
    navigate('capture')
  }

  const repeatBlock = (block: AppWorkBlock) => {
    setEditingBlockId(undefined)
    setTemplateBlockId(block.id)
    setCaptureDate(todayIso())
    navigate('capture')
  }

  const transfer = useCallback(async (blocks: readonly AppWorkBlock[], scope: string) => {
    return transferCalendarBlocks(
      blocks,
      store.categories,
      store.settings,
      store.syncRecords,
      { markSynced: store.markSynced, markFailed: store.markSyncFailed },
      scope,
    )
  }, [store.categories, store.markSyncFailed, store.markSynced, store.settings, store.syncRecords])

  const transferWithToast = async (blocks: readonly AppWorkBlock[], scope: string) => {
    try {
      const result = await transfer(blocks, scope)
      if (result.successful === 0 && result.failed === 0) {
        showToast('Es sind keine offenen Einträge vorhanden.', 'info')
      } else if (result.mode === 'ics') {
        showToast(`Kalenderdatei mit ${result.successful} ${result.successful === 1 ? 'Eintrag' : 'Einträgen'} bereitgestellt.`)
      } else {
        showToast(`${result.successful} ${result.successful === 1 ? 'Termin' : 'Termine'} übertragen${result.failed ? `, ${result.failed} fehlgeschlagen` : ''}.`, result.failed ? 'warning' : 'success')
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kalenderübertragung fehlgeschlagen.'
      showToast(message, 'warning')
      throw error
    }
  }

  const saveBlock = async (draft: WorkBlockDraft, addAnother: boolean) => {
    const previousRecord = draft.id
      ? store.syncRecords.find((record) => record.workBlockId === draft.id)
      : undefined
    const saved = await store.saveBlock(draft)
    showToast(draft.id ? 'Arbeitsblock aktualisiert.' : 'Arbeitsblock gespeichert.')

    if (getCalendarCapability().mode === 'native' && store.settings.calendar.automatic) {
      await transferWithToast([saved], saved.date)
    } else if (draft.id && previousRecord?.status === 'synced') {
      const shouldUpdate = window.confirm('Der zugehörige Kalendereintrag wurde bereits übertragen. Soll er ebenfalls aktualisiert werden?')
      if (shouldUpdate) await transferWithToast([saved], saved.date)
    }

    if (!addAnother) {
      setCalendarDate(saved.date)
      navigate('calendar', 'replace')
    }
  }

  const deleteBlock = async (block: AppWorkBlock) => {
    if (!window.confirm('Diesen Arbeitsblock wirklich löschen?')) return
    const record = store.syncRecords.find((entry) => entry.workBlockId === block.id)
    if (record?.externalEventId && getCalendarCapability().mode === 'native') {
      const shouldDeleteEvent = store.settings.calendar.deleteAutomatically
        || window.confirm('Soll auch der zugehörige Termin aus dem privaten Kalender entfernt werden?')
      if (shouldDeleteEvent) {
        try {
          await deleteLinkedCalendarEvent(record)
        } catch (error) {
          const proceed = window.confirm(`Der Kalendertermin konnte nicht gelöscht werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}\n\nArbeitsblock trotzdem lokal löschen?`)
          if (!proceed) return
        }
      }
    }
    await store.deleteBlock(block.id)
    showToast('Arbeitsblock gelöscht.', 'info')
  }

  const exportBackup = async () => {
    if (preparingBackup.current) return
    preparingBackup.current = true
    try {
      const content = await store.exportBackup()
      setPreparedBackup({ content, filename: `fahrschulkalender-backup-${todayIso()}.json` })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Datensicherung fehlgeschlagen.', 'warning')
    } finally {
      preparingBackup.current = false
    }
  }

  const importCsv = async (files: readonly File[]) => {
    try {
      const parsedFiles = await Promise.all(files.map(async (file) => ({
        file,
        result: parseLegacyWorkTimeCsv(await file.text(), store.settings.defaultCategoryId),
      })))
      const existing = new Set(store.allBlocks.filter((block) => !block.sample).map(workBlockImportKey))
      const drafts: WorkBlockDraft[] = []
      let duplicates = 0
      parsedFiles.forEach(({ result }) => result.drafts.forEach((draft) => {
        const key = workBlockImportKey(draft)
        if (existing.has(key)) duplicates += 1
        else { existing.add(key); drafts.push(draft) }
      }))
      if (drafts.length === 0) {
        showToast('Alle Arbeitszeiten aus den gewählten CSV-Dateien sind bereits vorhanden.', 'info')
        return
      }
      const skippedRows = parsedFiles.reduce((sum, item) => sum + item.result.skippedRows, 0)
      const warnings = parsedFiles.flatMap((item) => item.result.warnings)
      const details = [
        `${drafts.length} Arbeitsblöcke werden importiert.`,
        duplicates ? `${duplicates} Dubletten werden übersprungen.` : '',
        skippedRows ? `${skippedRows} Summen- oder Leerzeilen werden ignoriert.` : '',
        ...warnings,
      ].filter(Boolean).join('\n')
      if (!window.confirm(`${files.length} CSV-${files.length === 1 ? 'Datei' : 'Dateien'} ausgewählt\n\n${details}\n\nFortfahren?`)) return
      await store.importBlocks(drafts)
      showToast(`${drafts.length} Arbeitsblöcke importiert${duplicates ? `, ${duplicates} Dubletten übersprungen` : ''}${warnings.length ? `, ${warnings.length} Hinweis(e)` : ''}.`, warnings.length ? 'warning' : 'success')
      setCalendarDate(drafts[0].date)
      navigate('calendar')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'CSV-Datei konnte nicht importiert werden.', 'warning')
    }
  }

  const importBackup = async (file: File) => {
    if (!window.confirm('Die aktuelle lokale Datenbank wird durch diese Sicherung ersetzt. Fortfahren?')) return
    try {
      await store.importBackup(await file.text())
      showToast('Datensicherung erfolgreich wiederhergestellt.')
      navigate('home')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sicherung konnte nicht importiert werden.', 'warning')
    }
  }

  const exportCsv = (scope: 'month' | 'year' | 'all', key?: string) => {
    const selected = scope === 'all'
      ? store.blocks
      : scope === 'month'
        ? store.blocks.filter((block) => block.date.startsWith(`${key}-`))
        : store.blocks.filter((block) => block.date.startsWith(`${key}-`))
    if (selected.length === 0) {
      showToast('Für diesen Zeitraum sind keine Einträge vorhanden.', 'info')
      return
    }
    downloadCsvExport(selected, store.categories, store.settings, scope === 'all' ? 'alle-arbeitszeiten' : key ?? scope)
    showToast(`CSV mit ${selected.length} ${selected.length === 1 ? 'Eintrag' : 'Einträgen'} exportiert.`)
  }

  const resetData = async () => {
    if (!window.confirm('Wirklich alle Arbeitszeiten, Synchronisationsdaten und Einstellungen löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    await store.resetData()
    showToast('Alle lokalen Daten wurden gelöscht.', 'info')
    navigate('home')
  }

  const runCalendarDiagnostic = async () => {
    try {
      const capability = getCalendarCapability()
      if (capability.mode === 'ics') {
        showToast('PWA-Modus erkannt: .ics-Übergabe ist verfügbar. Direkter Zugriff erfordert die Android-/iOS-App.', 'info')
        return
      }
      let permission = await checkCalendarPermission()
      if (permission !== 'granted') permission = await requestCalendarPermission()
      if (permission !== 'granted') {
        showToast('Kalenderzugriff ist nicht freigegeben.', 'warning')
        return
      }
      const calendars = await listDeviceCalendars()
      showToast(`Kalenderzugriff funktioniert. ${calendars.length} beschreibbare ${calendars.length === 1 ? 'Kalender' : 'Kalender'} gefunden.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kalenderdiagnose fehlgeschlagen.', 'warning')
    }
  }

  const checkForUpdate = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      await registration?.update()
      showToast(`Auf Updates geprüft. Du verwendest FahrschulKalender v${APP_VERSION}.`, 'info')
    } catch {
      showToast('Die Updateprüfung ist offline nicht möglich.', 'warning')
    }
  }

  const getSuggestedTimeRange = useCallback(
    (date: string) => suggestTimeRange(date, store.allBlocks, [store.settings.defaultStartTime, store.settings.defaultEndTime]),
    [store.allBlocks, store.settings.defaultEndTime, store.settings.defaultStartTime],
  )

  if (!store.ready) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner"><Logo /><span>Lokale Daten werden vorbereitet …</span></div>
      </div>
    )
  }

  const pageContent = (() => {
    switch (page) {
      case 'calendar':
        return (
          <CalendarPage
            blocks={store.blocks}
            categories={store.categories}
            settings={store.settings}
            initialDate={calendarDate}
            onSelectedDateChange={setCalendarDate}
            syncStatusFor={store.syncStatusFor}
            onNew={startNew}
            onEdit={editBlock}
            onDelete={(block) => void deleteBlock(block)}
            onSyncBlock={(block) => void transferWithToast([block], block.date)}
          />
        )
      case 'capture':
        return (
          <CapturePage
            settings={store.settings}
            categories={store.categories}
            initialBlock={editingBlock}
            templateBlock={templateBlock}
            initialDate={captureDate}
            getSuggestedTimeRange={getSuggestedTimeRange}
            onSave={saveBlock}
            onCancel={() => navigate('calendar')}
            onAddCategory={store.addCategory}
          />
        )
      case 'insights':
        return (
          <InsightsPage
            blocks={store.blocks}
            categories={store.categories}
            settings={store.settings}
            onExportCsv={(scope, key) => exportCsv(scope, key)}
            onPrintMonth={() => window.print()}
            onOpenPayments={() => navigate('payments')}
          />
        )
      case 'payments':
        return (
          <PaymentsPage
            blocks={store.blocks}
            payments={store.payments}
            settings={store.settings}
            onSavePayment={store.savePayment}
            onDeletePayment={(id) => { if (window.confirm('Diesen Zahlungseingang wirklich löschen?')) void store.deletePayment(id) }}
            onBack={() => navigate('insights', 'replace')}
          />
        )
      case 'sync':
        return (
          <SyncPage
            blocks={store.blocks}
            categories={store.categories}
            settings={store.settings}
            syncRecords={store.syncRecords}
            syncStatusFor={store.syncStatusFor}
            onUpdateSettings={store.updateSettings}
            onTransfer={transfer}
          />
        )
      case 'settings':
        return (
          <SettingsPage
            settings={store.settings}
            categories={store.categories}
            storageMode={store.storageMode}
            onUpdateSettings={store.updateSettings}
            onUpdateCategory={store.updateCategory}
            onAddCategory={async (name) => { await store.addCategory(name) }}
            onExportBackup={() => void exportBackup()}
            onImportBackup={(file) => void importBackup(file)}
            onImportCsv={(files) => void importCsv(files)}
            onExportCsv={() => exportCsv('all')}
            onResetData={() => void resetData()}
            onCalendarDiagnostic={() => void runCalendarDiagnostic()}
            onCheckUpdate={() => void checkForUpdate()}
          />
        )
      default:
        return (
          <HomePage
            blocks={store.blocks}
            categories={store.categories}
            settings={store.settings}
            pendingSyncCount={store.pendingSyncCount}
            onNavigate={(next) => next === 'capture' ? startNew(calendarDate ?? todayIso()) : navigate(next)}
            onRepeatLast={repeatBlock}
            onSyncPending={() => void transferWithToast(store.blocks.filter((block) => store.syncStatusFor(block) !== 'synced'), 'offene-eintraege')}
            onNew={startNew}
            onOpenCalendar={(date) => { setCalendarDate(date); navigate('calendar') }}
          />
        )
    }
  })()

  return (
    <>
      <AppShell page={page} onNavigate={(next) => next === 'capture' ? startNew(calendarDate ?? todayIso()) : navigate(next)} syncCount={store.pendingSyncCount}>
        {store.storageError && (
          <div className="notice notice--warning app-notice"><CircleAlert size={18} /><span>{store.storageError}</span></div>
        )}
        {store.blocks.some((block) => block.sample) && (
          <div className="notice app-notice"><CircleAlert size={18} /><span>Beispieldaten sind eingeblendet. Die Lohnkontrolle berücksichtigt ausschließlich deine eigenen Arbeitszeiten.</span><button className="text-button" onClick={() => navigate('settings')}>Einstellungen</button></div>
        )}
        {pageContent}
      </AppShell>
      <PwaUpdatePrompt />
      {preparedBackup && <BackupExportDialog content={preparedBackup.content} filename={preparedBackup.filename} onClose={() => setPreparedBackup(undefined)} />}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(undefined)} />}
    </>
  )
}
