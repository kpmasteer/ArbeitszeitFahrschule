import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coffee,
  Euro,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppSettings, AppWorkBlock, WorkCategory } from '../app/app-types'
import { CategoryIcon } from '../components/CategoryIcon'
import { PageHeader } from '../components/PageHeader'
import { aggregateMonth, calculateWorkBlock } from '../domain'
import { calendarCells, currentMonthKey, formatDateLong, formatMonthLong, shiftMonth, todayIso, WEEKDAY_LABELS } from '../lib/date'
import { formatClockRange, formatDuration, formatMoneyCents } from '../lib/format'
import type { CalendarSyncStatus } from '../services/calendarSync'

interface CalendarPageProps {
  readonly blocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly initialDate?: string
  syncStatusFor(block: AppWorkBlock): CalendarSyncStatus
  onNew(date?: string): void
  onEdit(block: AppWorkBlock): void
  onDelete(block: AppWorkBlock): void
  onSyncBlock(block: AppWorkBlock): void
}

const statusLabels: Record<CalendarSyncStatus, string> = {
  pending: 'Noch nicht übertragen',
  synced: 'Übertragen',
  modified: 'Geändert',
  missing: 'Termin fehlt',
  error: 'Fehler',
}

export function CalendarPage({
  blocks,
  categories,
  settings,
  initialDate,
  syncStatusFor,
  onNew,
  onEdit,
  onDelete,
  onSyncBlock,
}: CalendarPageProps) {
  const initialMonth = currentMonthKey()
  const [month, setMonth] = useState(initialDate?.slice(0, 7) ?? initialMonth)
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayIso())

  useEffect(() => {
    if (!initialDate) return
    setSelectedDate(initialDate)
    setMonth(initialDate.slice(0, 7))
  }, [initialDate])

  const summary = useMemo(() => aggregateMonth(blocks, settings.pay, month), [blocks, month, settings.pay])
  const cells = useMemo(() => calendarCells(month), [month])
  const dayByDate = useMemo(() => new Map(summary.days.map((day) => [day.date, day])), [summary.days])
  const selectedBlocks = useMemo(
    () => blocks.filter((block) => block.date === selectedDate).sort((left, right) => left.startTime.localeCompare(right.startTime)),
    [blocks, selectedDate],
  )
  const selectedSummary = dayByDate.get(selectedDate)

  const selectMonth = (next: string) => {
    setMonth(next)
    if (!selectedDate.startsWith(next)) setSelectedDate(`${next}-01`)
  }

  const categoryFor = (id?: string) => categories.find((category) => category.id === id)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Alle Arbeitstage auf einen Blick"
        title="Kalender"
        description="Arbeitsblöcke bleiben vollständig ihrem Startdatum zugeordnet – auch wenn sie über Mitternacht gehen."
        actions={(
          <button className="button" onClick={() => onNew(selectedDate)}>
            <Plus size={18} /> Arbeitszeit eintragen
          </button>
        )}
      />

      <div className="month-strip">
        <div className="month-strip__nav">
          <button className="icon-button" onClick={() => selectMonth(shiftMonth(month, -1))} aria-label="Vorheriger Monat"><ChevronLeft size={20} /></button>
          <div className="month-strip__label"><h2>{formatMonthLong(month)}</h2></div>
          <button className="icon-button" onClick={() => selectMonth(shiftMonth(month, 1))} aria-label="Nächster Monat"><ChevronRight size={20} /></button>
        </div>
        {month !== initialMonth && (
          <button className="text-button" onClick={() => { setMonth(initialMonth); setSelectedDate(todayIso()) }}>Heute</button>
        )}
      </div>

      <div className="calendar-layout">
        <section className="card calendar-card" aria-label={`Kalender ${formatMonthLong(month)}`}>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const day = dayByDate.get(cell.date)
              const dayBlocks = blocks.filter((block) => block.date === cell.date)
              const className = [
                'calendar-day',
                !cell.inMonth && 'is-outside',
                cell.isToday && 'is-today',
                selectedDate === cell.date && 'is-selected',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={cell.date}
                  className={className}
                  onClick={() => {
                    setSelectedDate(cell.date)
                    if (!cell.inMonth) setMonth(cell.date.slice(0, 7))
                  }}
                  aria-label={`${cell.date}${day ? `, ${formatDuration(day.workMinutes)}, ${formatMoneyCents(day.earningsCents)}` : ', keine Arbeitszeit'}`}
                >
                  <span className="calendar-day__number">{cell.day}</span>
                  {day && (
                    <span className="calendar-day__summary">
                      <strong>{formatDuration(day.workMinutes)}</strong>
                      <span>{formatMoneyCents(day.earningsCents)}</span>
                    </span>
                  )}
                  {dayBlocks.length > 0 && (
                    <span className="calendar-day__dots" aria-hidden="true">
                      {dayBlocks.slice(0, 4).map((block) => (
                        <i key={block.id} style={{ '--dot-color': categoryFor(block.categoryId)?.color ?? '#b4232d' } as CSSProperties} />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <aside className="card day-panel">
          <div className="day-panel__top">
            <div>
              <h2>{selectedDate.slice(-2).replace(/^0/, '')}. {formatMonthLong(selectedDate.slice(0, 7)).split(' ')[0]}</h2>
              <p>{formatDateLong(selectedDate)}</p>
            </div>
            <button className="icon-button" onClick={() => onNew(selectedDate)} aria-label="Arbeitsblock an diesem Tag hinzufügen"><CalendarPlus size={19} /></button>
          </div>

          {selectedBlocks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon"><Clock3 size={24} /></span>
              <h3>Noch kein Arbeitsblock</h3>
              <p>Für diesen Tag ist nichts eingetragen. Ein neuer Block übernimmt das Datum automatisch.</p>
              <button className="button button--small" onClick={() => onNew(selectedDate)}><Plus size={16} /> Eintragen</button>
            </div>
          ) : (
            <>
              {selectedBlocks.map((block, index) => {
                const calculation = calculateWorkBlock(block, settings.pay)
                const category = categoryFor(block.categoryId)
                const status = syncStatusFor(block)
                return (
                  <article key={block.id} className="entry-card" style={{ '--entry-color': category?.color ?? '#b4232d' } as CSSProperties}>
                    <div className="entry-card__header">
                      <div>
                        <strong>Block {index + 1} · {category?.name ?? 'Sonstige Tätigkeit'}</strong>
                        <p className="entry-card__time">{formatClockRange(block.startTime, block.endTime)}</p>
                      </div>
                      <details className="entry-menu">
                        <summary className="icon-button" aria-label="Aktionen für Arbeitsblock"><MoreHorizontal size={18} /></summary>
                        <div className="entry-menu__popover">
                          <button onClick={() => onEdit(block)}><Pencil size={15} /> Bearbeiten</button>
                          {status !== 'synced' && <button onClick={() => onSyncBlock(block)}><RefreshCw size={15} /> Übertragen</button>}
                          <button className="is-danger" onClick={() => onDelete(block)}><Trash2 size={15} /> Löschen</button>
                        </div>
                      </details>
                    </div>
                    <div className="entry-card__meta">
                      <span className="chip"><Clock3 size={13} /> {formatDuration(calculation.workMinutes)}</span>
                      {calculation.breakMinutes > 0 && <span className="chip"><Coffee size={13} /> {calculation.breakMinutes} Min.</span>}
                      <span className="chip"><Euro size={13} /> {formatMoneyCents(calculation.earningsCents)}</span>
                      <span className={`chip ${status === 'synced' ? 'chip--success' : status === 'error' ? 'chip--warning' : 'chip--accent'}`}>
                        {status === 'synced' ? <Check size={13} /> : status === 'error' ? <CircleAlert size={13} /> : <RefreshCw size={13} />}
                        {statusLabels[status]}
                      </span>
                    </div>
                  </article>
                )
              })}

              {selectedSummary && (
                <div className="day-total">
                  <div className="day-total__row"><span>Anwesenheit</span><strong>{formatDuration(selectedSummary.attendanceMinutes)}</strong></div>
                  <div className="day-total__row"><span>Pausen</span><strong>{formatDuration(selectedSummary.breakMinutes)}</strong></div>
                  <div className="day-total__row"><span>Ausbildungsstunden</span><strong>{new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(selectedSummary.trainingHours)}</strong></div>
                  <div className="day-total__row day-total__row--main"><span>Bezahlt · Verdienst</span><strong>{formatDuration(selectedSummary.paidWorkMinutes)} · {formatMoneyCents(selectedSummary.earningsCents)}</strong></div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
