import { describe, expect, it } from 'vitest'
import { migratePaymentRecords } from '../../app/payment-migration'
import { reconcilePayments } from '../payments'

const pay = { model: 'time-hour' as const, standardRate: 60, rounding: 'exact' as const }
const months = ['01', '02', '03', '04', '05']
const blocks = months.map((month) => ({
  id: month,
  date: `2026-${month}-10`,
  startTime: '08:00',
  endTime: '18:00',
  breaks: [],
}))

describe('fortlaufende Lohnkontrolle', () => {
  it('berechnet Saldo und Übertrag exakt nach Gezahlt minus Erwartet', () => {
    const paidEuro = [600, 500, 700, 400, 700]
    const rows = reconcilePayments(blocks, paidEuro.map((amount, index) => ({
      paymentDate: `2026-${months[index]}-28`, amountCents: amount * 100,
    })), pay)

    expect(rows.map((row) => row.monthlyDifferenceCents)).toEqual([0, -10000, 10000, -20000, 10000])
    expect(rows.map((row) => row.totalBalanceCents)).toEqual([0, -10000, 0, -20000, -10000])
    expect(rows[2].previousBalanceCents).toBe(-10000)
  })

  it('berücksichtigt einen Startsaldo im ersten Übertrag', () => {
    const [row] = reconcilePayments([blocks[0]], [{ paymentDate: '2026-01-31', amountCents: 60000 }], pay, -25000)
    expect(row.previousBalanceCents).toBe(-25000)
    expect(row.totalBalanceCents).toBe(-25000)
  })

  it('summiert mehrere Zahlungen desselben Monats', () => {
    const [row] = reconcilePayments([blocks[0]], [
      { paymentDate: '2026-01-15', amountCents: 20000 },
      { paymentDate: '2026-01-31', amountCents: 40000 },
    ], pay)
    expect(row.paidCents).toBe(60000)
    expect(row.totalBalanceCents).toBe(0)
  })

  it('ordnet eine im Mai eingegangene Zahlung über salaryMonth dem April zu', () => {
    const aprilBlock = { ...blocks[0], id: 'april', date: '2026-04-10' }
    const mayBlock = { ...blocks[0], id: 'may', date: '2026-05-10' }
    const rows = reconcilePayments([aprilBlock, mayBlock], [{
      paymentDate: '2026-05-31', salaryMonth: '2026-04', amountCents: 60000,
    }], pay)
    expect(rows.find((row) => row.month === '2026-04')?.paidCents).toBe(60000)
    expect(rows.find((row) => row.month === '2026-05')?.paidCents).toBe(0)
  })

  it('berechnet erwarteten Verdienst und alle Folgesalden nach dem Löschen neu', () => {
    const mayBase = { ...blocks[0], id: 'may-base', date: '2026-05-10' }
    const mayDeleted = { ...blocks[0], id: 'may-deleted', date: '2026-05-20', rateOverride: 10 }
    const june = { ...blocks[0], id: 'june', date: '2026-06-10' }
    const payments = [
      { paymentDate: '2026-05-31', salaryMonth: '2026-05', amountCents: 60000 },
      { paymentDate: '2026-06-30', salaryMonth: '2026-06', amountCents: 60000 },
    ]
    const before = reconcilePayments([mayBase, mayDeleted, june], payments, pay)
    const after = reconcilePayments([mayBase, june], payments, pay)
    expect(before.find((row) => row.month === '2026-05')?.expectedEarningsCents).toBe(70000)
    expect(before.find((row) => row.month === '2026-06')?.totalBalanceCents).toBe(-10000)
    expect(after.find((row) => row.month === '2026-05')?.expectedEarningsCents).toBe(60000)
    expect(after.find((row) => row.month === '2026-06')?.totalBalanceCents).toBe(0)
  })

  it('migriert alte Zahlungen mit date und ergänzt updatedAt', () => {
    const migrated = migratePaymentRecords([{
      id: 'legacy-1', date: '2026-02-28', amountCents: 50000,
      note: 'Teilzahlung', createdAt: '2026-02-28T12:00:00.000Z',
    }], '2026-07-21T12:00:00.000Z')
    expect(migrated).toEqual([{
      id: 'legacy-1', paymentDate: '2026-02-28', amountCents: 50000,
      salaryMonth: '2026-02',
      note: 'Teilzahlung', createdAt: '2026-02-28T12:00:00.000Z', updatedAt: '2026-02-28T12:00:00.000Z',
    }])
  })
})
