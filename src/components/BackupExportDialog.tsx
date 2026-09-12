import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { downloadTextFile } from '../services/serviceUtils'

interface Props {
  content: string
  filename: string
  onClose(): void
}

export function BackupExportDialog({ content, filename, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const shareFile = useMemo(() => {
    if (!navigator.share || !navigator.canShare) return undefined
    // Manche Android-Browser erlauben Textdateien, aber keine JSON-Dateien.
    // Beide Varianten enthalten dieselbe vollständige JSON-Sicherung.
    for (const file of [new File([content], filename, { type: 'application/json' }), new File([content], `${filename}.txt`, { type: 'text/plain' })]) {
      try { if (navigator.canShare({ files: [file] })) return file } catch { /* Download bleibt verfügbar. */ }
    }
    return undefined
  }, [content, filename])

  const share = async () => {
    if (!shareFile || active.current) return
    active.current = true
    setBusy(true)
    setMessage('')
    setError('')
    try {
      // Direkt im Klick aufrufen: kein Datenbankzugriff vor dem Systemdialog.
      await navigator.share({ files: [shareFile], title: 'FahrschulKalender-Sicherung' })
      setMessage('Datei an die gewählte App übergeben. Bitte dort das Speichern abschließen und die Datei prüfen.')
    } catch (caught) {
      if (typeof caught === 'object' && caught !== null && 'name' in caught && caught.name === 'AbortError') {
        setMessage('Teilen abgebrochen. Es wurde keine Speicherung bestätigt.')
      } else {
        setError('Die Datei konnte nicht übergeben werden. Versuche „Herunterladen“ und prüfe die Downloads deines Browsers.')
      }
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  const download = () => {
    setError('')
    setMessage('')
    try {
      if (!downloadTextFile(content, filename, 'application/json;charset=utf-8')) throw new Error('Download nicht verfügbar')
      setMessage(`Download angefordert: ${filename}. Öffne die Dateien-App → Downloads oder die Downloadliste deines Browsers. Die App kann nicht bestätigen, ob die Datei gespeichert wurde.`)
    } catch {
      setError('Der Browser konnte den Download nicht starten. Öffne die PWA-Seite in Chrome und versuche es dort erneut.')
    }
  }

  return <Modal open title="Sicherung speichern" onClose={() => { if (!active.current) onClose() }}>
    <p>Deine vollständige Sicherung ist vorbereitet. Wähle jetzt, wohin du sie speichern möchtest.</p>
    <p style={{ overflowWrap: 'anywhere' }}><strong>{shareFile?.name ?? filename}</strong></p>
    {shareFile ? <p>Über „Datei teilen / speichern“ öffnest du die Android-Auswahl. Wähle eine App zum Speichern, falls angeboten. Die verfügbaren Ziele hängen von deinem Telefon ab.</p>
      : <p>Dieser Browser unterstützt das Teilen dieser Datei nicht. Verwende „Herunterladen“ und prüfe anschließend den Ordner Downloads.</p>}
    {shareFile?.name.endsWith('.txt') && <p>Für Android wird die Sicherung als Textdatei übergeben. Sie enthält alle Daten und lässt sich über „Sicherung importieren“ wiederherstellen.</p>}
    <div className="payment-form-actions">
      {shareFile && <button className="button" disabled={busy} onClick={() => void share()}>{busy ? 'Dateidialog geöffnet …' : 'Datei teilen / speichern'}</button>}
      <button className="button button--secondary" disabled={busy} onClick={download}>Herunterladen (.json)</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </Modal>
}
