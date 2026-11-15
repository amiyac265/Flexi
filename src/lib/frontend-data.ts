import type { CalendarEvent, Page } from '../backend/data.ts'
import { dateKey } from '../backend/domain.ts'

/** Follow the API's pagination; previews are never used as complete history. */
export async function allPages<T>(read: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const docs: T[] = []
  for (let page = 1; ; page++) {
    const result = await read(page)
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
    if (!result.docs.length || result.page !== page)
      throw new Error('Unable to load the remaining records. Please retry.')
  }
}

export function localDateTime(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (part: string) => parts.find((p) => p.type === part)!.value
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`
}

/** Resolve a wall-clock input in the account zone, including DST. Reject skipped times. */
export function zonedInstant(value: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Choose a valid date and time.')
  const target = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== value)
    throw new Error('Choose a valid date and time.')
  let result = target
  for (let i = 0; i < 4; i++) {
    const rendered = localDateTime(new Date(result), zone)
    if (rendered === value) return new Date(result).toISOString()
    result += target - Date.parse(`${rendered}:00Z`)
  }
  throw new Error('That time does not exist because the clocks change. Choose another time.')
}

export function monthRange(month: string, zone: string) {
  const next = new Date(`${month}-01T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return {
    from: zonedInstant(`${month}-01T00:00`, zone),
    to: zonedInstant(`${next.toISOString().slice(0, 7)}-01T00:00`, zone),
  }
}

export function eventOnDay(event: CalendarEvent, day: string, zone: string) {
  return (
    dateKey(new Date(event.startsAt), zone) <= day &&
    dateKey(new Date(Date.parse(event.endsAt) - 1), zone) >= day
  )
}

export function googleCalendarURL(event: CalendarEvent) {
  const stamp = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`, details: event.notes, ctz: event.timezone })}`
}
