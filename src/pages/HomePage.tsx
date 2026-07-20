import {
  ArrowRight,
  CalendarDays,
  CalendarSync,
  Clock3,
  Coffee,
  Euro,
  GraduationCap,
  Plus,
  Repeat2,
} from 'lucide-react'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { AppSettings, AppWorkBlock, WorkCategory } from '../app/app-types'
import type { AppPage } from '../components/AppShell'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { aggregateMonth, calculateWorkBlock } from '../domain'
import { currentMonthKey, formatDateLong, formatMonthLong, todayIso } from '../lib/date'
import {
  formatClockRange,
  formatDuration,
  formatMoneyCents,
  formatTrainingHours,
  pluralize,
} from '../lib/format'

export interface HomePageProps {
  readonly blocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly pendingSyncCount: number
  readonly onNavigate: (page: AppPage) => void
  readonly onRepeatLast: (block: AppWorkBlock) => void
  readonly onSyncPending: () => void
  readonly onNew: (date?: string) => void
  readonly onOpenCalendar: (date?: string) => void
}

function latestEnteredBlock(blocks: readonly AppWorkBlock[]): AppWorkBlock | undefined {
  return blocks.reduce<AppWorkBlock | undefined>((latest, candidate) => {
    if (!latest) return candidate
    const latestKey = latest.createdAt || `${latest.date}T${latest.startTime}`
    const candidateKey = candidate.createdAt || `${candidate.date}T${candidate.startTime}`
    return candidateKey >= latestKey ? candidate : latest
  }, undefined)
}

function categoryLabel(
  block: AppWorkBlock,
  categoriesById: ReadonlyMap<string, WorkCategory>,
): string {
  return block.activity?.trim() ||
    (block.categoryId ? categoriesById.get(block.categoryId)?.name : undefined) ||
    'Arbeitsblock'
}

export function HomePage({
  blocks,
  categories,
  settings,
  pendingSyncCount,
  onNavigate,
  onRepeatLast,
  onSyncPending,
  onNew,
  onOpenCalendar,
}: HomePageProps) {
  const today = todayIso()
  const month = currentMonthKey()
  const monthSummary = useMemo(
    () => aggregateMonth(blocks, settings.pay, month),
    [blocks, month, settings.pay],
  )
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const lastBlock = useMemo(() => latestEnteredBlock(blocks), [blocks])
  const todayEntries = useMemo(
    () => blocks
      .filter((block) => block.date === today)
      .map((block) => ({ block, calculation: calculateWorkBlock(block, settings.pay) }))
      .sort((left, right) => left.block.startTime.localeCompare(right.block.startTime)),
    [blocks, settings.pay, today],
  )
  const todayDayNumber = Number(today.slice(-2))
  const todayLong = formatDateLong(today)

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatMonthLong(month)}
        title="Deine Fahrschulzeit im Blick"
        description="Arbeitsblöcke, Ausbildungsstunden und Verdienst – lokal gespeichert und auch offline verfügbar."
        actions={(
          <>
            {pendingSyncCount > 0 && (
              <button className="button button--secondary" type="button" onClick={onSyncPending}>
                <CalendarSync size={17} />
                {pluralize(pendingSyncCount, 'Eintrag ausstehend', 'Einträge ausstehend')}
              </button>
            )}
            <button className="button" type="button" onClick={() => onNew()}>
              <Plus size={18} />
              Arbeitszeit eintragen
            </button>
          </>
        )}
      />

      <section className="stats-grid" aria-label={`Zusammenfassung für ${formatMonthLong(month)}`}>
        <StatCard
          icon={Clock3}
          label="Arbeitszeit"
          value={formatDuration(monthSummary.workMinutes)}
          helper={`${pluralize(monthSummary.workBlockCount, 'Block', 'Blöcke')} an ${pluralize(monthSummary.workDayCount, 'Tag', 'Tagen')}`}
          tone="red"
          featured
        />
        <StatCard
          icon={GraduationCap}
          label="Ausbildungsstunden"
          value={`${formatTrainingHours(monthSummary.workMinutes)} AusbStd.`}
          helper="Eine Einheit entspricht 45 Minuten"
          tone="blue"
        />
        <StatCard
          icon={Coffee}
          label="Pausen"
          value={formatDuration(monthSummary.breakMinutes)}
          helper={`${formatDuration(monthSummary.attendanceMinutes)} Anwesenheit`}
          tone="amber"
        />
        <StatCard
          icon={Euro}
          label="Verdienst"
          value={formatMoneyCents(monthSummary.earningsCents, settings.currency)}
          helper={monthSummary.paidWorkMinutes < monthSummary.workMinutes ? 'Unvergütete Zeit bereits berücksichtigt' : 'Auf Basis deiner Vergütungseinstellungen'}
          tone="green"
        />
      </section>

      <div className="section-heading">
        <div>
          <h2>Schnellzugriff</h2>
          <p>Die häufigsten Aktionen ohne Umwege.</p>
        </div>
        <button className="text-button" type="button" onClick={() => onNavigate('insights')}>
          Zur Auswertung
          <ArrowRight size={16} />
        </button>
      </div>

      <section className="dashboard-grid" aria-label="Schnellzugriff und heutige Arbeitszeiten">
        <div className="quick-actions">
          <button className="quick-action" type="button" onClick={() => onNew(today)}>
            <span className="quick-action__icon"><Plus size={19} /></span>
            <strong>Arbeitszeit eintragen</strong>
          </button>
          <button className="quick-action" type="button" onClick={() => onOpenCalendar(today)}>
            <span className="quick-action__icon"><CalendarDays size={19} /></span>
            <strong>Kalender öffnen</strong>
          </button>
          <button
            className="quick-action"
            type="button"
            disabled={!lastBlock}
            onClick={() => lastBlock && onRepeatLast(lastBlock)}
            aria-label={lastBlock ? `Letzten Eintrag vom ${lastBlock.date} wiederholen` : 'Noch kein Eintrag zum Wiederholen vorhanden'}
          >
            <span className="quick-action__icon"><Repeat2 size={19} /></span>
            <strong>{lastBlock ? 'Letzten Eintrag wiederholen' : 'Noch kein Eintrag vorhanden'}</strong>
          </button>
          <button
            className="quick-action"
            type="button"
            onClick={pendingSyncCount > 0 ? onSyncPending : () => onNavigate('sync')}
          >
            <span className="quick-action__icon"><CalendarSync size={19} /></span>
            <strong>
              {pendingSyncCount > 0
                ? `${pluralize(pendingSyncCount, 'Eintrag', 'Einträge')} übertragen`
                : 'Kalender-Sync öffnen'}
            </strong>
          </button>
        </div>

        <article className="card today-card">
          <header className="today-card__header">
            <div>
              <p>Heute</p>
              <h2>{todayLong}</h2>
            </div>
            <span className="today-card__date" aria-hidden="true">{todayDayNumber}</span>
          </header>

          {todayEntries.length === 0 ? (
            <div>
              <p className="today-card__empty">Für heute ist noch keine Arbeitszeit eingetragen.</p>
              <button className="button button--small" type="button" onClick={() => onNew(today)}>
                <Plus size={16} />
                Ersten Block anlegen
              </button>
            </div>
          ) : (
            todayEntries.map(({ block, calculation }) => {
              const category = block.categoryId ? categoriesById.get(block.categoryId) : undefined
              const style = {
                '--entry-color': category?.color ?? 'var(--accent)',
              } as CSSProperties

              return (
                <div className="today-entry" key={block.id} style={style}>
                  <span className="today-entry__line" aria-hidden="true" />
                  <div>
                    <strong>{categoryLabel(block, categoriesById)}</strong>
                    <span>{formatClockRange(block.startTime, block.endTime)} · {formatDuration(calculation.workMinutes)}</span>
                  </div>
                  <strong className="today-entry__money">
                    {calculation.isPaid
                      ? formatMoneyCents(calculation.earningsCents, settings.currency)
                      : 'Unvergütet'}
                  </strong>
                </div>
              )
            })
          )}
        </article>
      </section>
    </div>
  )
}
