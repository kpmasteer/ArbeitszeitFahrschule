import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../app/defaults'
import type { AppWorkBlock, PaymentRecord } from '../app/app-types'
import { currentMonthKey } from '../lib/date'
import { PaymentsPage } from './PaymentsPage'

afterEach(cleanup)

const month = currentMonthKey()
const base: AppWorkBlock = {
  id: 'base', date: `${month}-10`, startTime: '08:00', endTime: '18:00', breaks: [],
  rateOverride: 60, isPaid: true, createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
}
const deleted: AppWorkBlock = { ...base, id: 'deleted', date: `${month}-20`, rateOverride: 10 }
const payment: PaymentRecord = {
  id: 'payment', paymentDate: `${month}-28`, salaryMonth: month, amountCents: 60000,
  createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
}

function page(blocks: readonly AppWorkBlock[]) {
  return <PaymentsPage
    blocks={blocks}
    payments={[payment]}
    settings={DEFAULT_SETTINGS}
    onSavePayment={vi.fn()}
    onDeletePayment={vi.fn()}
    onBack={vi.fn()}
  />
}

describe('PaymentsPage Reaktivität', () => {
  it('verhindert doppelte Zahlungen und hält bei Speicherfehlern die Eingabe offen', async () => {
    let rejectSave!: (reason: Error) => void
    const save = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject }))
    render(<PaymentsPage blocks={[]} payments={[]} settings={DEFAULT_SETTINGS} onSavePayment={save} onDeletePayment={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zahlung erfassen' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Zahlungsdatum *')).toHaveFocus()
    fireEvent.change(screen.getByLabelText(/Betrag/), { target: { value: '125,50' } })
    const form = screen.getByRole('form', { name: 'Zahlungsformular' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toBeDefined()
    expect(screen.getByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled()
    await act(async () => rejectSave(new Error('Speicher voll')))
    expect(screen.getByRole('alert')).toHaveTextContent('Speicher voll')
    expect(screen.getByLabelText(/Betrag/)).toHaveValue('125,50')
    expect(screen.getByRole('button', { name: 'Zahlung speichern' })).toBeEnabled()
  })
  it('berechnet Monatsverdienst und Gesamtsaldo nach gelöschter Arbeitszeit sofort neu', () => {
    const view = render(page([base, deleted]))
    expect(screen.getByText('Erwarteter Verdienst').parentElement).toHaveTextContent('700,00')
    expect(screen.getByText('Aktueller Gesamtsaldo').parentElement).toHaveTextContent('−100,00')

    view.rerender(page([base]))
    expect(screen.getByText('Erwarteter Verdienst').parentElement).toHaveTextContent('600,00')
    expect(screen.getByText('Aktueller Gesamtsaldo').parentElement).toHaveTextContent('0,00')
  })
})
