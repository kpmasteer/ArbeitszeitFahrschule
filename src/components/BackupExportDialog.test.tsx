import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BackupExportDialog } from './BackupExportDialog'
import { downloadTextFile } from '../services/serviceUtils'

vi.mock('../services/serviceUtils', () => ({ downloadTextFile: vi.fn(() => true) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const content = '{"format":"fahrschulzeit-backup","data":{"payments":[]}}'
const filename = 'fahrschulkalender-backup-2026-09-12.json'

function open(share = vi.fn().mockResolvedValue(undefined), canShare: (data: ShareData) => boolean = vi.fn(() => true)) {
  vi.stubGlobal('navigator', { share, canShare })
  render(<BackupExportDialog content={content} filename={filename} onClose={vi.fn()} />)
  return share
}

it('übergibt die vorbereitete Datei erst bei ausdrücklichem Klick', async () => {
  const share = open()
  expect(share).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Datei teilen / speichern' }))
  expect(share).toHaveBeenCalledOnce()
  const file = share.mock.calls[0][0].files[0] as File
  expect(file.name).toBe(filename)
  expect(file.size).toBe(new Blob([content]).size)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Speichern abschließen'))
})

it('bietet eine Textdatei an, wenn Android JSON nicht teilen kann', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  open(share, vi.fn((data: ShareData) => data.files?.[0].type === 'text/plain'))
  fireEvent.click(screen.getByRole('button', { name: 'Datei teilen / speichern' }))
  expect(share.mock.calls[0][0].files[0].name).toBe(`${filename}.txt`)
  await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
})

it('meldet Abbruch ohne Erfolgsbehauptung und ohne heimlichen Download', async () => {
  open(vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')))
  fireEvent.click(screen.getByRole('button', { name: 'Datei teilen / speichern' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Teilen abgebrochen'))
  expect(downloadTextFile).not.toHaveBeenCalled()
})

it('meldet Fehler bei der Übergabe und bietet weiterhin Download an', async () => {
  open(vi.fn().mockRejectedValue(new Error('Not allowed')))
  fireEvent.click(screen.getByRole('button', { name: 'Datei teilen / speichern' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nicht übergeben'))
  expect(screen.getByRole('button', { name: 'Herunterladen (.json)' })).toBeEnabled()
})

it('benennt Downloads als angefordert, nicht als sicher gespeichert', () => {
  open(vi.fn(), vi.fn(() => false))
  expect(screen.queryByRole('button', { name: 'Datei teilen / speichern' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Herunterladen (.json)' }))
  expect(downloadTextFile).toHaveBeenCalledWith(content, filename, 'application/json;charset=utf-8')
  expect(screen.getByRole('status')).toHaveTextContent('kann nicht bestätigen')
})

it('behandelt einen nicht verfügbaren Download als Fehler', () => {
  vi.mocked(downloadTextFile).mockReturnValueOnce(false)
  open(vi.fn(), vi.fn(() => false))
  fireEvent.click(screen.getByRole('button', { name: 'Herunterladen (.json)' }))
  expect(screen.getByRole('alert')).toHaveTextContent('nicht starten')
})
