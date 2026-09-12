import type { WorkBlockDraft } from '../app/app-types'
import { isIsoDate, isTime } from './serviceUtils'

export interface CsvImportResult {
  readonly drafts: readonly WorkBlockDraft[]
  readonly skippedRows: number
  readonly warnings: readonly string[]
}

function parseRows(content: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        value += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
    } else value += char
  }
  if (quoted) throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.')
  row.push(value)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ')
}

function parseGermanDateTime(value: string): { date: string; time: string } | undefined {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!match) return undefined
  return { date: `${match[3]}-${match[2]}-${match[1]}`, time: `${match[4]}:${match[5]}` }
}

function parseRate(value: string): number | undefined {
  const normalized = value.trim().replace(/\s|EUR/giu, '').replace(',', '.')
  if (!normalized || normalized === '-') return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function appendNote(...parts: Array<string | undefined>): string | undefined {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(' · ')
  return text || undefined
}

export function parseLegacyWorkTimeCsv(content: string, categoryId: string): CsvImportResult {
  const clean = content.replace(/^\uFEFF/, '')
  const delimiter = clean.split(/[\r\n]/, 1)[0].includes(';') ? ';' : ','
  const rows = parseRows(clean, delimiter)
  if (rows.length < 2) throw new Error('Die CSV-Datei enthält keine Arbeitszeitzeilen.')
  const headers = rows[0].map(normalizeHeader)
  const indexOf = (name: string) => headers.indexOf(normalizeHeader(name))
  if (indexOf('Datum') >= 0 && indexOf('Beginn') >= 0 && indexOf('Ende') >= 0) {
    const warnings = indexOf('Pausendetails') < 0
      ? ['Älterer CSV-Export: Pausen werden als Gesamtdauer übernommen. Vergütung wird mit den aktuellen Einstellungen berechnet. Für vollständige Wiederherstellung bitte JSON-Sicherungen verwenden.'] : []
    const drafts = rows.slice(1).map((row, offset): WorkBlockDraft => {
      const cell = (name: string) => {
        const value = row[indexOf(name)] ?? ''
        // Die vom Export vor Tabellenformeln geschützten Texte wiederherstellen.
        return /^'[\s]*[=+\-@]/u.test(value) ? value.slice(1) : value
      }
      const fail = () => { throw new Error(`CSV-Zeile ${offset + 2}: Datum, Uhrzeit, Pause oder Vergütung ist ungültig.`) }
      if (!isIsoDate(cell('Datum')) || !isTime(cell('Beginn')) || !isTime(cell('Ende'))) fail()
      let breaks: WorkBlockDraft['breaks'] = []
      if (cell('Pausendetails')) {
        let parsed: unknown
        try { parsed = JSON.parse(cell('Pausendetails')) } catch { fail() }
        if (!Array.isArray(parsed) || !parsed.every((pause) => pause && (
          pause.kind === 'duration' ? Number.isFinite(pause.minutes) && pause.minutes >= 0
            : pause.kind === 'interval' && isTime(pause.startTime) && isTime(pause.endTime)
        ))) fail()
        breaks = parsed as WorkBlockDraft['breaks']
      } else if (cell('Pause')) {
        const match = cell('Pause').match(/^(\d+):([0-5]\d)$/)
        if (!match) fail()
        const minutes = Number(match![1]) * 60 + Number(match![2])
        if (minutes) breaks = [{ kind: 'duration', minutes }]
      }
      const rateText = cell('Abweichender Satz')
      const rateOverride = rateText ? parseRate(rateText) : undefined
      if (rateText && rateOverride === undefined) fail()
      const paid = cell('Vergütung')
      if (paid && paid !== 'vergütet' && paid !== 'unvergütet') fail()
      return {
        date: cell('Datum'), startTime: cell('Beginn'), endTime: cell('Ende'), breaks,
        categoryId: cell('Kategorie-ID') || categoryId, rateOverride, isPaid: paid !== 'unvergütet',
        activity: (indexOf('Eigene Tätigkeit') >= 0 ? cell('Eigene Tätigkeit') : cell('Tätigkeit')) || undefined,
        vehicleClass: cell('Fahrzeugklasse') || undefined, studentOrAssignment: cell('Fahrschüler / Auftrag') || undefined,
        notes: cell('Bemerkung') || undefined, location: cell('Ort') || undefined, calendarText: cell('Kalendertext') || undefined,
      }
    })
    return { drafts, skippedRows: 0, warnings }
  }
  const indices = {
    start: indexOf('Normal: Start'),
    pauseStart: indexOf('Start der Pause'),
    pauseEnd: indexOf('Ende der Pause'),
    normalEnd: indexOf('Normal: Ende'),
    overtimeEnd: indexOf('Mehrarbeit: Ende'),
    normalRate: indexOf('Übliche Arbeitszeit Kosten pro Stunde - EUR'),
    overtimeRate: indexOf('Mehrarbeit Kosten pro Stunde - EUR'),
    paid: indexOf('Bezahlt'),
    note: indexOf('Hinweis'),
  }
  if (indices.start < 0 || indices.normalEnd < 0) {
    throw new Error('Das CSV-Format wird nicht erkannt: „Normal: Start“ oder „Normal: Ende“ fehlt.')
  }

  const drafts: WorkBlockDraft[] = []
  const warnings: string[] = []
  let skippedRows = 0
  rows.slice(1).forEach((row, rowIndex) => {
    const start = parseGermanDateTime(row[indices.start] ?? '')
    const normalEnd = parseGermanDateTime(row[indices.normalEnd] ?? '')
    const overtimeEnd = indices.overtimeEnd >= 0 ? parseGermanDateTime(row[indices.overtimeEnd] ?? '') : undefined
    if (!start || (!normalEnd && !overtimeEnd)) {
      skippedRows += 1
      return
    }
    const end = overtimeEnd ?? normalEnd!
    const normalRate = indices.normalRate >= 0 ? parseRate(row[indices.normalRate] ?? '') : undefined
    const overtimeRate = indices.overtimeRate >= 0 ? parseRate(row[indices.overtimeRate] ?? '') : undefined
    const rateOverride = overtimeEnd && (normalEnd?.time === start.time || normalRate === 0)
      ? overtimeRate
      : normalRate ?? overtimeRate
    if (overtimeEnd && normalEnd?.time !== start.time && normalRate !== undefined && overtimeRate !== undefined && normalRate !== overtimeRate) {
      warnings.push(`Zeile ${rowIndex + 2}: unterschiedliche Normal-/Mehrarbeitssätze wurden mit dem Normalsatz importiert.`)
    }
    const pauseStart = indices.pauseStart >= 0 ? parseGermanDateTime(row[indices.pauseStart] ?? '') : undefined
    const pauseEnd = indices.pauseEnd >= 0 ? parseGermanDateTime(row[indices.pauseEnd] ?? '') : undefined
    const legacyPaid = indices.paid >= 0 ? row[indices.paid]?.trim() : undefined
    const legacyNote = indices.note >= 0 ? row[indices.note]?.trim() : undefined
    drafts.push({
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      breaks: pauseStart && pauseEnd
        ? [{ kind: 'interval', startTime: pauseStart.time, endTime: pauseEnd.time }]
        : [],
      categoryId,
      rateOverride,
      isPaid: true,
      activity: 'CSV-Import',
      notes: appendNote(legacyNote, legacyPaid ? `Alter Zahlungsstatus: ${legacyPaid}` : undefined),
    })
  })
  if (drafts.length === 0) throw new Error('In der CSV-Datei wurden keine gültigen Arbeitszeiten gefunden.')
  return { drafts, skippedRows, warnings }
}

export function workBlockImportKey(block: Pick<WorkBlockDraft, 'date' | 'startTime' | 'endTime'>): string {
  return `${block.date}|${block.startTime}|${block.endTime}`
}
