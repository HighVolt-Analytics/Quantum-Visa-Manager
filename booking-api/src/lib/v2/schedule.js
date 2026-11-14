const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function partsInZone(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  )
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) }
}

function offsetMinutes(date, timeZone) {
  const minute = Math.floor(date.getTime() / 60000) * 60000
  const p = partsInZone(new Date(minute), timeZone)
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - minute) / 60000)
}

export function zonedLocalToUtc(year, month, day, hour, minute, timeZone) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  let utc = asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60000
  utc = asUtc - offsetMinutes(new Date(utc), timeZone) * 60000
  const back = partsInZone(new Date(utc), timeZone)
  if (back.year !== year || back.month !== month || back.day !== day || back.hour !== hour || back.minute !== minute) {
    throw new RangeError('Local time does not exist in the market timezone')
  }
  return new Date(utc)
}

function addDays({ year, month, day }, days) {
  const t = new Date(Date.UTC(year, month - 1, day + days))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

const pad = (n) => String(n).padStart(2, '0')

export const VISITOR_OPEN_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6])
export const VISITOR_START_MINUTES = 9 * 60
export const VISITOR_END_MINUTES = 19 * 60

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string') return false
  const zone = timeZone.trim()
  if (!zone || zone.length > 80) return false
  try {
    Intl.DateTimeFormat('en-AU', { timeZone: zone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** 09:00–19:00 every day in the visitor's confirmed timezone. Length, notice, and horizon come from configuration. */
export function visitorSchedule(visit, timeZone) {
  if (!visit?.configured) return { configured: false, missing: visit?.missing || ['BOOKING_SLOT_MINUTES', 'BOOKING_NOTICE_MINUTES', 'BOOKING_HORIZON_DAYS'] }
  if (!isValidTimeZone(timeZone)) return { configured: false, missing: ['timeZone'] }
  return {
    configured: true,
    missing: [],
    timeZone: timeZone.trim(),
    openWeekdays: VISITOR_OPEN_WEEKDAYS,
    startMinutes: VISITOR_START_MINUTES,
    endMinutes: VISITOR_END_MINUTES,
    slotMinutes: visit.slotMinutes,
    noticeMs: visit.noticeMs,
    horizonDays: visit.horizonDays,
  }
}

/** Candidate slots for a schedule. Unconfigured schedules return none. */
export function candidateSlots(schedule, now) {
  if (!schedule?.configured) return []
  const today = partsInZone(now, schedule.timeZone)
  const earliest = now.getTime() + schedule.noticeMs
  const slots = []
  for (let offset = 0; offset <= schedule.horizonDays; offset++) {
    const localDate = addDays(today, offset)
    const weekday = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay()
    if (!schedule.openWeekdays.includes(weekday)) continue
    for (let minute = schedule.startMinutes; minute + schedule.slotMinutes <= schedule.endMinutes; minute += schedule.slotMinutes) {
      let startUtc
      try {
        startUtc = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, Math.floor(minute / 60), minute % 60, schedule.timeZone)
      } catch {
        continue
      }
      if (startUtc.getTime() < earliest) continue
      const endUtc = new Date(startUtc.getTime() + schedule.slotMinutes * 60000)
      slots.push({
        start: startUtc.toISOString(),
        end: endUtc.toISOString(),
        date: `${localDate.year}-${pad(localDate.month)}-${pad(localDate.day)}`,
        time: `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`,
        endTime: `${pad(Math.floor((minute + schedule.slotMinutes) / 60))}:${pad((minute + schedule.slotMinutes) % 60)}`,
        weekday: WEEKDAY_NAMES[weekday],
        timeZone: schedule.timeZone,
      })
    }
  }
  return slots
}

export function findSlot(schedule, startIso, now) {
  if (typeof startIso !== 'string') return null
  const parsed = new Date(startIso)
  if (Number.isNaN(parsed.getTime())) return null
  const iso = parsed.toISOString()
  return candidateSlots(schedule, now).find((slot) => slot.start === iso) ?? null
}

export function slotLabel(slot) {
  return `${slot.weekday} ${slot.date}, ${slot.time}–${slot.endTime} (${slot.timeZone})`
}
