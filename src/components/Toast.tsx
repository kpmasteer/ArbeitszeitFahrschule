import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'warning' | 'info'

interface ToastProps {
  readonly message: string
  readonly tone?: ToastTone
  readonly onClose: () => void
}

export function Toast({ message, tone = 'success', onClose }: ToastProps) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? CircleAlert : Info
  return (
    <div className={`toast toast--${tone}`} role="status">
      <Icon size={20} />
      <span>{message}</span>
      <button className="plain-button" onClick={onClose} aria-label="Hinweis schließen"><X size={17} /></button>
    </div>
  )
}
