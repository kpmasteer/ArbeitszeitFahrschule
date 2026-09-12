import type { AppWorkBlock } from '../app/app-types'

export interface SuggestedTimeRange {
  readonly startTime: string
  readonly endTime: string
  readonly source: 'history' | 'weekday-default' | 'settings-default'
  readonly sampleCount: number
}

const WEEKDAY_DEFAULTS: Partial<Record<number, readonly [string, string]>> = {
  5: ['12:00', '16:00'],
  6: ['08:00', '16:00'],
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00`).getDay()
}

function mostFrequent(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || values.lastIndexOf(right[0]) - values.lastIndexOf(left[0]))[0]?.[0]
}

export function suggestTimeRange(
  date: string,
  blocks: readonly AppWorkBlock[],
  defaults: readonly [string, string],
): SuggestedTimeRange {
  const weekday = weekdayOf(date)
  const history = blocks.filter((block) => !block.sample && weekdayOf(block.date) === weekday)
  if (history.length > 0) {
    const exactCounts = new Map<string, number>()
    history.forEach((block) => {
      const key = `${block.startTime}|${block.endTime}`
      exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1)
    })
    const exact = [...exactCounts.entries()].sort((left, right) => right[1] - left[1])[0]
    if (exact && exact[1] >= 2) {
      const [startTime, endTime] = exact[0].split('|')
      return { startTime, endTime, source: 'history', sampleCount: history.length }
    }
    return {
      startTime: mostFrequent(history.map((block) => block.startTime)) ?? defaults[0],
      endTime: mostFrequent(history.map((block) => block.endTime)) ?? defaults[1],
      source: 'history',
      sampleCount: history.length,
    }
  }
  const weekdayDefault = WEEKDAY_DEFAULTS[weekday]
  if (weekdayDefault) {
    return { startTime: weekdayDefault[0], endTime: weekdayDefault[1], source: 'weekday-default', sampleCount: 0 }
  }
  return { startTime: defaults[0], endTime: defaults[1], source: 'settings-default', sampleCount: 0 }
}
