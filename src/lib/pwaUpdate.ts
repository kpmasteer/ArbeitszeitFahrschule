/** Activates a downloaded update without touching IndexedDB or user data. */
export function activateWaitingUpdate(registration: ServiceWorkerRegistration): Promise<boolean> {
  const worker = registration.waiting
  if (!worker) return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
    }
    const changed = () => { cleanup(); resolve(true); window.location.reload() }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Das Update wurde noch nicht aktiviert. Bitte alle Fenster dieser App schließen und sie erneut öffnen. Deine Daten bleiben erhalten.'))
    }, 15000)
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    try { worker.postMessage({ type: 'SKIP_WAITING' }) } catch (error) { cleanup(); reject(error) }
  })
}
