/**
 * Opens the second native/web time picker after the first picker has finished
 * its change/close cycle. Returns a cancellation function to prevent stale
 * scheduled openings when the component unmounts or another value is chosen.
 */
export function openTimePickerAfterCommit(input: HTMLInputElement, delayMs = 160): () => void {
  const timer = window.setTimeout(() => {
    input.focus({ preventScroll: true })
    try {
      input.showPicker()
    } catch {
      // Older WebViews do not expose or permit showPicker; focus remains as a safe fallback.
    }
  }, delayMs)
  return () => window.clearTimeout(timer)
}
