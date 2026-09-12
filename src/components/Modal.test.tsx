import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

afterEach(cleanup)

it('führt den Fokus durch den Dialog und nach dem Schließen zum Auslöser zurück', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const close = vi.fn()
  const view = render(<Modal open title="Zahlung" onClose={close}><input aria-label="Betrag" /><button>Speichern</button></Modal>)
  expect(screen.getByLabelText('Betrag')).toHaveFocus()
  screen.getByRole('button', { name: 'Speichern' }).focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Fenster schließen' })).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: 'Speichern' })).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  expect(trigger).toHaveFocus()
  trigger.remove()
})
