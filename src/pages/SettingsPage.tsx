import {
  Activity,
  ArrowDown,
  CalendarDays,
  CalendarSync,
  Clock3,
  Database,
  Download,
  Euro,
  FileSpreadsheet,
  HardDrive,
  Info,
  Palette,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { AppSettings, CategoryIcon as CategoryIconName, WorkCategory } from '../app/app-types'
import { APP_VERSION } from '../app/defaults'
import { CategoryIcon } from '../components/CategoryIcon'
import { Logo } from '../components/Logo'
import { PageHeader } from '../components/PageHeader'

export interface SettingsPageProps {
  readonly settings: AppSettings
  readonly categories: readonly WorkCategory[]
  readonly storageMode: string
  readonly onUpdateSettings: (next: AppSettings) => void | Promise<void>
  readonly onUpdateCategory: (category: WorkCategory) => void | Promise<void>
  readonly onAddCategory: (name: string) => void | Promise<void>
  readonly onExportBackup: () => void
  readonly onImportBackup: (file: File) => void
  readonly onExportCsv: () => void
  readonly onResetData: () => void
  readonly onCalendarDiagnostic: () => void
  readonly onCheckUpdate: () => void
}

type SettingsSectionId =
  | 'pay'
  | 'time'
  | 'appearance'
  | 'calendar'
  | 'categories'
  | 'data'
  | 'app'

interface SettingsSectionLink {
  readonly id: SettingsSectionId
  readonly label: string
  readonly icon: LucideIcon
}

const sectionLinks: readonly SettingsSectionLink[] = [
  { id: 'pay', label: 'Vergütung', icon: Euro },
  { id: 'time', label: 'Zeiterfassung', icon: Clock3 },
  { id: 'appearance', label: 'Darstellung', icon: Palette },
  { id: 'calendar', label: 'Kalender-Sync', icon: CalendarSync },
  { id: 'categories', label: 'Kategorien', icon: Tags },
  { id: 'data', label: 'Daten', icon: Database },
  { id: 'app', label: 'App', icon: Info },
]

const categoryIconOptions: readonly { value: CategoryIconName; label: string }[] = [
  { value: 'steering-wheel', label: 'Lenkrad' },
  { value: 'presentation', label: 'Tafel' },
  { value: 'clipboard-check', label: 'Prüfung' },
  { value: 'briefcase', label: 'Verwaltung' },
  { value: 'route', label: 'Route' },
  { value: 'graduation-cap', label: 'Weiterbildung' },
  { value: 'shapes', label: 'Sonstiges' },
]

const calendarColors: readonly { value: AppSettings['calendar']['color']; label: string }[] = [
  { value: 'red', label: 'Rot' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Gelb' },
  { value: 'green', label: 'Grün' },
  { value: 'blue', label: 'Blau' },
  { value: 'violet', label: 'Violett' },
  { value: 'gray', label: 'Grau' },
]

interface SettingsSectionHeaderProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
}

function SettingsSectionHeader({ icon: Icon, title, description }: SettingsSectionHeaderProps) {
  return (
    <header className="settings-section__header">
      <span aria-hidden="true"><Icon size={18} /></span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  )
}

interface SwitchRowProps {
  readonly label: string
  readonly description: string
  readonly checked: boolean
  readonly onChange?: (checked: boolean) => void
  readonly disabled?: boolean
}

function SwitchRow({ label, description, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <div className="switch-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.checked)}
          aria-label={label}
        />
        <span aria-hidden="true" />
      </label>
    </div>
  )
}

interface DataActionProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly onClick: () => void
  readonly danger?: boolean
}

function DataAction({ icon: Icon, title, description, onClick, danger = false }: DataActionProps) {
  return (
    <button
      className={`data-action ${danger ? 'data-action--danger' : ''}`}
      type="button"
      onClick={onClick}
    >
      <span aria-hidden="true"><Icon size={19} /></span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  )
}

function nonNegativeNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function SettingsPage({
  settings,
  categories,
  storageMode,
  onUpdateSettings,
  onUpdateCategory,
  onAddCategory,
  onExportBackup,
  onImportBackup,
  onExportCsv,
  onResetData,
  onCalendarDiagnostic,
  onCheckUpdate,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('pay')
  const [newCategoryName, setNewCategoryName] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const sortedCategories = useMemo(
    () => [...categories].sort((left, right) => left.sortOrder - right.sortOrder),
    [categories],
  )

  function updateSetting<Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) {
    void onUpdateSettings({ ...settings, [key]: value })
  }

  function updatePay(patch: Partial<AppSettings['pay']>) {
    void onUpdateSettings({
      ...settings,
      pay: { ...settings.pay, ...patch },
    })
  }

  function updateCalendar(patch: Partial<AppSettings['calendar']>) {
    void onUpdateSettings({
      ...settings,
      calendar: { ...settings.calendar, ...patch },
    })
  }

  function openSection(id: SettingsSectionId) {
    setActiveSection(id)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    await onAddCategory(name)
    setNewCategoryName('')
  }

  function updateCategoryRate(category: WorkCategory, rawValue: string) {
    const rate = rawValue === '' ? undefined : nonNegativeNumber(rawValue)
    void onUpdateCategory({ ...category, rate })

    const categoryRates: Record<string, number> = { ...(settings.pay.categoryRates ?? {}) }
    if (rate === undefined) delete categoryRates[category.id]
    else categoryRates[category.id] = rate
    updatePay({ categoryRates })
  }

  function moveCategoryDown(index: number) {
    const category = sortedCategories[index]
    const nextCategory = sortedCategories[index + 1]
    if (!category || !nextCategory) return

    void Promise.all([
      onUpdateCategory({ ...category, sortOrder: nextCategory.sortOrder }),
      onUpdateCategory({ ...nextCategory, sortOrder: category.sortOrder }),
    ])
  }

  function handleImportFile(file: File | undefined) {
    if (file) onImportBackup(file)
    if (importInputRef.current) importInputRef.current.value = ''
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fahrschulzeit konfigurieren"
        title="Einstellungen"
        description="Passe Vergütung, Zeiterfassung, Kalenderübertragung und lokale Datensicherung an deinen Arbeitsalltag an."
        actions={<span className="version-pill">Version {APP_VERSION}</span>}
      />

      <div className="settings-layout">
        <nav className="card settings-nav" aria-label="Einstellungsbereiche">
          {sectionLinks.map(({ id, label, icon: Icon }) => (
            <button
              className={activeSection === id ? 'is-active' : ''}
              type="button"
              key={id}
              onClick={() => openSection(id)}
              aria-current={activeSection === id ? 'true' : undefined}
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <section className="card settings-section" id="settings-pay">
            <SettingsSectionHeader
              icon={Euro}
              title="Vergütung"
              description="Lege Berechnungsmodell, Standardsatz und Rundung für neue Arbeitsblöcke fest."
            />
            <div className="settings-grid">
              <label className="field">
                <span>Vergütungsmodell</span>
                <select
                  className="select"
                  value={settings.pay.model}
                  onChange={(event) => updatePay({ model: event.target.value as AppSettings['pay']['model'] })}
                >
                  <option value="time-hour">Zeitstunde · 60 Minuten</option>
                  <option value="training-hour">Ausbildungsstunde · 45 Minuten</option>
                </select>
                <small>Bestimmt, auf welche Einheit sich der hinterlegte Satz bezieht.</small>
              </label>

              <label className="field">
                <span>Standardvergütung</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={settings.pay.standardRate}
                  onChange={(event) => updatePay({ standardRate: nonNegativeNumber(event.target.value) })}
                />
                <small>Euro pro {settings.pay.model === 'time-hour' ? '60 Minuten' : '45 Minuten'}.</small>
              </label>

              <label className="field">
                <span>Rundungsmodell</span>
                <select
                  className="select"
                  value={settings.pay.rounding}
                  onChange={(event) => updatePay({ rounding: event.target.value as AppSettings['pay']['rounding'] })}
                >
                  <option value="exact">Minutengenau</option>
                  <option value="nearest-5">Auf 5 Minuten</option>
                  <option value="nearest-15">Auf 15 Minuten</option>
                  <option value="started-training-unit">Je angefangene Ausbildungsstunde</option>
                  <option value="completed-training-units">Nur vollständige Ausbildungsstunden</option>
                </select>
                <small>Die Geldanzeige wird abschließend auf Cent gerundet.</small>
              </label>

              <label className="field">
                <span>Währung</span>
                <select className="select" value={settings.currency} disabled aria-label="Währung">
                  <option value="EUR">Euro (€)</option>
                </select>
                <small>Fahrschulzeit v0.1.0 verwendet Euro als feste Währung.</small>
              </label>
            </div>
          </section>

          <section className="card settings-section" id="settings-time">
            <SettingsSectionHeader
              icon={Clock3}
              title="Zeiterfassung"
              description="Vorgaben für neue Arbeitsblöcke lassen sich beim Erfassen jederzeit überschreiben."
            />
            <div className="settings-grid">
              <label className="field">
                <span>Standard-Pause</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="720"
                  step="1"
                  inputMode="numeric"
                  value={settings.defaultBreakMinutes}
                  onChange={(event) => updateSetting('defaultBreakMinutes', Math.round(nonNegativeNumber(event.target.value)))}
                />
                <small>Minuten, die bei einem neuen Eintrag vorgeschlagen werden.</small>
              </label>

              <label className="field">
                <span>Standard-Tätigkeit</span>
                <select
                  className="select"
                  value={settings.defaultCategoryId}
                  onChange={(event) => updateSetting('defaultCategoryId', event.target.value)}
                >
                  {sortedCategories
                    .filter((category) => category.active || category.id === settings.defaultCategoryId)
                    .map((category) => (
                      <option value={category.id} key={category.id}>{category.name}</option>
                    ))}
                </select>
                <small>Wird beim Öffnen des Erfassungsformulars vorausgewählt.</small>
              </label>

              <label className="field">
                <span>Minutenraster des TimePickers</span>
                <select
                  className="select"
                  value={settings.minuteStep}
                  onChange={(event) => updateSetting('minuteStep', Number(event.target.value) as AppSettings['minuteStep'])}
                >
                  <option value={1}>1 Minute</option>
                  <option value={5}>5 Minuten</option>
                  <option value={15}>15 Minuten</option>
                </select>
              </label>

              <label className="field">
                <span>Arbeit über Mitternacht</span>
                <select
                  className="select"
                  value={settings.overnightAllocation}
                  onChange={(event) => updateSetting('overnightAllocation', event.target.value as AppSettings['overnightAllocation'])}
                >
                  <option value="start-date">Vollständig dem Startdatum zuordnen</option>
                  <option value="split-next-day" disabled>Am Tageswechsel aufteilen (spätere Version)</option>
                </select>
              </label>

              <label className="field">
                <span>Voreingestellter Beginn</span>
                <input
                  className="input"
                  type="time"
                  step={settings.minuteStep * 60}
                  value={settings.defaultStartTime}
                  onChange={(event) => updateSetting('defaultStartTime', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Voreingestelltes Ende</span>
                <input
                  className="input"
                  type="time"
                  step={settings.minuteStep * 60}
                  value={settings.defaultEndTime}
                  onChange={(event) => updateSetting('defaultEndTime', event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="card settings-section" id="settings-appearance">
            <SettingsSectionHeader
              icon={Palette}
              title="Darstellung"
              description="Bestimme, welche Zeitwerte und welches Farbschema die App verwendet."
            />
            <div className="settings-grid">
              <label className="field">
                <span>Zeitanzeige</span>
                <select
                  className="select"
                  value={settings.displayMode}
                  onChange={(event) => updateSetting('displayMode', event.target.value as AppSettings['displayMode'])}
                >
                  <option value="clock">Nur Stunden und Minuten</option>
                  <option value="decimal">Nur Dezimalstunden</option>
                  <option value="training">Nur Ausbildungsstunden</option>
                  <option value="clock-training">Stunden und Ausbildungsstunden</option>
                  <option value="all">Alle Werte</option>
                </select>
              </label>

              <label className="field">
                <span>Farbschema</span>
                <select
                  className="select"
                  value={settings.theme}
                  onChange={(event) => updateSetting('theme', event.target.value as AppSettings['theme'])}
                >
                  <option value="system">Systemeinstellung</option>
                  <option value="light">Hell</option>
                  <option value="dark">Dunkel</option>
                </select>
              </label>

              <div className="span-all">
                <SwitchRow
                  label="Kompakte Kalenderanzeige"
                  description="Zeigt in jedem Kalendertag nur Arbeitszeit und Verdienst."
                  checked={settings.compactCalendar}
                  onChange={(checked) => updateSetting('compactCalendar', checked)}
                />
                <SwitchRow
                  label="Wochenstart am Montag"
                  description="In Phase 1 passend zur deutschen Kalenderdarstellung fest eingestellt."
                  checked={settings.weekStartsMonday}
                  disabled
                />
                <SwitchRow
                  label="24-Stunden-Format"
                  description="Beginn und Ende werden in Phase 1 immer im 24-Stunden-Format dargestellt."
                  checked={settings.use24Hour}
                  disabled
                />
              </div>
            </div>
          </section>

          <section className="card settings-section" id="settings-calendar">
            <SettingsSectionHeader
              icon={CalendarSync}
              title="Kalender-Sync"
              description="Konfiguriere Ziel, Textvorlagen und Verhalten für übertragene Kalendertermine."
            />
            <div className="settings-grid">
              <label className="field">
                <span>Zielkalender</span>
                <input
                  className="input"
                  type="text"
                  value={settings.calendar.targetCalendarName ?? ''}
                  placeholder="Noch kein Kalender ausgewählt"
                  readOnly
                />
                <small>Die Auswahl eines Gerätekalenders erfolgt im Reiter Kalender-Sync.</small>
              </label>

              <label className="field">
                <span>Terminfarbe</span>
                <select
                  className="select"
                  value={settings.calendar.color}
                  onChange={(event) => updateCalendar({ color: event.target.value as AppSettings['calendar']['color'] })}
                >
                  {calendarColors.map((color) => (
                    <option value={color.value} key={color.value}>{color.label}</option>
                  ))}
                </select>
                <small>Die tatsächliche Farbe kann vom Kalenderanbieter abweichen.</small>
              </label>

              <label className="field span-all">
                <span>Titelvorlage</span>
                <input
                  className="input"
                  type="text"
                  value={settings.calendar.titleTemplate}
                  onChange={(event) => updateCalendar({ titleTemplate: event.target.value })}
                  placeholder="Fahrschule – {tätigkeit}"
                />
                <small>Zum Beispiel: Fahrschule – {'{tätigkeit}'} – {'{arbeitszeit}'}</small>
              </label>

              <label className="field span-all">
                <span>Beschreibungsvorlage</span>
                <textarea
                  className="textarea"
                  value={settings.calendar.descriptionTemplate}
                  onChange={(event) => updateCalendar({ descriptionTemplate: event.target.value })}
                  placeholder="{arbeitszeit} · {ausbstunden}"
                />
                <small>
                  Platzhalter: {'{tätigkeit}'}, {'{arbeitszeit}'}, {'{ausbstunden}'}, {'{verdienst}'}, {'{fahrzeugklasse}'}, {'{bemerkung}'}, {'{start}'}, {'{ende}'}
                </small>
              </label>

              <div className="span-all">
                <SwitchRow
                  label="Automatisch übertragen"
                  description="Überträgt gespeicherte Arbeitsblöcke, sobald die Plattform Kalenderzugriff erlaubt."
                  checked={settings.calendar.automatic}
                  onChange={(checked) => updateCalendar({ automatic: checked })}
                />
                <SwitchRow
                  label="Änderungen automatisch aktualisieren"
                  description="Bereits verknüpfte Termine werden nach einer Bearbeitung angepasst."
                  checked={settings.calendar.updateAutomatically}
                  onChange={(checked) => updateCalendar({ updateAutomatically: checked })}
                />
                <SwitchRow
                  label="Termin beim Löschen ebenfalls entfernen"
                  description="Löscht den zugeordneten Kalendertermin zusammen mit dem Arbeitsblock."
                  checked={settings.calendar.deleteAutomatically}
                  onChange={(checked) => updateCalendar({ deleteAutomatically: checked })}
                />
                <SwitchRow
                  label="Verdienst im Kalender anzeigen"
                  description="Erlaubt den Platzhalter {verdienst} in privaten Kalenderterminen."
                  checked={settings.calendar.includeEarnings}
                  onChange={(checked) => updateCalendar({ includeEarnings: checked })}
                />
              </div>
            </div>
          </section>

          <section className="card settings-section" id="settings-categories">
            <SettingsSectionHeader
              icon={Tags}
              title="Kategorien"
              description="Bearbeite Tätigkeiten, eigene Vergütungssätze, Farben, Icons und Reihenfolge."
            />

            <div className="category-settings-list">
              {sortedCategories.map((category, index) => {
                const categoryRate = settings.pay.categoryRates?.[category.id] ?? category.rate
                const categoryStyle = { '--category-color': category.color } as CSSProperties

                return (
                  <div className="category-setting" key={category.id} style={categoryStyle}>
                    <span className="category-setting__icon" aria-hidden="true">
                      <CategoryIcon name={category.icon} />
                    </span>

                    <div>
                      <input
                        className="input"
                        type="text"
                        value={category.name}
                        onChange={(event) => void onUpdateCategory({ ...category, name: event.target.value })}
                        aria-label={`Name der Kategorie ${category.name}`}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <label className="field" style={{ flex: '1 1 125px' }}>
                          <span>Eigener Satz</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={categoryRate ?? ''}
                            placeholder="Standard"
                            onChange={(event) => updateCategoryRate(category, event.target.value)}
                            aria-label={`${category.name}: eigener Vergütungssatz`}
                          />
                        </label>
                        <label className="field" style={{ flex: '1 1 130px' }}>
                          <span>Icon</span>
                          <select
                            className="select"
                            value={category.icon}
                            onChange={(event) => void onUpdateCategory({ ...category, icon: event.target.value as CategoryIconName })}
                            aria-label={`${category.name}: Icon`}
                          >
                            {categoryIconOptions.map((option) => (
                              <option value={option.value} key={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Farbe</span>
                          <input
                            className="input"
                            type="color"
                            value={category.color}
                            onChange={(event) => void onUpdateCategory({ ...category, color: event.target.value })}
                            aria-label={`${category.name}: Farbe`}
                            style={{ width: 58, padding: 5 }}
                          />
                        </label>
                      </div>
                    </div>

                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => moveCategoryDown(index)}
                      disabled={index === sortedCategories.length - 1}
                      aria-label={`${category.name} in der Reihenfolge nach unten verschieben`}
                      title="Nach unten verschieben"
                    >
                      <ArrowDown size={17} />
                    </button>

                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={category.active}
                        onChange={(event) => void onUpdateCategory({ ...category, active: event.target.checked })}
                        aria-label={`${category.name} ${category.active ? 'deaktivieren' : 'aktivieren'}`}
                      />
                      <span aria-hidden="true" />
                    </label>
                  </div>
                )
              })}
            </div>

            <form onSubmit={addCategory} className="settings-grid" style={{ marginTop: 15 }}>
              <label className="field">
                <span>Neue Kategorie</span>
                <input
                  className="input"
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Zum Beispiel Nachtfahrt"
                  maxLength={80}
                />
              </label>
              <div style={{ alignSelf: 'end' }}>
                <button className="button" type="submit" disabled={!newCategoryName.trim()}>
                  <Plus size={17} />
                  Kategorie hinzufügen
                </button>
              </div>
            </form>
          </section>

          <section className="card settings-section" id="settings-data">
            <SettingsSectionHeader
              icon={Database}
              title="Daten"
              description="Exportiere deine lokalen Daten oder stelle eine Sicherung auf einem neuen Gerät wieder her."
            />

            <div className="notice" style={{ marginBottom: 15 }}>
              <HardDrive size={18} />
              <div>
                <strong>Lokaler Speicher: {storageMode}</strong><br />
                Arbeitszeiten bleiben auf diesem Gerät. Regelmäßige Backups schützen beim Gerätewechsel oder Zurücksetzen.
              </div>
            </div>

            <div className="data-action-grid">
              <DataAction
                icon={Download}
                title="Sicherung exportieren"
                description="Alle Arbeitszeiten und Einstellungen als Backup speichern."
                onClick={onExportBackup}
              />
              <DataAction
                icon={Upload}
                title="Sicherung importieren"
                description="Eine zuvor exportierte Sicherungsdatei wiederherstellen."
                onClick={() => importInputRef.current?.click()}
              />
              <DataAction
                icon={FileSpreadsheet}
                title="CSV exportieren"
                description="Arbeitsblöcke zur weiteren Auswertung als Tabelle sichern."
                onClick={onExportCsv}
              />
              <DataAction
                icon={Trash2}
                title="Alle Daten löschen"
                description="Arbeitszeiten und persönliche Einstellungen zurücksetzen."
                onClick={onResetData}
                danger
              />
            </div>

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => handleImportFile(event.target.files?.[0])}
            />

            <div style={{ marginTop: 15 }}>
              <SwitchRow
                label="Beispieldaten anzeigen"
                description="Blendet die mitgelieferten Demo-Arbeitszeiten in Kalender und Auswertung ein."
                checked={settings.showSampleData}
                onChange={(checked) => updateSetting('showSampleData', checked)}
              />
            </div>
          </section>

          <section className="card settings-section" id="settings-app">
            <SettingsSectionHeader
              icon={Info}
              title="App"
              description="Version, Updates und Diagnose für die lokale Kalenderanbindung."
            />

            <div className="about-card">
              <Logo compact />
              <div>
                <strong>Fahrschulzeit</strong>
                <small>Local-first · offlinefähig · keine Anmeldung erforderlich</small>
              </div>
              <span className="version-pill">v{APP_VERSION}</span>
            </div>

            <div className="data-action-grid" style={{ marginTop: 15 }}>
              <DataAction
                icon={RefreshCw}
                title="Nach Updates suchen"
                description="Prüft, ob eine neue App-Version zur Installation bereitsteht."
                onClick={onCheckUpdate}
              />
              <DataAction
                icon={Activity}
                title="Kalenderzugriff testen"
                description="Prüft Berechtigung und Verfügbarkeit der nativen Schnittstelle."
                onClick={onCalendarDiagnostic}
              />
            </div>

            <div className="notice" style={{ marginTop: 15 }}>
              <CalendarDays size={18} />
              <div>
                <strong>Version {APP_VERSION}</strong><br />
                Erste Arbeitsversion mit Zeiterfassung, Auswertungen, Datensicherung und vorbereiteter Kalenderanbindung.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
