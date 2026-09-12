import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  readonly open: boolean
  readonly title: string
  readonly subtitle?: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly wide?: boolean
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const dialog = dialogRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('*') ?? [])
      .filter((element) => element.matches('button, input, select, textarea, a[href], [tabindex="0"]')
        && !element.matches(':disabled') && !element.closest('[hidden], [inert]') && element.getAttribute('type') !== 'hidden')
    ;(dialog?.querySelector<HTMLElement>('input:not(:disabled)') ?? focusable()[0] ?? dialog)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements.at(-1)
        if (!first) { event.preventDefault(); dialog?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('modal-open')
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fenster schließen"><X size={21} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}
