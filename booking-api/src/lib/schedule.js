import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  GRAPH_TIME_ZONE,
  HORIZON_DAYS,
  MIN_NOTICE_MS,
  OPEN_WEEKDAYS,
  SLOT_MINUTES,
  TIME_ZONE,
} from './config.js'
import {
  addLocalDays,
  formatLocalDate,
  formatMinutes,
  localWeekday,
  sydneyLocalToUtc,
  sydneyParts,
} from './sydneyTime.js'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function makeSlot(localDate, startMinutes, startUtc) {
  const endUtc = new Date(startUtc.getTime() + SLOT_MINUTES * 60000)
  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
    date: formatLocalDate(localDate),
    time: formatMinutes(startMinutes),
    endTime: formatMinutes(startMinutes + SLOT_MINUTES),
    weekday: WEEKDAY_NAMES[localWeekday(localDate)],
    timeZone: TIME_ZONE,
  }
}

/** Every bookable slot for `now`, before calendar busy/free and reservations are applied. */
export function candidateSlots(now) {
  const today = sydneyParts(now)
  const earliest = now.getTime() + MIN_NOTICE_MS
  const slots = []
  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const localDate = addLocalDays(today, offset)
    if (!OPEN_WEEKDAYS.includes(localWeekday(localDate))) continue
    for (let m = DAY_START_MINUTES; m + SLOT_MINUTES <= DAY_END_MINUTES; m += SLOT_MINUTES) {
      const startUtc = sydneyLocalToUtc(localDate.year, localDate.month, localDate.day, Math.floor(m / 60), m % 60)
      if (startUtc.getTime() < earliest) continue
      slots.push(makeSlot(localDate, m, startUtc))
    }
  }
  return slots
}

export function findSlot(startIso, now) {
  if (typeof startIso !== 'string' || startIso.length > 40) return null
  const parsed = new Date(startIso)
  if (Number.isNaN(parsed.getTime())) return null
  const iso = parsed.toISOString()
  return candidateSlots(now).find((s) => s.start === iso) ?? null
}

export function slotRowKey(startIso) {
  return `slot_${new Date(startIso).toISOString().replace(/[-:]/g, '').replace('.000', '')}`
}

export function graphTimes(slot) {
  return {
    start: { dateTime: `${slot.date}T${slot.time}:00`, timeZone: GRAPH_TIME_ZONE },
    end: { dateTime: `${slot.date}T${slot.endTime}:00`, timeZone: GRAPH_TIME_ZONE },
  }
}

export function slotLabel(slot) {
  return `${slot.weekday} ${slot.date}, ${slot.time}–${slot.endTime} Sydney time`
}

/** Rebuilds the public slot view for a stored UTC start, independent of notice and horizon. */
export function slotFromStart(startIso) {
  const start = new Date(startIso)
  const p = sydneyParts(start)
  return makeSlot({ year: p.year, month: p.month, day: p.day }, p.hour * 60 + p.minute, start)
}
