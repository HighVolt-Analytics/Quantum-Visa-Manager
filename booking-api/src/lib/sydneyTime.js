import { TIME_ZONE } from './config.js'

const formatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function sydneyParts(date) {
  const p = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
  }
}

export function sydneyOffsetMinutes(date) {
  const minute = Math.floor(date.getTime() / 60000) * 60000
  const p = sydneyParts(new Date(minute))
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - minute) / 60000)
}

/** Converts a Sydney wall-clock time to UTC. Throws for times skipped by daylight saving. */
export function sydneyLocalToUtc(year, month, day, hour, minute) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  let utc = asUtc - sydneyOffsetMinutes(new Date(asUtc)) * 60000
  utc = asUtc - sydneyOffsetMinutes(new Date(utc)) * 60000
  const back = sydneyParts(new Date(utc))
  if (back.year !== year || back.month !== month || back.day !== day || back.hour !== hour || back.minute !== minute) {
    throw new RangeError('Local time does not exist in Australia/Sydney')
  }
  return new Date(utc)
}

export function addLocalDays({ year, month, day }, days) {
  const t = new Date(Date.UTC(year, month - 1, day + days))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

export function localWeekday({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

const pad = (n) => String(n).padStart(2, '0')

export function formatLocalDate({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function formatMinutes(totalMinutes) {
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`
}
