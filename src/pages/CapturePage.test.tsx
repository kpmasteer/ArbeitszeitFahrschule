import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../app/defaults'
import { CapturePage } from './CapturePage'

afterEach(cleanup)

it('behält beim Verschieben eines vorhandenen Nachtblocks die Uhrzeiten und verträgt ein leeres Datum', () => {
  render(<CapturePage
    settings={DEFAULT_SETTINGS} categories={DEFAULT_CATEGORIES}
    initialBlock={{ id: 'night', date: '2026-09-11', startTime: '21:30', endTime: '00:15', breaks: [], isPaid: true, createdAt: '', updatedAt: '' }}
    getSuggestedTimeRange={() => ({ startTime: '08:00', endTime: '16:00', source: 'history', sampleCount: 2 })}
    onSave={vi.fn()} onCancel={vi.fn()} onAddCategory={vi.fn()}
  />)
  fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '2026-09-12' } })
  expect(screen.getByLabelText('Beginn *')).toHaveValue('21:30')
  expect(screen.getByLabelText('Ende *')).toHaveValue('00:15')
  fireEvent.change(screen.getByLabelText('Datum *'), { target: { value: '' } })
  expect(screen.getByLabelText('Datum *')).toHaveValue('')
  expect(screen.queryByText(/Das Ende liegt am Folgetag/)).not.toBeInTheDocument()
})
