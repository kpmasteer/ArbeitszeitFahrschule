import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { AppSettings, AppWorkBlock, WorkCategory } from '../app/app-types'
import { PageHeader } from '../components/PageHeader'
import {
  EARNINGS_SUBCENT_SCALE,
  UNASSIGNED_CATEGORY_ID,
  aggregateMonth,
  aggregateYear,
  type MonthSummary,
  type YearSummary,
} from '../domain'
import {
  currentMonthKey,
  daysInMonth,
  formatDateShort,
  formatMonthLong,
  monthFromKey,
  shiftMonth,
  todayIso,
} from '../lib/date'
import {
  formatDecimalHours,
  formatDuration,
  formatMoneyCents,
  formatTrainingHours,
} from '../lib/format'

type InsightsMode = 'month' | 'year'

export interface InsightsPageProps {
  readonly blocks: readonly AppWorkBlock[]
  readonly categories: readonly WorkCategory[]
  readonly settings: AppSettings
  readonly onExportCsv: (scope: 'month' | 'year', key: string) => void
  readonly onPrintMonth: (month: string) => void
}

interface MiniStatProps {
  readonly label: string
  readonly value: ReactNode
}

interface BarPoint {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly active: boolean
  readonly title: string
}

interface CategoryMetric {
  readonly categoryId: string
  readonly workMinutes: number
  readonly earningsSubcentUnits: number
}

function MiniStat({ label, value }: MiniStatProps) {
  return (
    <article className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function capitalize(value: string): string {
  return value ? `${value[0].toLocaleUpperCase('de-DE')}${value.slice(1)}` : value
}

function monthName(month: string, style: 'long' | 'short' = 'long'): string {
  return capitalize(new Intl.DateTimeFormat('de-DE', { month: style }).format(monthFromKey(month)))
}

function WorkBarChart({ points, label }: { readonly points: readonly BarPoint[]; readonly label: string }) {
  const maximum = Math.max(0, ...points.map((point) => point.value))

  return (
    <div className="bar-chart" role="list" aria-label={label}>
      {points.map((point) => {
        const height = maximum === 0 ? 0 : (point.value / maximum) * 100
        return (
          <div
            className={`bar-chart__column ${point.active ? 'is-active' : ''}`}
            key={point.key}
            role="listitem"
            aria-label={point.title}
            title={point.title}
          >
            <div className="bar-chart__track" aria-hidden="true">
              <div className="bar-chart__bar" style={{ height: `${height}%` }} />
            </div>
            <span>{point.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function monthCategoryMetrics(summary: MonthSummary): readonly CategoryMetric[] {
  return Object.values(summary.byCategory)
    .map((category) => ({
      categoryId: category.categoryId,
      workMinutes: category.workMinutes,
      earningsSubcentUnits: category.earningsSubcentUnits,
    }))
    .sort((left, right) => right.workMinutes - left.workMinutes)
}

function yearCategoryMetrics(summary: YearSummary): readonly CategoryMetric[] {
  const totals = new Map<string, CategoryMetric>()
  for (const month of summary.months) {
    for (const category of Object.values(month.byCategory)) {
      const existing = totals.get(category.categoryId)
      totals.set(category.categoryId, {
        categoryId: category.categoryId,
        workMinutes: (existing?.workMinutes ?? 0) + category.workMinutes,
        earningsSubcentUnits:
          (existing?.earningsSubcentUnits ?? 0) + category.earningsSubcentUnits,
      })
    }
  }

  return Array.from(totals.values()).sort((left, right) => right.workMinutes - left.workMinutes)
}

function CategoryBreakdown({
  metrics,
  categories,
  currency,
}: {
  readonly metrics: readonly CategoryMetric[]
  readonly categories: readonly WorkCategory[]
  readonly currency: string
}) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const maximum = Math.max(0, ...metrics.map((metric) => metric.workMinutes))

  if (metrics.length === 0) {
    return (
      <div className="card card--padded empty-state">
        <span className="empty-state__icon"><BarChart3 size={22} /></span>
        <h3>Noch keine Tätigkeitsdaten</h3>
        <p>Sobald Arbeitsblöcke erfasst sind, erscheint hier die Verteilung nach Kategorie.</p>
      </div>
    )
  }

  return (
    <div className="card card--padded category-breakdown">
      {metrics.map((metric) => {
        const category = categoriesById.get(metric.categoryId)
        const categoryName = metric.categoryId === UNASSIGNED_CATEGORY_ID
          ? 'Ohne Kategorie'
          : category?.name ?? metric.categoryId
        const categoryColor = category?.color ?? 'var(--ink-faint)'
        const width = maximum === 0 ? 0 : (metric.workMinutes / maximum) * 100
        const earningsCents = Math.round(metric.earningsSubcentUnits / EARNINGS_SUBCENT_SCALE)
        const style = { '--category-color': categoryColor } as CSSProperties

        return (
          <div
            className="category-row"
            key={metric.categoryId}
            style={style}
            title={`${categoryName}: ${formatDuration(metric.workMinutes)}, ${formatMoneyCents(earningsCents, currency)}`}
          >
            <span className="category-row__name">
              <i className="category-row__dot" aria-hidden="true" />
              {categoryName}
            </span>
            <span className="category-row__track" aria-hidden="true">
              <i className="category-row__fill" style={{ width: `${width}%` }} />
            </span>
            <span className="category-row__value">{formatDuration(metric.workMinutes)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function InsightsPage({
  blocks,
  categories,
  settings,
  onExportCsv,
  onPrintMonth,
}: InsightsPageProps) {
  const [mode, setMode] = useState<InsightsMode>('month')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const selectedYear = Number(selectedMonth.slice(0, 4))
  const today = todayIso()
  const currentMonth = currentMonthKey()

  const monthSummary = useMemo(
    () => aggregateMonth(blocks, settings.pay, selectedMonth),
    [blocks, selectedMonth, settings.pay],
  )
  const yearSummary = useMemo(
    () => aggregateYear(blocks, settings.pay, selectedYear),
    [blocks, selectedYear, settings.pay],
  )
  const categoryMetrics = useMemo(
    () => mode === 'month' ? monthCategoryMetrics(monthSummary) : yearCategoryMetrics(yearSummary),
    [mode, monthSummary, yearSummary],
  )

  const monthBars = useMemo(() => {
    const summariesByDate = new Map(monthSummary.days.map((day) => [day.date, day]))
    return Array.from({ length: daysInMonth(selectedMonth) }, (_, index): BarPoint => {
      const day = String(index + 1).padStart(2, '0')
      const date = `${selectedMonth}-${day}`
      const workMinutes = summariesByDate.get(date)?.workMinutes ?? 0
      return {
        key: date,
        label: String(index + 1),
        value: workMinutes,
        active: date === today,
        title: `${formatDateShort(date)}: ${formatDuration(workMinutes)}`,
      }
    })
  }, [monthSummary.days, selectedMonth, today])

  const yearBars = useMemo(
    () => yearSummary.months.map((month): BarPoint => ({
      key: month.month,
      label: monthName(month.month, 'short').replace('.', ''),
      value: month.workMinutes,
      active: month.month === currentMonth,
      title: `${formatMonthLong(month.month)}: ${formatDuration(month.workMinutes)}`,
    })),
    [currentMonth, yearSummary.months],
  )

  const shiftPeriod = (delta: number) => {
    if (mode === 'month') {
      setSelectedMonth((value) => shiftMonth(value, delta))
      return
    }

    setSelectedMonth((value) => {
      const nextYear = Math.min(9999, Math.max(1, Number(value.slice(0, 4)) + delta))
      return `${String(nextYear).padStart(4, '0')}-${value.slice(5, 7)}`
    })
  }

  const exportKey = mode === 'month' ? selectedMonth : String(selectedYear)
  const periodLabel = mode === 'month' ? formatMonthLong(selectedMonth) : String(selectedYear)
  const strongestMonth = yearSummary.strongestMonthByWork
    ? monthName(yearSummary.strongestMonthByWork)
    : '–'

  return (
    <div className="page">
      <PageHeader
        eyebrow="Auswertung"
        title="Zeiten und Verdienst"
        description="Monats- und Jahreswerte werden direkt aus deinen lokal gespeicherten Arbeitsblöcken berechnet."
        actions={(
          <>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => onExportCsv(mode, exportKey)}
            >
              <Download size={17} />
              CSV exportieren
            </button>
            {mode === 'month' && (
              <button className="button" type="button" onClick={() => onPrintMonth(selectedMonth)}>
                <Printer size={17} />
                Monatsbericht
              </button>
            )}
          </>
        )}
      />

      <div className="tabs-row">
        <div className="segmented" role="group" aria-label="Auswertungszeitraum">
          <button
            className={mode === 'month' ? 'is-active' : ''}
            type="button"
            onClick={() => setMode('month')}
            aria-pressed={mode === 'month'}
          >
            Monatsübersicht
          </button>
          <button
            className={mode === 'year' ? 'is-active' : ''}
            type="button"
            onClick={() => setMode('year')}
            aria-pressed={mode === 'year'}
          >
            Jahresübersicht
          </button>
        </div>
      </div>

      <div className="month-strip">
        <h2>{mode === 'month' ? 'Monat' : 'Jahr'}</h2>
        <div className="month-strip__nav">
          <button
            className="icon-button"
            type="button"
            onClick={() => shiftPeriod(-1)}
            aria-label={mode === 'month' ? 'Vorheriger Monat' : 'Vorheriges Jahr'}
          >
            <ChevronLeft size={19} />
          </button>
          <strong className="month-strip__label" aria-live="polite">{periodLabel}</strong>
          <button
            className="icon-button"
            type="button"
            onClick={() => shiftPeriod(1)}
            aria-label={mode === 'month' ? 'Nächster Monat' : 'Nächstes Jahr'}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>

      {mode === 'month' ? (
        <section className="summary-grid" aria-label={`Kennzahlen für ${periodLabel}`}>
          <MiniStat label="Anwesenheit" value={formatDuration(monthSummary.attendanceMinutes)} />
          <MiniStat label="Pausen" value={formatDuration(monthSummary.breakMinutes)} />
          <MiniStat label="Bezahlte Arbeitszeit" value={formatDuration(monthSummary.paidWorkMinutes)} />
          <MiniStat label="Zeitstunden" value={`${formatDecimalHours(monthSummary.workMinutes)} Std.`} />
          <MiniStat label="Ausbildungsstunden" value={`${formatTrainingHours(monthSummary.workMinutes)} AusbStd.`} />
          <MiniStat label="Verdienst" value={formatMoneyCents(monthSummary.earningsCents, settings.currency)} />
          <MiniStat label="Arbeitstage" value={monthSummary.workDayCount} />
          <MiniStat label="Arbeitsblöcke" value={monthSummary.workBlockCount} />
          <MiniStat
            label="Ø pro Arbeitstag"
            value={monthSummary.workDayCount === 0 ? '–' : formatDuration(monthSummary.workMinutes / monthSummary.workDayCount)}
          />
        </section>
      ) : (
        <section className="summary-grid" aria-label={`Kennzahlen für ${periodLabel}`}>
          <MiniStat label="Arbeitszeit" value={formatDuration(yearSummary.workMinutes)} />
          <MiniStat label="Ausbildungsstunden" value={`${formatTrainingHours(yearSummary.workMinutes)} AusbStd.`} />
          <MiniStat label="Pausen" value={formatDuration(yearSummary.breakMinutes)} />
          <MiniStat label="Verdienst" value={formatMoneyCents(yearSummary.earningsCents, settings.currency)} />
          <MiniStat label="Arbeitstage" value={yearSummary.workDayCount} />
          <MiniStat label="Arbeitsblöcke" value={yearSummary.workBlockCount} />
          <MiniStat label="Aktive Monate" value={yearSummary.activeMonthCount} />
          <MiniStat
            label="Ø aktiver Monat"
            value={yearSummary.activeMonthCount === 0 ? '–' : formatDuration(yearSummary.averageWorkMinutesPerActiveMonth)}
          />
          <MiniStat label="Stärkster Monat" value={strongestMonth} />
        </section>
      )}

      <div className="section-heading">
        <div>
          <h2>Arbeitszeit im Verlauf</h2>
          <p>{mode === 'month' ? 'Nettoarbeitszeit pro Kalendertag.' : 'Nettoarbeitszeit pro Monat.'}</p>
        </div>
      </div>
      <section className="card chart-card">
        <WorkBarChart
          points={mode === 'month' ? monthBars : yearBars}
          label={`Balkendiagramm der Arbeitszeit für ${periodLabel}`}
        />
      </section>

      <div className="section-heading">
        <div>
          <h2>{mode === 'month' ? 'Tagesübersicht' : 'Monatsübersicht'}</h2>
          <p>{mode === 'month' ? 'Alle Arbeitstage des ausgewählten Monats.' : 'Alle zwölf Monate im direkten Vergleich.'}</p>
        </div>
      </div>

      {mode === 'month' && monthSummary.days.length === 0 ? (
        <div className="card card--padded empty-state">
          <span className="empty-state__icon"><BarChart3 size={22} /></span>
          <h3>Noch keine Arbeitszeit</h3>
          <p>Für {periodLabel} sind keine Arbeitsblöcke gespeichert.</p>
        </div>
      ) : (
        <div className="card table-card">
          <table className="data-table" aria-label={mode === 'month' ? `Tageswerte für ${periodLabel}` : `Monatswerte für ${periodLabel}`}>
            <thead>
              {mode === 'month' ? (
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Arbeitszeit</th>
                  <th scope="col">Pause</th>
                  <th scope="col">AusbStd.</th>
                  <th scope="col">Lohn</th>
                </tr>
              ) : (
                <tr>
                  <th scope="col">Monat</th>
                  <th scope="col">Arbeitszeit</th>
                  <th scope="col">Pause</th>
                  <th scope="col">AusbStd.</th>
                  <th scope="col">Arbeitstage</th>
                  <th scope="col">Lohn</th>
                </tr>
              )}
            </thead>
            <tbody>
              {mode === 'month'
                ? monthSummary.days.map((day) => (
                    <tr key={day.date}>
                      <td>{formatDateShort(day.date)}</td>
                      <td>{formatDuration(day.workMinutes)}</td>
                      <td>{day.breakMinutes === 0 ? '–' : formatDuration(day.breakMinutes)}</td>
                      <td>{formatTrainingHours(day.workMinutes)}</td>
                      <td>{formatMoneyCents(day.earningsCents, settings.currency)}</td>
                    </tr>
                  ))
                : yearSummary.months.map((month) => (
                    <tr key={month.month}>
                      <td>{monthName(month.month)}</td>
                      <td>{formatDuration(month.workMinutes)}</td>
                      <td>{month.breakMinutes === 0 ? '–' : formatDuration(month.breakMinutes)}</td>
                      <td>{formatTrainingHours(month.workMinutes)}</td>
                      <td>{month.workDayCount}</td>
                      <td>{formatMoneyCents(month.earningsCents, settings.currency)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-heading">
        <div>
          <h2>Nach Tätigkeitsart</h2>
          <p>Verteilung der Nettoarbeitszeit im ausgewählten Zeitraum.</p>
        </div>
      </div>
      <CategoryBreakdown metrics={categoryMetrics} categories={categories} currency={settings.currency} />
    </div>
  )
}

