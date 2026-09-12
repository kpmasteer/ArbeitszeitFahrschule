import { aggregateMonth } from './aggregation'
import type { PaySettings, WorkBlock } from './types'

export interface PaymentLike {
  readonly paymentDate: string
  readonly salaryMonth?: string
  readonly amountCents: number
}

export interface MonthlyPaymentReconciliation {
  readonly month: string
  readonly expectedEarningsCents: number
  readonly paidCents: number
  readonly monthlyDifferenceCents: number
  readonly previousBalanceCents: number
  /** Negativ = offene Forderung, positiv = Guthaben. */
  readonly totalBalanceCents: number
  readonly status: 'open' | 'settled' | 'credit'
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function relevantMonths(
  blocks: readonly WorkBlock[],
  payments: readonly PaymentLike[],
  throughMonth?: string,
): string[] {
  const values = [
    ...blocks.map((block) => block.date.slice(0, 7)),
    ...payments.map((payment) => payment.salaryMonth ?? payment.paymentDate.slice(0, 7)),
    ...(throughMonth ? [throughMonth] : []),
  ].filter((value) => /^\d{4}-\d{2}$/.test(value)).sort()
  if (values.length === 0) return []
  const months: string[] = []
  for (let month = values[0]; month <= values.at(-1)!; month = shiftMonth(month, 1)) months.push(month)
  return months
}

/**
 * Fortlaufende Lohnkontrolle. Die bestehende Verdienstberechnung wird über
 * `aggregateMonth` unverändert wiederverwendet.
 */
export function reconcilePayments(
  blocks: readonly WorkBlock[],
  payments: readonly PaymentLike[],
  paySettings: PaySettings,
  startingBalanceCents = 0,
  throughMonth?: string,
): readonly MonthlyPaymentReconciliation[] {
  let balance = startingBalanceCents
  return relevantMonths(blocks, payments, throughMonth).map((month) => {
    const previousBalanceCents = balance
    const expectedEarningsCents = aggregateMonth(blocks, paySettings, month).earningsCents
    const paidCents = payments
      .filter((payment) => (payment.salaryMonth ?? payment.paymentDate.slice(0, 7)) === month)
      .reduce((sum, payment) => sum + payment.amountCents, 0)
    const monthlyDifferenceCents = paidCents - expectedEarningsCents
    balance = previousBalanceCents + monthlyDifferenceCents
    return {
      month,
      expectedEarningsCents,
      paidCents,
      monthlyDifferenceCents,
      previousBalanceCents,
      totalBalanceCents: balance,
      status: balance < 0 ? 'open' : balance > 0 ? 'credit' : 'settled',
    }
  })
}
