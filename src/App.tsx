import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell, type AppPage } from './components/AppShell'
import { Logo } from './components/Logo'
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
import { SettingsPage } from './pages/SettingsPage'
import { SyncPage } from './pages/SyncPage'
import { todayIso } from './lib/date'
import { downloadTextFile } from './services'
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
  const [editingBlockId, setEditingBlockId] = useState<string>()
  const [templateBlockId, setTemplateBlockId] = useState<string>()
  const [captureDate, setCaptureDate] = useState<string>()
  const [calendarDate, setCalendarDate] = useState<string>()
  const [toast, setToast] = useState<ToastState>()

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

  const navigate = (next: AppPage) => {
    setPage(next)
    if (next !== 'capture') {
      setEditingBlockId(undefined)
      setTemplateBlockId(undefined)
      setCaptureDate(undefined)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startNew = (date?: string) => {
    setEditingBlockId(undefined)
    setTemplateBlockId(undefined)
    setCaptureDate(date ?? todayIso())
    setPage('capture')
  }

  const editBlock = (block: AppWorkBlock) => {
    setEditingBlockId(block.id)
    setTemplateBlockId(undefined)
    setCaptureDate(block.date)
    setPage('capture')
  }

  const repeatBlock = (block: AppWorkBlock) => {
    setEditingBlockId(undefined)
    setTemplateBlockId(block.id)
    setCaptureDate(todayIso())
    setPage('capture')
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
      navigate('calendar')
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
    try {
      const content = await store.exportBackup()
      downloadTextFile(content, `fahrschulzeit-backup-${todayIso()}.json`, 'application/json;charset=utf-8')
      showToast('Datensicherung exportiert.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Datensicherung fehlgeschlagen.', 'warning')
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
      showToast('Auf Updates geprüft. Du verwendest Fahrschulzeit v0.1.0.', 'info')
    } catch {
      showToast('Die Updateprüfung ist offline nicht möglich.', 'warning')
    }
  }

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
            onNavigate={navigate}
            onRepeatLast={repeatBlock}
            onSyncPending={() => void transferWithToast(store.blocks.filter((block) => store.syncStatusFor(block) !== 'synced'), 'offene-eintraege')}
            onNew={startNew}
            onOpenCalendar={(date) => { setCalendarDate(date); setPage('calendar') }}
          />
        )
    }
  })()

  return (
    <>
      <AppShell page={page} onNavigate={navigate} syncCount={store.pendingSyncCount}>
        {store.storageError && (
          <div className="notice notice--warning app-notice"><CircleAlert size={18} /><span>{store.storageError}</span></div>
        )}
        {pageContent}
      </AppShell>
      <PwaUpdatePrompt />
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(undefined)} />}
    </>
  )
}
