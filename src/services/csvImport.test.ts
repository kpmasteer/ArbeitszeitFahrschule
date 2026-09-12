import { describe, expect, it } from 'vitest'
import { parseLegacyWorkTimeCsv } from './csvImport'
import { createWorkBlocksCsv } from './csv'

const header = 'Vormerkung,Normal: Start,Start der Pause,Ende der Pause,Normal: Ende,Mehrarbeit: Ende,Vormerkung Kosten pro Stunde -  EUR,Übliche Arbeitszeit Kosten pro Stunde -  EUR,Pause Kosten pro Stunde -  EUR,Mehrarbeit Kosten pro Stunde -  EUR,Bezahlt,Hinweis'

describe('parseLegacyWorkTimeCsv', () => {
  it('importiert den eigenen CSV-Export mit Pausendetails, Satz und mehrzeiligen Texten', () => {
    const block = {
      id: 'roundtrip', date: '2026-09-12', startTime: '21:00', endTime: '01:00',
      breaks: [{ kind: 'interval' as const, startTime: '22:00', endTime: '22:15' }, { kind: 'duration' as const, minutes: 10 }],
      categoryId: 'practice', rateOverride: 32.5, isPaid: false, activity: 'Nachtfahrt',
      notes: '=Test; "Text"\nzweite Zeile', vehicleClass: 'BE', calendarText: 'Ausbildung',
    }
    const csv = createWorkBlocksCsv([block], () => ({ attendanceMinutes: 240, breakMinutes: 25, workMinutes: 215, paidMinutes: 0, timeHours: 215 / 60, trainingHours: 215 / 45, earningsCents: 0 }))
    const result = parseLegacyWorkTimeCsv(csv, 'other')
    const { id: _id, ...expected } = block
    expect(result.drafts[0]).toMatchObject(expected)
    expect(result.warnings).toEqual([])
  })

  it('liest ältere eigene CSVs und weist auf die eingeschränkte Wiederherstellung hin', () => {
    const result = parseLegacyWorkTimeCsv('Datum;Beginn;Ende;Pause;Vergütung\n2026-09-12;08:00;12:00;0:30;vergütet', 'practice')
    expect(result.drafts[0].breaks).toEqual([{ kind: 'duration', minutes: 30 }])
    expect(result.warnings).toHaveLength(1)
  })

  it('weist ungültige CSVs zurück statt unvollständige Arbeitszeiten zu übernehmen', () => {
    expect(() => parseLegacyWorkTimeCsv('Datum;Beginn;Ende\n2026-09-99;08:00;12:00', 'practice')).toThrow(/CSV-Zeile 2/)
    expect(() => parseLegacyWorkTimeCsv('Datum;Beginn;Ende\n"2026-09-12;08:00;12:00', 'practice')).toThrow(/Anführungszeichen/)
  })
  it('übernimmt normale Zeit, Pause, Satz und alten Zahlungsstatus', () => {
    const result = parseLegacyWorkTimeCsv(`${header}\n-,16/01/2026 12:30,16/01/2026 15:00,16/01/2026 15:15,16/01/2026 18:45,-,-,20,0,-,Nein,"Test"\nGesamt`, 'practice')
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toMatchObject({
      date: '2026-01-16', startTime: '12:30', endTime: '18:45', rateOverride: 20,
      breaks: [{ kind: 'interval', startTime: '15:00', endTime: '15:15' }],
    })
    expect(result.drafts[0].notes).toContain('Alter Zahlungsstatus: Nein')
  })

  it('erkennt reine Mehrarbeit bei identischem Normalbeginn und -ende', () => {
    const result = parseLegacyWorkTimeCsv(`${header}\n-,10/06/2026 18:00,-,-,10/06/2026 18:00,10/06/2026 22:00,-,0,-,20,Nein,""`, 'practice')
    expect(result.drafts[0]).toMatchObject({ startTime: '18:00', endTime: '22:00', rateOverride: 20 })
  })
})
