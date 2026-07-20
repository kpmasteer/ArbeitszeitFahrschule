import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <aside className="update-prompt" role="status">
      <span className="update-prompt__icon"><RefreshCw size={19} /></span>
      <div>
        <strong>Update ist bereit</strong>
        <span>Die neue Version kann jetzt geladen werden.</span>
      </div>
      <button className="button button--small" onClick={() => void updateServiceWorker(true)}>Aktualisieren</button>
      <button className="icon-button" onClick={() => setNeedRefresh(false)} aria-label="Später aktualisieren"><X size={18} /></button>
    </aside>
  )
}
