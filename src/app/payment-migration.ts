import type { PaymentRecord } from './app-types'

interface LegacyPaymentRecord {
  readonly id?: unknown
  readonly date?: unknown
  readonly paymentDate?: unknown
  readonly salaryMonth?: unknown
  readonly amountCents?: unknown
  readonly note?: unknown
  readonly createdAt?: unknown
  readonly updatedAt?: unknown
}

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime())
}

function validSalaryMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Migrates the v0.1.1 `{ date }` payment shape without dropping valid records. */
export function migratePaymentRecords(value: unknown, migratedAt = new Date().toISOString()): PaymentRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const legacy = candidate as LegacyPaymentRecord
    const paymentDate = validIsoDate(legacy.paymentDate)
      ? legacy.paymentDate
      : validIsoDate(legacy.date) ? legacy.date : undefined
    if (!paymentDate || !Number.isInteger(legacy.amountCents) || Number(legacy.amountCents) <= 0) return []
    const createdAt = validTimestamp(legacy.createdAt) ? legacy.createdAt : migratedAt
    return [{
      id: typeof legacy.id === 'string' && legacy.id.trim() ? legacy.id : `payment-migrated-${index}-${paymentDate}`,
      paymentDate,
      salaryMonth: validSalaryMonth(legacy.salaryMonth) ? legacy.salaryMonth : paymentDate.slice(0, 7),
      amountCents: Number(legacy.amountCents),
      note: typeof legacy.note === 'string' && legacy.note.trim() ? legacy.note.trim() : undefined,
      createdAt,
      updatedAt: validTimestamp(legacy.updatedAt) ? legacy.updatedAt : createdAt,
    }]
  })
}
