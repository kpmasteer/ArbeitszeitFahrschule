import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../app/defaults'
import { currentMonthKey, formatMonthLong, shiftMonth } from '../lib/date'
import { CalendarPage } from './CalendarPage'

afterEach(cleanup)

function renderCalendar(onSelectedDateChange = vi.fn(), onNew = vi.fn()) {
  const month = currentMonthKey()
  render(<CalendarPage
    blocks={[{
      id: 'block-1', date: `${month}-10`, startTime: '08:00', endTime: '18:00', breaks: [],
      categoryId: 'practice', rateOverride: 124.55, isPaid: true,
      createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
    }]}
    categories={DEFAULT_CATEGORIES}
    settings={DEFAULT_SETTINGS}
    initialDate={`${month}-10`}
    syncStatusFor={() => 'pending'}
    onSelectedDateChange={onSelectedDateChange}
    onNew={onNew}
    onEdit={vi.fn()}
    onDelete={vi.fn()}
    onSyncBlock={vi.fn()}
  />)
  return month
}

describe('Monatskalender', () => {
  it('merkt den leeren Tag bereits vor dem Öffnen der Erfassung', () => {
    const selected = vi.fn()
    const open = vi.fn()
    const month = renderCalendar(selected, open)
    selected.mockClear()
    fireEvent.click(screen.getByRole('button', { name: `${month}-12, keine Arbeitszeit` }))
    expect(selected).toHaveBeenCalledWith(`${month}-12`)
    expect(open).toHaveBeenCalledWith(`${month}-12`)
    expect(selected.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
  })
  it('übernimmt Pointer Capture erst beim Wischen und lässt normale Tagesklicks zu', () => {
    const month = renderCalendar()
    const calendar = screen.getByRole('region', { name: `Kalender ${formatMonthLong(month)}` })
    const capture = vi.fn()
    calendar.setPointerCapture = capture
    const day = screen.getByRole('button', { name: new RegExp(`${month}-10,`) })
    fireEvent.pointerDown(day, { pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 200 })
    expect(capture).not.toHaveBeenCalled()
    fireEvent.pointerUp(day, { pointerId: 1, isPrimary: true, button: 0, clientX: 202, clientY: 201 })
    fireEvent.click(day)
    expect(day).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(day, { pointerId: 2, isPrimary: true, button: 0, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(day, { pointerId: 2, clientX: 100, clientY: 205 })
    expect(capture).toHaveBeenCalledWith(2)
  })
  it('zeigt den erwarteten Monatsverdienst aus der bestehenden Aggregation', () => {
    renderCalendar()
    const label = screen.getByText('Erwarteter Verdienst')
    expect(label.parentElement).toHaveTextContent('1.245,50')
  })

  it('wechselt horizontal per Wischgeste, aber nicht bei vertikaler Bewegung', () => {
    const month = renderCalendar()
    const calendar = screen.getByRole('region', { name: `Kalender ${formatMonthLong(month)}` })
    fireEvent.pointerDown(calendar, { pointerId: 1, isPrimary: true, button: 0, clientX: 300, clientY: 120 })
    fireEvent.pointerUp(calendar, { pointerId: 1, isPrimary: true, button: 0, clientX: 220, clientY: 260 })
    expect(screen.getByRole('heading', { name: formatMonthLong(month) })).toBeInTheDocument()

    fireEvent.pointerDown(calendar, { pointerId: 2, isPrimary: true, button: 0, clientX: 300, clientY: 120 })
    fireEvent.pointerUp(calendar, { pointerId: 2, isPrimary: true, button: 0, clientX: 210, clientY: 125 })
    expect(screen.getByRole('heading', { name: formatMonthLong(shiftMonth(month, 1)) })).toBeInTheDocument()
  })

  it('wechselt über den Jahreswechsel korrekt', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
  })
})
