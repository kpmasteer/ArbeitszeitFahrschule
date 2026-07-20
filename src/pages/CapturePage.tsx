import {
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  Coffee,
  FileText,
  MapPin,
  Plus,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AppSettings, AppWorkBlock, WorkBlockDraft, WorkCategory } from '../app/app-types'
import { PageHeader } from '../components/PageHeader'
import { calculateWorkBlock, type WorkBreak } from '../domain'
import { todayIso } from '../lib/date'
import { formatDuration, formatMoneyCents, formatTrainingHours, parseDecimalInput } from '../lib/format'

interface CapturePageProps {
  readonly settings: AppSettings
  readonly categories: readonly WorkCategory[]
  readonly initialBlock?: AppWorkBlock
  readonly templateBlock?: AppWorkBlock
  readonly initialDate?: string
  onSave(draft: WorkBlockDraft, addAnother: boolean): void | Promise<void>
  onCancel(): void
  onAddCategory(name: string): Promise<WorkCategory>
}

interface DraftState {
  id?: string
  date: string
  startTime: string
  endTime: string
  breaks: WorkBreak[]
  categoryId: string
  rateOverride: string
  isPaid: boolean
  activity: string
  vehicleClass: string
  studentOrAssignment: string
  notes: string
  location: string
  calendarText: string
}

function createDraft(settings: AppSettings, block?: AppWorkBlock, initialDate?: string, edit = false): DraftState {
  return {
    id: edit ? block?.id : undefined,
    date: block?.date ?? initialDate ?? todayIso(),
    startTime: block?.startTime ?? settings.defaultStartTime,
    endTime: block?.endTime ?? settings.defaultEndTime,
    breaks: block ? block.breaks.map((entry) => ({ ...entry })) : settings.defaultBreakMinutes > 0
      ? [{ id: 'default-break', kind: 'duration', minutes: settings.defaultBreakMinutes }]
      : [],
    categoryId: block?.categoryId ?? settings.defaultCategoryId,
    rateOverride: block?.rateOverride === undefined ? '' : String(block.rateOverride).replace('.', ','),
    isPaid: block?.isPaid !== false,
    activity: block?.activity ?? '',
    vehicleClass: block?.vehicleClass ?? '',
    studentOrAssignment: block?.studentOrAssignment ?? '',
    notes: block?.notes ?? '',
    location: block?.location ?? '',
    calendarText: block?.calendarText ?? '',
  }
}

const optional = (value: string) => value.trim() || undefined

export function CapturePage({
  settings,
  categories,
  initialBlock,
  templateBlock,
  initialDate,
  onSave,
  onCancel,
  onAddCategory,
}: CapturePageProps) {
  const sourceBlock = initialBlock ?? templateBlock
  const [draft, setDraft] = useState(() => createDraft(settings, sourceBlock, initialDate, Boolean(initialBlock)))
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initialBlock?.notes || initialBlock?.location || initialBlock?.studentOrAssignment))
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(createDraft(settings, initialBlock ?? templateBlock, initialDate, Boolean(initialBlock)))
    setDetailsOpen(Boolean(initialBlock?.notes || initialBlock?.location || initialBlock?.studentOrAssignment))
    setError(undefined)
  }, [initialBlock, templateBlock, initialDate, settings.defaultCategoryId, settings.defaultEndTime, settings.defaultStartTime, settings.defaultBreakMinutes])

  const activeCategories = categories.filter((category) => category.active)
  const selectedCategory = categories.find((category) => category.id === draft.categoryId)

  const calculation = useMemo(() => {
    try {
      if (!draft.date || !draft.startTime || !draft.endTime) return undefined
      return calculateWorkBlock({
        id: draft.id ?? 'preview',
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        breaks: draft.breaks,
        categoryId: draft.categoryId,
        rateOverride: parseDecimalInput(draft.rateOverride),
        isPaid: draft.isPaid,
      }, settings.pay)
    } catch {
      return undefined
    }
  }, [draft, settings.pay])

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError(undefined)
  }

  const updateBreak = (index: number, value: WorkBreak) => {
    update('breaks', draft.breaks.map((entry, currentIndex) => currentIndex === index ? value : entry))
  }

  const removeBreak = (index: number) => update('breaks', draft.breaks.filter((_, currentIndex) => currentIndex !== index))

  const toWorkBlockDraft = (): WorkBlockDraft => ({
    id: draft.id,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    breaks: draft.breaks,
    categoryId: draft.categoryId,
    rateOverride: parseDecimalInput(draft.rateOverride),
    isPaid: draft.isPaid,
    activity: optional(draft.activity),
    vehicleClass: optional(draft.vehicleClass),
    studentOrAssignment: optional(draft.studentOrAssignment),
    notes: optional(draft.notes),
    location: optional(draft.location),
    calendarText: optional(draft.calendarText),
  })

  const submit = async (event: FormEvent, addAnother = false) => {
    event.preventDefault()
    try {
      const value = toWorkBlockDraft()
      calculateWorkBlock({ ...value, id: value.id ?? 'validation' }, settings.pay)
      setSaving(true)
      await onSave(value, addAnother)
      if (addAnother) {
        setDraft(createDraft(settings, undefined, draft.date))
        setDetailsOpen(false)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Arbeitsblock konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const addNewCategory = async () => {
    if (!newCategoryName.trim()) return
    const category = await onAddCategory(newCategoryName)
    update('categoryId', category.id)
    setNewCategoryName('')
    setShowNewCategory(false)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={initialBlock ? 'Eintrag bearbeiten' : 'Neuer Arbeitsblock'}
        title={initialBlock ? 'Arbeitszeit anpassen' : 'Arbeitszeit erfassen'}
        description="Beginn, Ende und Pausen genügen. Ausbildungsstunden und Verdienst rechnet die App sofort aus."
      />

      <form className="form-layout" onSubmit={(event) => void submit(event)}>
        <section className="card form-card">
          <div className="form-section">
            <div className="form-section__title"><span><Clock3 size={17} /></span><h2>Wann hast du gearbeitet?</h2></div>
            <div className="form-grid form-grid--three">
              <label className="field">
                <span>Datum *</span>
                <input className="input" type="date" required value={draft.date} onChange={(event) => update('date', event.target.value)} />
              </label>
              <label className="field time-field">
                <span>Beginn *</span>
                <input className="input" type="time" required step={settings.minuteStep * 60} value={draft.startTime} onChange={(event) => update('startTime', event.target.value)} />
                <Clock3 size={18} />
              </label>
              <label className="field time-field">
                <span>Ende *</span>
                <input className="input" type="time" required step={settings.minuteStep * 60} value={draft.endTime} onChange={(event) => update('endTime', event.target.value)} />
                <Clock3 size={18} />
              </label>
            </div>
            {draft.endTime <= draft.startTime && draft.endTime !== draft.startTime && (
              <div className="notice" style={{ marginTop: 13 }}><CalendarDays size={17} /><span>Das Ende liegt am Folgetag. Der gesamte Block wird dem {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(`${draft.date}T12:00:00`))} zugeordnet.</span></div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section__title"><span><Coffee size={17} /></span><h2>Pausen</h2></div>
            {draft.breaks.length === 0 ? (
              <div className="notice"><Coffee size={17} /><span>Keine Pause eingetragen. Pausen werden vollständig von Arbeitszeit und Vergütung abgezogen.</span></div>
            ) : (
              <div className="break-list">
                {draft.breaks.map((workBreak, index) => (
                  <div className="break-row" key={workBreak.id ?? `${workBreak.kind}-${index}`}>
                    {workBreak.kind === 'duration' ? (
                      <div className="break-row__fields break-row__fields--single">
                        <label className="field"><span>Pause {index + 1} · Dauer in Minuten</span>
                          <input className="input" type="number" min="0" max="1440" step="1" value={workBreak.minutes} onChange={(event) => updateBreak(index, { ...workBreak, minutes: Number(event.target.value) })} />
                        </label>
                      </div>
                    ) : (
                      <div className="break-row__fields">
                        <label className="field"><span>Pause {index + 1} · Beginn</span>
                          <input className="input" type="time" step={settings.minuteStep * 60} value={workBreak.startTime} onChange={(event) => updateBreak(index, { ...workBreak, startTime: event.target.value })} />
                        </label>
                        <label className="field"><span>Ende</span>
                          <input className="input" type="time" step={settings.minuteStep * 60} value={workBreak.endTime} onChange={(event) => updateBreak(index, { ...workBreak, endTime: event.target.value })} />
                        </label>
                      </div>
                    )}
                    <button className="icon-button" type="button" onClick={() => removeBreak(index)} aria-label={`Pause ${index + 1} entfernen`}><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="break-actions">
              <button className="button button--secondary button--small" type="button" onClick={() => update('breaks', [...draft.breaks, { id: `break-${Date.now()}`, kind: 'duration', minutes: settings.defaultBreakMinutes || 15 }])}><Plus size={15} /> Einfache Pause</button>
              <button className="button button--secondary button--small" type="button" onClick={() => update('breaks', [...draft.breaks, { id: `break-${Date.now()}`, kind: 'interval', startTime: draft.startTime, endTime: draft.startTime }])}><Plus size={15} /> Genaue Pause</button>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section__title"><span><FileText size={17} /></span><h2>Tätigkeit & Vergütung</h2></div>
            <div className="form-grid">
              <label className="field">
                <span>Tätigkeitsart *</span>
                <select className="select" value={showNewCategory ? '__new__' : draft.categoryId} onChange={(event) => {
                  if (event.target.value === '__new__') setShowNewCategory(true)
                  else { setShowNewCategory(false); update('categoryId', event.target.value) }
                }}>
                  {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  <option value="__new__">＋ Neue Tätigkeit anlegen</option>
                </select>
              </label>
              <label className="field">
                <span>Fahrzeugklasse</span>
                <input className="input" value={draft.vehicleClass} onChange={(event) => update('vehicleClass', event.target.value)} placeholder="z. B. B, BE, C" />
              </label>
              {showNewCategory && (
                <div className="field span-all">
                  <span>Neue Tätigkeitsart</span>
                  <div className="inline-field">
                    <input className="input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Bezeichnung" />
                    <button className="button button--small" type="button" onClick={() => void addNewCategory()}>Anlegen</button>
                  </div>
                </div>
              )}
              <label className="field">
                <span>Genauere Bezeichnung</span>
                <input className="input" value={draft.activity} onChange={(event) => update('activity', event.target.value)} placeholder="z. B. Nachtfahrt" />
              </label>
              <label className="field">
                <span>Abweichender Satz</span>
                <input className="input" inputMode="decimal" value={draft.rateOverride} onChange={(event) => update('rateOverride', event.target.value)} placeholder={`Standard ${selectedCategory?.rate ?? settings.pay.standardRate},00 €`} />
                <small>Leer lassen, um den Kategorie- oder Standardsatz zu übernehmen.</small>
              </label>
              <div className="span-all">
                <div className="switch-row">
                  <div><strong>Vergüteter Arbeitsblock</strong><small>Unvergütete Zeit zählt in der Arbeitsauswertung, aber nicht beim Verdienst.</small></div>
                  <label className="switch"><input type="checkbox" checked={draft.isPaid} onChange={(event) => update('isPaid', event.target.checked)} /><span /></label>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <button className="details-toggle" type="button" onClick={() => setDetailsOpen((current) => !current)} aria-expanded={detailsOpen}>
              <span><Plus size={17} /> Weitere Angaben</span><ChevronDown size={18} />
            </button>
            {detailsOpen && (
              <div className="form-grid optional-fields">
                <label className="field"><span>Fahrschüler / Auftrag</span><div className="input-with-icon"><UserRound size={17} /><input className="input" value={draft.studentOrAssignment} onChange={(event) => update('studentOrAssignment', event.target.value)} placeholder="Optional" /></div></label>
                <label className="field"><span>Ort</span><div className="input-with-icon"><MapPin size={17} /><input className="input" value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="Optional" /></div></label>
                <label className="field span-all"><span>Eigener Kalendertext</span><input className="input" value={draft.calendarText} onChange={(event) => update('calendarText', event.target.value)} placeholder="Leer = Titelvorlage aus den Einstellungen" /></label>
                <label className="field span-all"><span>Bemerkung</span><textarea className="textarea" value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Nur speichern, was du wirklich brauchst." /></label>
              </div>
            )}
          </div>

          {error && <div className="notice notice--warning" style={{ marginTop: 20 }}><CircleAlert size={18} /><span><strong>Eingabe prüfen:</strong> {error}</span></div>}

          <div className="form-actions">
            <button className="button button--secondary" type="button" onClick={onCancel}>Abbrechen</button>
            {!initialBlock && <button className="button button--secondary" type="button" disabled={saving} onClick={(event) => void submit(event, true)}><Plus size={17} /> Speichern & weiterer</button>}
            <button className="button" type="submit" disabled={saving || !calculation}><Save size={17} /> {saving ? 'Speichert …' : 'Arbeitsblock speichern'}</button>
          </div>
        </section>

        <aside className="card calculation-preview" aria-live="polite">
          <div className="calculation-preview__hero">
            <p>Voraussichtlicher Verdienst</p>
            <strong>{calculation ? formatMoneyCents(calculation.earningsCents) : '–'}</strong>
            <span>{selectedCategory?.name ?? 'Tätigkeit'} · {settings.pay.model === 'training-hour' ? '45-Minuten-Modell' : '60-Minuten-Modell'}</span>
          </div>
          <div className="calculation-preview__body">
            <div className="calculation-row"><span>Anwesenheit</span><strong>{calculation ? formatDuration(calculation.attendanceMinutes) : '–'}</strong></div>
            <div className="calculation-row"><span>Pausen</span><strong>{calculation ? formatDuration(calculation.breakMinutes) : '–'}</strong></div>
            <div className="calculation-row"><span>Bezahlte Arbeitszeit</span><strong>{calculation ? formatDuration(calculation.paidWorkMinutes) : '–'}</strong></div>
            <div className="calculation-row"><span>Ausbildungsstunden</span><strong>{calculation ? `${formatTrainingHours(calculation.workMinutes)} AusbStd.` : '–'}</strong></div>
            <div className="calculation-row"><span>Vergütungssatz</span><strong>{calculation ? `${calculation.effectiveRate.toFixed(2).replace('.', ',')} €` : '–'}</strong></div>
            <div className="calculation-row calculation-row--total"><span>Verdienst</span><strong>{calculation ? formatMoneyCents(calculation.earningsCents) : '–'}</strong></div>
            {!draft.isPaid && <div className="preview-warning"><Banknote size={16} /><span>Dieser Block ist als unvergütet markiert. Der Verdienst bleibt 0,00 €.</span></div>}
          </div>
        </aside>
      </form>
    </div>
  )
}
