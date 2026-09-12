import { describe, expect, it } from 'vitest'
import { suggestTimeRange } from './timeSuggestions'

describe('suggestTimeRange', () => {
  it('verwendet ohne Historie Freitag und Samstag als sinnvolle Startvorgaben', () => {
    expect(suggestTimeRange('2026-07-24', [], ['09:00', '10:00'])).toMatchObject({ startTime: '12:00', endTime: '16:00', source: 'weekday-default' })
    expect(suggestTimeRange('2026-07-25', [], ['09:00', '10:00'])).toMatchObject({ startTime: '08:00', endTime: '16:00', source: 'weekday-default' })
  })

  it('lernt eine wiederkehrende Uhrzeit desselben Wochentags', () => {
    const blocks = ['2026-07-03', '2026-07-10'].map((date, index) => ({
      id: String(index), date, startTime: '12:30', endTime: '16:30', breaks: [], categoryId: 'practice', isPaid: true,
      createdAt: '', updatedAt: '',
    }))
    expect(suggestTimeRange('2026-07-17', blocks, ['09:00', '10:00'])).toMatchObject({ startTime: '12:30', endTime: '16:30', source: 'history' })
  })
})
