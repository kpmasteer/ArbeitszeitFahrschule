export interface PointerPosition {
  readonly x: number
  readonly y: number
}

export type CalendarSwipeDirection = 'previous' | 'next' | null

export function detectCalendarSwipe(
  start: PointerPosition,
  end: PointerPosition,
  minimumDistance = 60,
): CalendarSwipeDirection {
  const horizontal = end.x - start.x
  const vertical = end.y - start.y
  if (Math.abs(horizontal) < minimumDistance) return null
  if (Math.abs(horizontal) <= Math.abs(vertical) * 1.25) return null
  return horizontal < 0 ? 'next' : 'previous'
}
