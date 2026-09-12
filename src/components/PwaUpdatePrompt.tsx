import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState } from 'react'
import { activateWaitingUpdate } from '../lib/pwaUpdate'

export function PwaUpdatePrompt() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  const activate = async () => {
    setBusy(true)
    setError('')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.waiting) await activateWaitingUpdate(registration)
      else await updateServiceWorker(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update konnte nicht aktiviert werden.')
    } finally { setBusy(false) }
  }

  return (
    <aside className="update-prompt" role="status">
      <span className="update-prompt__icon"><RefreshCw size={19} /></span>
      <div>
        <strong>Update ist bereit</strong>
        <span>{error || 'Die neue Version kann jetzt geladen werden. Gespeicherte Daten bleiben erhalten.'}</span>
      </div>
      <button className="button button--small" disabled={busy} onClick={() => void activate()}>{busy ? 'Wird aktiviert …' : 'Aktualisieren'}</button>
      <button className="icon-button" onClick={() => setNeedRefresh(false)} aria-label="Später aktualisieren"><X size={18} /></button>
    </aside>
  )
}
