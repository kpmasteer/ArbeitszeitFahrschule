import { afterEach, expect, it, vi } from 'vitest'
import { activateWaitingUpdate } from './pwaUpdate'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('aktiviert einen wartenden Worker und lädt erst nach dem Controllerwechsel neu', async () => {
  const container = new EventTarget()
  const reload = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: container })
  vi.stubGlobal('window', { location: { reload } })
  const postMessage = vi.fn()
  const result = activateWaitingUpdate({ waiting: { postMessage } } as unknown as ServiceWorkerRegistration)
  expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  expect(reload).not.toHaveBeenCalled()
  container.dispatchEvent(new Event('controllerchange'))
  expect(await result).toBe(true)
  expect(reload).toHaveBeenCalledOnce()
  container.dispatchEvent(new Event('controllerchange'))
  expect(reload).toHaveBeenCalledOnce()
})

it('meldet eine hängende Aktivierung, statt ein erfolgreiches Update vorzutäuschen', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { serviceWorker: new EventTarget() })
  const result = activateWaitingUpdate({ waiting: { postMessage: vi.fn() } } as unknown as ServiceWorkerRegistration)
  const assertion = expect(result).rejects.toThrow('noch nicht aktiviert')
  await vi.advanceTimersByTimeAsync(15000)
  await assertion
})

it('lädt ohne wartendes Update nicht neu', async () => {
  expect(await activateWaitingUpdate({ waiting: null } as ServiceWorkerRegistration)).toBe(false)
})
