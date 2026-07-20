import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileWarning,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, AppWorkBlock, WorkCategory } from '../app/app-types'
import { PageHeader } from '../components/PageHeader'
import { calculateWorkBlock } from '../domain'
import { currentMonthKey, formatDateShort } from '../lib/date'
import { formatDuration, formatMoneyCents } from '../lib/format'
import {
  checkCalendarPermission,
  getCalendarCapability,
  getDefaultDeviceCalendar,
  listDeviceCalendars,
  requestCalendarPermission,
  type DeviceCalendar,
} from '../native/calendar-gateway'
import { createCalendarTemplateContext, renderCalendarTemplate, type CalendarSyncRecord, type CalendarSyncStatus } from '../services'

interface SyncPageProps {
  readonly blocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly syncRecords: readonly CalendarSyncRecord[]
  syncStatusFor(block: AppWorkBlock): CalendarSyncStatus
  onUpdateSettings(next: AppSettings): void | Promise<void>
  onTransfer(blocks: readonly AppWorkBlock[], scope: string): Promise<{ mode: 'ics' | 'native'; successful: number; failed: number }>
}

const statusInfo: Record<CalendarSyncStatus, { label: string; className: string; icon: typeof Check }> = {
  pending: { label: 'Noch offen', className: 'chip--accent', icon: Clock3 },
  synced: { label: 'Übertragen', className: 'chip--success', icon: Check },
  modified: { label: 'Geändert', className: 'chip--accent', icon: RefreshCw },
  missing: { label: 'Termin fehlt', className: 'chip--warning', icon: FileWarning },
  error: { label: 'Fehler', className: 'chip--warning', icon: CircleAlert },
}

export function SyncPage({
  blocks,
  categories,
  settings,
  syncRecords,
  syncStatusFor,
  onUpdateSettings,
  onTransfer,
}: SyncPageProps) {
  const capability = getCalendarCapability()
  const [permission, setPermission] = useState<'web' | 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'>('web')
  const [calendars, setCalendars] = useState<readonly DeviceCalendar[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  const pendingBlocks = useMemo(() => blocks.filter((block) => syncStatusFor(block) !== 'synced'), [blocks, syncStatusFor])
  const currentMonthBlocks = useMemo(() => pendingBlocks.filter((block) => block.date.startsWith(currentMonthKey())), [pendingBlocks])
  const counts = useMemo(() => blocks.reduce<Record<CalendarSyncStatus, number>>((result, block) => {
    result[syncStatusFor(block)] += 1
    return result
  }, { pending: 0, synced: 0, modified: 0, missing: 0, error: 0 }), [blocks, syncStatusFor])

  const loadCalendars = async (ask = false) => {
    if (capability.mode !== 'native') return
    try {
      setBusy(true)
      let state = await checkCalendarPermission()
      if (ask && state !== 'granted') state = await requestCalendarPermission()
      if (state === 'web') return
      setPermission(state)
      if (state === 'granted') {
        const result = await listDeviceCalendars()
        setCalendars(result)
        if (!settings.calendar.targetCalendarId) {
          const defaultCalendar = await getDefaultDeviceCalendar()
          if (defaultCalendar) {
            await onUpdateSettings({
              ...settings,
              calendar: { ...settings.calendar, targetCalendarId: defaultCalendar.id, targetCalendarName: defaultCalendar.title },
            })
          }
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kalender konnten nicht geladen werden.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (capability.mode === 'native') void loadCalendars(false)
    // This should only rerun when the runtime platform changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability.mode])

  const transfer = async (items: readonly AppWorkBlock[], scope: string) => {
    if (items.length === 0) {
      setMessage('Für diese Auswahl sind keine offenen Einträge vorhanden.')
      return
    }
    try {
      setBusy(true)
      setMessage(undefined)
      const result = await onTransfer(items, scope)
      setMessage(result.mode === 'ics'
        ? `${result.successful} ${result.successful === 1 ? 'Eintrag wurde' : 'Einträge wurden'} als Kalenderdatei bereitgestellt.`
        : `${result.successful} erfolgreich übertragen${result.failed ? `, ${result.failed} fehlgeschlagen` : ''}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kalenderübertragung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const previewBlock = blocks[0]
  const previewContext = previewBlock
    ? createCalendarTemplateContext(previewBlock, (() => {
        const value = calculateWorkBlock(previewBlock, settings.pay)
        return {
          attendanceMinutes: value.attendanceMinutes,
          breakMinutes: value.breakMinutes,
          workMinutes: value.workMinutes,
          paidMinutes: value.paidWorkMinutes,
          timeHours: value.timeHours,
          trainingHours: value.trainingHours,
          earningsCents: value.earningsCents,
        }
      })(), { activityLabel: categories.find((category) => category.id === previewBlock.categoryId)?.name, currency: settings.currency })
    : {
        tätigkeit: 'Praktische Ausbildung', arbeitszeit: '4:30 Std.', ausbstunden: '6,00 AusbStd.', verdienst: '135,00 €',
        fahrzeugklasse: 'B', bemerkung: '', start: '08:00', ende: '12:45',
      }
  const previewTitle = renderCalendarTemplate(settings.calendar.titleTemplate, previewContext)
  const previewDescription = renderCalendarTemplate(settings.calendar.descriptionTemplate, previewContext)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Arbeitszeit in deinen privaten Kalender"
        title="Kalender-Sync"
        description={capability.mode === 'native'
          ? 'Die installierte App kann Termine direkt im ausgewählten Gerätekalender anlegen und später aktualisieren.'
          : 'In der PWA werden standardisierte .ics-Dateien übergeben. Der Kalender fragt dich anschließend nach der Bestätigung.'}
      />

      <section className="sync-hero">
        <div>
          <div className="sync-hero__title">
            <span className="sync-hero__icon">{capability.mode === 'native' ? <Smartphone size={23} /> : <Download size={23} />}</span>
            <div>
              <h2>{capability.label}</h2>
              <p>{pendingBlocks.length === 0 ? 'Alle sichtbaren Arbeitsblöcke sind auf dem aktuellen Stand.' : `${pendingBlocks.length} ${pendingBlocks.length === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf die Übertragung.`}</p>
            </div>
          </div>
        </div>
        <button className="button" disabled={busy || pendingBlocks.length === 0} onClick={() => void transfer(pendingBlocks, 'offene-eintraege')}>
          <RefreshCw size={18} className={busy ? 'spin' : ''} /> {busy ? 'Überträgt …' : 'Alle offenen übertragen'}
        </button>
      </section>

      {message && <div className="notice" style={{ marginTop: 14 }}><CheckCircle2 size={18} /><span>{message}</span></div>}

      <div className="section-heading"><div><h2>Status</h2><p>Doppelungen werden über die interne Zuordnung jedes Arbeitsblocks verhindert.</p></div></div>
      <div className="summary-grid">
        <article className="mini-stat"><span>Offen</span><strong>{counts.pending}</strong></article>
        <article className="mini-stat"><span>Nachträglich geändert</span><strong>{counts.modified}</strong></article>
        <article className="mini-stat"><span>Erfolgreich übertragen</span><strong>{counts.synced}</strong></article>
      </div>

      <div className="section-heading"><div><h2>Übertragung</h2><p>Wähle den passenden Umfang für den nächsten Export.</p></div></div>
      <div className="sync-grid">
        <section className="card card--padded">
          <h3 className="card-title">Schnellauswahl</h3>
          <div className="sync-status-list">
            <button className="sync-status-row sync-status-row--button" disabled={busy || currentMonthBlocks.length === 0} onClick={() => void transfer(currentMonthBlocks, currentMonthKey())}>
              <span className="sync-status-row__icon"><CalendarDays size={18} /></span>
              <span><strong>Aktuellen Monat übertragen</strong><span>{currentMonthBlocks.length} offene Einträge</span></span>
              <ChevronRight size={17} />
            </button>
            <button className="sync-status-row sync-status-row--button" disabled={busy || pendingBlocks.length === 0} onClick={() => void transfer(pendingBlocks, 'alle-offenen')}>
              <span className="sync-status-row__icon"><CalendarClock size={18} /></span>
              <span><strong>Alle noch offenen übertragen</strong><span>{pendingBlocks.length} Einträge auf allen Geräten</span></span>
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="section-heading section-heading--compact"><div><h3>Zielkalender</h3></div></div>
          {capability.mode === 'native' ? (
            permission === 'granted' ? (
              <label className="field">
                <span>Beschreibbarer Kalender</span>
                <select className="select" value={settings.calendar.targetCalendarId ?? ''} onChange={(event) => {
                  const calendar = calendars.find((entry) => entry.id === event.target.value)
                  void onUpdateSettings({ ...settings, calendar: { ...settings.calendar, targetCalendarId: calendar?.id, targetCalendarName: calendar?.title } })
                }}>
                  <option value="">Bitte auswählen</option>
                  {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.title}{calendar.account ? ` · ${calendar.account}` : ''}</option>)}
                </select>
              </label>
            ) : (
              <div className="notice"><ShieldCheck size={18} /><span>Vollständiger Kalenderzugriff ist nötig, damit die App eigene Termine später wiederfinden, aktualisieren und löschen kann. <button className="text-button" onClick={() => void loadCalendars(true)}>Zugriff erlauben</button></span></div>
            )
          ) : (
            <div className="notice"><Download size={18} /><span>Die PWA nutzt <strong>.ics-Kalenderdateien</strong>. Auf Android oder iOS kann dieselbe App später direkt in einen gewählten Kalender schreiben.</span></div>
          )}
        </section>

        <section className="card card--padded">
          <h3 className="card-title">Vorschau des Kalendertermins</h3>
          <div className="template-preview">
            <div className="template-preview__calendar">
              <span className="template-preview__date">15</span>
              <div><strong>{previewTitle}</strong><p>08:00–12:45 Uhr</p><p>{previewDescription}{settings.calendar.includeEarnings ? ` · ${previewContext.verdienst}` : ''}</p></div>
            </div>
          </div>
          <div className="switch-row">
            <div><strong>Verdienst anzeigen</strong><small>Kann sensible Lohnangaben im privaten Kalender sichtbar machen.</small></div>
            <label className="switch"><input type="checkbox" checked={settings.calendar.includeEarnings} onChange={(event) => void onUpdateSettings({ ...settings, calendar: { ...settings.calendar, includeEarnings: event.target.checked } })} /><span /></label>
          </div>
          <div className="switch-row">
            <div><strong>Automatisch übertragen</strong><small>Nur in der geöffneten nativen App; kein Hintergrundzugriff.</small></div>
            <label className="switch"><input type="checkbox" checked={settings.calendar.automatic} disabled={capability.mode !== 'native'} onChange={(event) => void onUpdateSettings({ ...settings, calendar: { ...settings.calendar, automatic: event.target.checked } })} /><span /></label>
          </div>
        </section>
      </div>

      <div className="section-heading"><div><h2>Letzte Einträge</h2><p>Der Zustand wird lokal zusammen mit dem Arbeitsblock gespeichert.</p></div></div>
      <section className="card table-card">
        <table className="data-table">
          <thead><tr><th>Datum / Tätigkeit</th><th>Zeit</th><th>Verdienst</th><th>Status</th><th /></tr></thead>
          <tbody>
            {blocks.slice().sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)).slice(0, 8).map((block) => {
              const calculation = calculateWorkBlock(block, settings.pay)
              const status = syncStatusFor(block)
              const info = statusInfo[status]
              const StatusIcon = info.icon
              const syncRecord = syncRecords.find((entry) => entry.workBlockId === block.id)
              return (
                <tr key={block.id}>
                  <td>{formatDateShort(block.date)} · {categories.find((category) => category.id === block.categoryId)?.name ?? 'Arbeitszeit'}</td>
                  <td>{formatDuration(calculation.workMinutes)}</td>
                  <td>{formatMoneyCents(calculation.earningsCents)}</td>
                  <td><span className={`chip ${info.className}`}><StatusIcon size={13} /> {syncRecord?.provider === 'ics' && status === 'synced' ? 'ICS bereitgestellt' : info.label}</span></td>
                  <td>{status !== 'synced' && <button className="icon-button" disabled={busy} onClick={() => void transfer([block], block.date)} aria-label="Diesen Eintrag übertragen"><RefreshCw size={16} /></button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {blocks.length === 0 && <div className="empty-state"><span className="empty-state__icon"><CalendarCheck size={23} /></span><h3>Noch keine Arbeitszeiten</h3><p>Erfasste Arbeitsblöcke erscheinen hier mit ihrem Kalenderstatus.</p></div>}
      </section>
    </div>
  )
}
