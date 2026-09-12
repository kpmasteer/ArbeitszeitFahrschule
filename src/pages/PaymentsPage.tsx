import { ArrowLeft, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import type { AppSettings, AppWorkBlock, PaymentDraft, PaymentRecord } from '../app/app-types'
import { PageHeader } from '../components/PageHeader'
import { reconcilePayments } from '../domain/payments'
import { currentMonthKey, formatDateShort, formatMonthLong, shiftMonth, todayIso } from '../lib/date'
import { formatMoneyCents, parseDecimalInput } from '../lib/format'

interface PaymentsPageProps {
  readonly blocks: readonly AppWorkBlock[]
  readonly payments: readonly PaymentRecord[]
  readonly settings: AppSettings
  onSavePayment(draft: PaymentDraft): void | Promise<unknown>
  onDeletePayment(id: string): void | Promise<void>
  onBack(): void
}

function signedMoney(cents: number, currency: string): string {
  if (cents === 0) return formatMoneyCents(0, currency)
  return `${cents > 0 ? '+' : '−'}${formatMoneyCents(Math.abs(cents), currency)}`
}

export function PaymentsPage({ blocks, payments, settings, onSavePayment, onDeletePayment, onBack }: PaymentsPageProps) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [editing, setEditing] = useState<PaymentRecord>()
  const [formOpen, setFormOpen] = useState(false)
  const [paymentDate, setPaymentDate] = useState(todayIso())
  const [salaryMonth, setSalaryMonth] = useState(shiftMonth(currentMonthKey(), -1))
  const [salaryMonthTouched, setSalaryMonthTouched] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // Arbeitsblöcke sind die einzige Quelle für den erwarteten Verdienst.
  // Bewusst keine lokale Kopie oder längerlebiger Cache: jeder Store-Render
  // berechnet auch alle Folgemonats-Salden aus den aktuellen Blöcken neu.
  const rows = reconcilePayments(
    blocks.filter((block) => !block.sample),
    payments,
    settings.pay,
    settings.payControlStartingBalanceCents,
    selectedMonth,
  )
  const row = rows.find((entry) => entry.month === selectedMonth) ?? {
    month: selectedMonth,
    expectedEarningsCents: 0,
    paidCents: 0,
    monthlyDifferenceCents: 0,
    previousBalanceCents: settings.payControlStartingBalanceCents,
    totalBalanceCents: settings.payControlStartingBalanceCents,
    status: settings.payControlStartingBalanceCents < 0 ? 'open' as const : settings.payControlStartingBalanceCents > 0 ? 'credit' as const : 'settled' as const,
  }
  const monthPayments = payments
    .filter((payment) => payment.salaryMonth === selectedMonth)
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate))

  const openNew = () => {
    setEditing(undefined)
    const suggestedPaymentDate = todayIso()
    setPaymentDate(suggestedPaymentDate)
    setSalaryMonth(shiftMonth(suggestedPaymentDate.slice(0, 7), -1))
    setSalaryMonthTouched(false)
    setAmount('')
    setNote('')
    setError(undefined)
    setFormOpen(true)
  }

  const openEdit = (payment: PaymentRecord) => {
    setEditing(payment)
    setPaymentDate(payment.paymentDate)
    setSalaryMonth(payment.salaryMonth)
    setSalaryMonthTouched(true)
    setAmount((payment.amountCents / 100).toFixed(2).replace('.', ','))
    setNote(payment.note ?? '')
    setError(undefined)
    setFormOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current) return
    const euro = parseDecimalInput(amount)
    const amountCents = euro === undefined ? 0 : Math.round(euro * 100)
    if (!paymentDate || !/^\d{4}-(0[1-9]|1[0-2])$/.test(salaryMonth) || !Number.isSafeInteger(amountCents) || amountCents < 1) {
      setError('Bitte Zahlungsdatum, Lohnmonat und einen Betrag von mindestens 0,01 € eintragen.')
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await onSavePayment({ id: editing?.id, paymentDate, salaryMonth, amountCents, note: note.trim() || undefined })
      setSelectedMonth(salaryMonth)
      setFormOpen(false)
      setEditing(undefined)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zahlung konnte nicht gespeichert werden.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fortlaufende Lohnkontrolle"
        title="Lohnkontrolle"
        description="Das Zahlungsdatum zeigt den Geldeingang. Der zugeordnete Lohnmonat bestimmt die Monatsauswertung. Der Saldo führt offene Beträge über die Monate fort."
        actions={<button className="button button--secondary" type="button" onClick={onBack}><ArrowLeft size={17} />Zur Auswertung</button>}
      />

      <div className="month-strip">
        <div className="month-strip__nav">
          <button className="icon-button" type="button" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="Vorheriger Monat"><ChevronLeft size={20} /></button>
          <div className="month-strip__label"><h2>{formatMonthLong(selectedMonth)}</h2></div>
          <button className="icon-button" type="button" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="Nächster Monat"><ChevronRight size={20} /></button>
        </div>
        {selectedMonth !== currentMonthKey() && <button className="text-button" type="button" onClick={() => setSelectedMonth(currentMonthKey())}>Aktueller Monat</button>}
      </div>

      <section className="card card--padded wage-control-card">
        <div className="wage-control-card__header">
          <div><span className="section-kicker">Monatskarte</span><h2>Lohnkontrolle</h2></div>
          <span className={`payment-status payment-status--${row.status}`}>
            {row.status === 'settled' ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
            {row.status === 'open' ? 'Offene Forderung' : row.status === 'credit' ? 'Guthaben' : 'Alles ausgeglichen'}
          </span>
        </div>
        <div className="wage-control-grid">
          <div><span>Erwarteter Verdienst</span><strong>{formatMoneyCents(row.expectedEarningsCents, settings.currency)}</strong></div>
          <div><span>Tatsächlich erhalten</span><strong>{formatMoneyCents(row.paidCents, settings.currency)}</strong></div>
          <div><span>Monatsdifferenz</span><strong className={row.monthlyDifferenceCents < 0 ? 'is-negative' : row.monthlyDifferenceCents > 0 ? 'is-positive' : ''}>{signedMoney(row.monthlyDifferenceCents, settings.currency)}</strong></div>
          <div><span>Übertrag aus Vormonaten</span><strong>{signedMoney(row.previousBalanceCents, settings.currency)}</strong></div>
          <div className="wage-control-grid__balance"><span>Aktueller Gesamtsaldo</span><strong className={row.totalBalanceCents < 0 ? 'is-negative' : row.totalBalanceCents > 0 ? 'is-positive' : ''}>{signedMoney(row.totalBalanceCents, settings.currency)}</strong><small>{row.totalBalanceCents < 0 ? 'Dieser Betrag ist noch offen.' : row.totalBalanceCents > 0 ? 'Dieser Betrag ist als Guthaben vorausbezahlt.' : 'Erwarteter und gezahlter Lohn sind ausgeglichen.'}</small></div>
        </div>
      </section>

      <section className="card table-card">
        <div className="table-card__header">
          <div><h2>Zahlungen für diesen Lohnmonat</h2><p>Zahlungsdatum und zugehöriger Lohnmonat bleiben getrennt nachvollziehbar.</p></div>
          <button className="button button--small" type="button" onClick={openNew}><Plus size={16} />Zahlung erfassen</button>
        </div>
        <Modal open={formOpen} title={editing ? 'Zahlung bearbeiten' : 'Zahlung erfassen'} subtitle="Der Lohnmonat kann vom Zahlungsdatum abweichen." onClose={() => { if (!savingRef.current) setFormOpen(false) }}>
          <form aria-label="Zahlungsformular" aria-busy={saving} onSubmit={(event) => void submit(event)}>
            <fieldset className="payment-fields" disabled={saving}><div className="settings-grid">
              <label className="field"><span>Zahlungsdatum *</span><input className="input" type="date" required value={paymentDate} onChange={(event) => {
                const nextDate = event.target.value
                setPaymentDate(nextDate)
                if (!salaryMonthTouched && nextDate) setSalaryMonth(shiftMonth(nextDate.slice(0, 7), -1))
              }} /></label>
              <label className="field"><span>Betrag *</span><div className="input-with-suffix"><input className="input" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /><span>€</span></div></label>
              <label className="field"><span>Zugehöriger Lohnmonat *</span><input className="input" type="month" required value={salaryMonth} onChange={(event) => { setSalaryMonth(event.target.value); setSalaryMonthTouched(true) }} /></label>
              <label className="field span-all"><span>Notiz</span><input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Zum Beispiel Abschlag oder Nachzahlung" /></label>
            </div></fieldset>
            {error && <div role="alert" className="notice notice--warning"><TriangleAlert size={17} />{error}</div>}
            <div className="payment-form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => setFormOpen(false)}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : editing ? 'Änderungen speichern' : 'Zahlung speichern'}</button></div>
          </form>
        </Modal>
        {monthPayments.length > 0 ? (
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Zahlungsdatum</th><th>Betrag</th><th>Lohnmonat</th><th>Notiz</th><th /></tr></thead><tbody>
            {monthPayments.map((payment) => <tr key={payment.id}><td>{formatDateShort(payment.paymentDate)}</td><td><strong>{formatMoneyCents(payment.amountCents, settings.currency)}</strong></td><td>gehört zu {formatMonthLong(payment.salaryMonth)}</td><td>{payment.note || '–'}</td><td><div className="table-actions"><button className="icon-button" type="button" aria-label={`Zahlung vom ${formatDateShort(payment.paymentDate)} bearbeiten`} onClick={() => openEdit(payment)}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={`Zahlung vom ${formatDateShort(payment.paymentDate)} löschen`} onClick={() => onDeletePayment(payment.id)}><Trash2 size={16} /></button></div></td></tr>)}
          </tbody></table></div>
        ) : <div className="empty-state"><Banknote size={23} /><h3>Noch keine Zahlung zugeordnet</h3><p>Dem Lohnmonat {formatMonthLong(selectedMonth)} ist noch keine Zahlung zugeordnet.</p></div>}
      </section>
    </div>
  )
}
