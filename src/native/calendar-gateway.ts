import { Capacitor, type PermissionState } from '@capacitor/core'
import { CapacitorCalendar, type Calendar } from '@ebarooni/capacitor-calendar'

export interface DeviceCalendar {
  readonly id: string
  readonly title: string
  readonly color: string
  readonly account?: string
  readonly writable: boolean
}

export interface NativeCalendarEventDraft {
  readonly title: string
  readonly description?: string
  readonly startDate: number
  readonly endDate: number
  readonly location?: string
  readonly color?: string
  readonly calendarId?: string
}

export interface CalendarCapability {
  readonly mode: 'native' | 'ics'
  readonly platform: 'android' | 'ios' | 'web'
  readonly label: string
}

function ensureNative(): void {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Direkter Kalenderzugriff ist nur in der installierten Android- oder iOS-App verfügbar.')
  }
}

export function getCalendarCapability(): CalendarCapability {
  const platform = Capacitor.getPlatform()
  if (platform === 'android' || platform === 'ios') {
    return { mode: 'native', platform, label: 'Direkter Gerätekalender' }
  }
  return { mode: 'ics', platform: 'web', label: '.ics-Kalenderübergabe' }
}

export async function checkCalendarPermission(): Promise<PermissionState | 'web'> {
  if (!Capacitor.isNativePlatform()) return 'web'
  const { result } = await CapacitorCalendar.checkAllPermissions()
  const states = Object.values(result)
  if (states.includes('denied')) return 'denied'
  if (states.includes('prompt') || states.includes('prompt-with-rationale')) return 'prompt'
  return states.length > 0 && states.every((state) => state === 'granted') ? 'granted' : 'prompt'
}

export async function requestCalendarPermission(): Promise<PermissionState> {
  ensureNative()
  const { result } = await CapacitorCalendar.requestFullCalendarAccess()
  return result
}

function toDeviceCalendar(calendar: Calendar): DeviceCalendar {
  return {
    id: calendar.id,
    title: calendar.title,
    color: calendar.color,
    account: calendar.accountName ?? calendar.source?.title ?? undefined,
    writable: calendar.allowsContentModifications !== false && calendar.isImmutable !== true && calendar.isSubscribed !== true,
  }
}

export async function listDeviceCalendars(): Promise<readonly DeviceCalendar[]> {
  ensureNative()
  const { result } = await CapacitorCalendar.listCalendars()
  return result
    .map(toDeviceCalendar)
    .filter((calendar) => calendar.writable)
    .sort((left, right) => left.title.localeCompare(right.title, 'de'))
}

export async function getDefaultDeviceCalendar(): Promise<DeviceCalendar | null> {
  ensureNative()
  const { result } = await CapacitorCalendar.getDefaultCalendar()
  return result ? toDeviceCalendar(result) : null
}

export async function createNativeCalendarEvent(draft: NativeCalendarEventDraft): Promise<string> {
  ensureNative()
  const { id } = await CapacitorCalendar.createEvent({
    title: draft.title,
    description: draft.description,
    startDate: draft.startDate,
    endDate: draft.endDate,
    location: draft.location,
    color: draft.color,
    calendarId: draft.calendarId,
  })
  return id
}

export async function updateNativeCalendarEvent(eventId: string, draft: NativeCalendarEventDraft): Promise<void> {
  ensureNative()
  await CapacitorCalendar.modifyEvent({
    id: eventId,
    title: draft.title,
    description: draft.description,
    startDate: draft.startDate,
    endDate: draft.endDate,
    location: draft.location,
    color: draft.color,
    calendarId: draft.calendarId,
  })
}

export async function deleteNativeCalendarEvent(eventId: string): Promise<void> {
  ensureNative()
  await CapacitorCalendar.deleteEvent({ id: eventId })
}

export async function openNativeCalendar(date = Date.now()): Promise<void> {
  ensureNative()
  await CapacitorCalendar.openCalendar({ date })
}
