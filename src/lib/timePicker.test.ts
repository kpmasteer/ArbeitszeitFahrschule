import { afterEach, describe, expect, it, vi } from 'vitest'
import { openTimePickerAfterCommit } from './timePicker'

describe('openTimePickerAfterCommit', () => {
  afterEach(() => vi.useRealTimers())

  it('öffnet den End-Timepicker erst nach dem Commit-Zeitfenster', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    input.type = 'time'
    input.focus = vi.fn()
    input.showPicker = vi.fn()
    openTimePickerAfterCommit(input, 160)
    expect(input.showPicker).not.toHaveBeenCalled()
    vi.advanceTimersByTime(160)
    expect(input.focus).toHaveBeenCalledOnce()
    expect(input.showPicker).toHaveBeenCalledOnce()
  })

  it('öffnet keinen Picker mehr, wenn die geplante Aktion abgebrochen wird', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    input.showPicker = vi.fn()
    const cancel = openTimePickerAfterCommit(input, 160)
    cancel()
    vi.runAllTimers()
    expect(input.showPicker).not.toHaveBeenCalled()
  })
})
