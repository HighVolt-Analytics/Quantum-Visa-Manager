/* Book a Demo client logic: no DOM access, so it can be unit-tested in Node. */

export const SYDNEY = 'Australia/Sydney'
export const HORIZON_DAYS = 14
export const CONTACT = 'arup@highvolt.tech'

const pad = (n) => String(n).padStart(2, '0')

function sydneyYmd(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: SYDNEY, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) }
}

const utcDayFormat = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

function shortDayLabel(utc) {
  const p = Object.fromEntries(utcDayFormat.formatToParts(utc).map(({ type, value }) => [type, value]))
  return `${p.weekday} ${p.day} ${p.month}`
}

const utcLongFormat = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Sydney calendar days from today through the 14-day horizon. Saturdays are marked closed. */
export function buildDateOptions(now, slots) {
  const today = sydneyYmd(now)
  const byDate = groupSlotsByDate(slots)
  const days = []
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const utc = new Date(Date.UTC(today.year, today.month - 1, today.day + i))
    const key = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`
    const closed = utc.getUTCDay() === 6
    const daySlots = closed ? [] : byDate.get(key) || []
    days.push({
      date: key,
      label: shortDayLabel(utc),
      longLabel: utcLongFormat.format(utc),
      closed,
      available: daySlots.length > 0,
      slots: daySlots,
    })
  }
  return days
}

/** Market-local days. A weekday is open only when the availability response says so, including Saturday. */
export function buildMarketDateOptions(now, slots, { timeZone, openWeekdays, horizonDays } = {}) {
  const zone = timeZone || SYDNEY
  const open = new Set(openWeekdays?.length ? openWeekdays : [0, 1, 2, 3, 4, 5])
  const horizon = Number.isInteger(horizonDays) ? horizonDays : HORIZON_DAYS
  const today = ymdInZone(now, zone)
  const byDate = groupSlotsByDate(slots)
  const days = []
  for (let i = 0; i <= horizon; i++) {
    const utc = new Date(Date.UTC(today.year, today.month - 1, today.day + i))
    const key = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`
    const closed = !open.has(utc.getUTCDay())
    const daySlots = closed ? [] : byDate.get(key) || []
    days.push({
      date: key,
      label: shortDayLabel(utc),
      longLabel: utcLongFormat.format(utc),
      closed,
      available: daySlots.length > 0,
      slots: daySlots,
    })
  }
  return days
}

function ymdInZone(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) }
}

export function groupSlotsByDate(slots) {
  const map = new Map()
  for (const s of slots || []) {
    if (!s || typeof s.start !== 'string' || typeof s.date !== 'string') continue
    if (!map.has(s.date)) map.set(s.date, [])
    map.get(s.date).push(s)
  }
  for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start))
  return map
}

const CAL_WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

/** Monday-first month grid for the book-demo calendar. Day options come from buildDateOptions / buildMarketDateOptions. */
export function buildCalendarMonth(year, month, dayOptions, selectedDate) {
  const byDate = new Map((dayOptions || []).map((day) => [day.date, day]))
  const first = new Date(Date.UTC(year, month, 1))
  const startOffset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(Date.UTC(year, month, 1 - startOffset))
  const cells = []
  for (let i = 0; i < 42; i++) {
    const utc = new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i))
    const key = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`
    const day = byDate.get(key)
    const inMonth = utc.getUTCMonth() === month
    const available = Boolean(day?.available)
    cells.push({
      date: key,
      day: utc.getUTCDate(),
      inMonth,
      available,
      closed: Boolean(day?.closed),
      disabled: !available,
      selected: available && key === selectedDate,
      label: day?.label || shortDayLabel(utc),
      longLabel: day?.longLabel || utcLongFormat.format(utc),
      slots: day?.slots || [],
    })
  }
  const label = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  )
  return { year, month, label, weekdays: CAL_WEEKDAYS, cells }
}

/** Shift a calendar month. month is 0–11. */
export function shiftCalendarMonth(year, month, delta) {
  const next = new Date(Date.UTC(year, month + delta, 1))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() }
}

/** Earliest month that intersects the booking horizon day list. */
export function calendarMonthFromDays(dayOptions, preferredDate) {
  const key = preferredDate && (dayOptions || []).some((d) => d.date === preferredDate && d.available)
    ? preferredDate
    : (dayOptions || []).find((d) => d.available)?.date || (dayOptions || [])[0]?.date
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const now = new Date()
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
  }
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export function formatZoneTime(iso, timeZone = SYDNEY) {
  return new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso))
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function zoneLabel(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-AU', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value
  const minutes = zoneOffsetMinutes(date, timeZone)
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const offset = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad(abs % 60)}` : ''}`
  return name && !/^GMT|^UTC/.test(name) ? `${name} (${offset})` : offset
}

export function formatSydneyTime(iso) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso))
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** e.g. "AEDT (UTC+11)" for the given instant. */
export function sydneyZoneLabel(date) {
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value
  const minutes = sydneyOffsetMinutes(date)
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const offset = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad(abs % 60)}` : ''}`
  return name && !/^GMT|^UTC/.test(name) ? `${name} (${offset})` : offset
}

function sydneyOffsetMinutes(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: SYDNEY, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

/** The visitor's local equivalent, or null when they are already on Sydney time. */
export function localEquivalent(iso, visitorZone, marketZone = SYDNEY) {
  const zone = visitorZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const d = new Date(iso)
  if (!zone || zoneOffsetMinutes(d, marketZone) === zoneOffsetMinutes(d, zone)) return null
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })
    .format(d)
    .replace(/\s+/g, ' ')
}

const longSydneyDate = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** The visitor's local date and time range, or null when they are already on Sydney time. */
export function localAppointment(startIso, endIso, visitorZone, marketZone = SYDNEY) {
  const zone = visitorZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const start = new Date(startIso)
  if (!zone || zoneOffsetMinutes(start, marketZone) === zoneOffsetMinutes(start, zone)) return null
  const time = (iso) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\s+/g, ' ').toLowerCase()
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', timeZoneName: 'short' })
      .formatToParts(start)
      .map(({ type, value }) => [type, value]),
  )
  const range = endIso ? `${time(startIso)}–${time(endIso)}` : time(startIso)
  return `${parts.weekday} ${parts.day} ${parts.month}, ${range} ${parts.timeZoneName}`
}

/**
 * Everything the confirmation screen shows, derived only from the booking API's confirmed
 * slot and reference plus the email address the visitor entered.
 */
export function confirmationDetails({ slot, reference }, email, visitorZone) {
  const start = new Date(slot.start)
  const zone = slot.timeZone || SYDNEY
  const clock = (iso) => formatZoneTime(iso, zone)
  const date = zone === SYDNEY
    ? longSydneyDate.format(start)
    : new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(start)
  return {
    date,
    time: slot.end ? `${clock(slot.start)}–${clock(slot.end)}` : clock(slot.start),
    zone: zone === SYDNEY ? `Sydney time, ${sydneyZoneLabel(start)}` : zoneLabel(start, zone),
    local: localAppointment(slot.start, slot.end, visitorZone, zone),
    email: String(email || '').trim(),
    reference: String(reference),
  }
}

function zoneOffsetMinutes(date, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

const FIELD_NAMES = ['size', 'system', 'systemName', 'bottleneck', 'first', 'last', 'email', 'phone', 'org', 'state']

/** Builds the exact request body the booking API validates. Country and timezone are sent only for v2. */
export function buildBookingPayload({ form, slotStart, turnstileToken, idempotencyKey, includeCountry = false }) {
  const answers = {}
  for (const name of FIELD_NAMES) answers[name] = String(form.get(name) ?? '').trim()
  if (includeCountry) answers.country = String(form.get('country') ?? '').trim()
  answers.consent = form.get('consent') === 'yes'
  const payload = { idempotencyKey, slotStart, turnstileToken, answers }
  if (includeCountry) payload.timeZone = String(form.get('timeZone') ?? '').trim()
  return payload
}

/** Reuses the idempotency key only when retrying the identical booking. */
export function idempotencyKeyFor(previous, { slotStart, email }, newKey) {
  const fingerprint = `${slotStart}|${String(email).trim().toLowerCase()}`
  if (previous && previous.fingerprint === fingerprint) return previous
  return { key: newKey(), fingerprint }
}

/** API messages name the service's own contact address; visitors are pointed to CONTACT instead. */
export const withBookingContact = (message) => String(message || '').replace(/[A-Za-z0-9._%+-]+@highvolt\.tech/gi, CONTACT)

const fallback = (message) => withBookingContact(message) || `Something went wrong. Please try again or email ${CONTACT}.`

/** Maps a booking API response to what the page should do next. Never invents a confirmation. */
export function interpretBooking(httpStatus, body) {
  const b = body && typeof body === 'object' ? body : {}
  const message = typeof b.message === 'string' ? withBookingContact(b.message) : ''
  if (httpStatus === 200 && b.status === 'confirmed' && b.slot?.start && b.reference) {
    return { kind: 'confirmed', reference: b.reference, slot: b.slot, message }
  }
  if (httpStatus === 202 && b.status === 'pending') return { kind: 'pending', reference: b.reference, slot: b.slot, message }
  switch (b.status) {
    case 'slot_taken':
    case 'slot_unavailable':
      return { kind: 'slot_gone', message: message || 'That time is no longer available. Please choose another.' }
    case 'already_booked':
      return { kind: 'already_booked', message: fallback(message) }
    case 'idempotency_conflict':
      return { kind: 'new_attempt', message: 'Please choose your time again and resubmit.' }
    case 'invalid':
      return { kind: 'invalid', fields: Array.isArray(b.fields) ? b.fields : [], message: 'Please check the highlighted details.' }
    case 'verification_failed':
      return { kind: 'verification', message: 'The security check expired or failed. Please complete it again.' }
    case 'rate_limited':
      return { kind: 'retry_later', message: fallback(message) }
    case 'unavailable':
      return { kind: 'unavailable', message: fallback(message) }
    default:
      return { kind: 'error', message: fallback(message) }
  }
}

export function interpretAvailability(httpStatus, body) {
  const b = body && typeof body === 'object' ? body : {}
  if (httpStatus === 200 && b.status === 'ok' && Array.isArray(b.slots)) {
    const result = { kind: 'ok', slots: b.slots }
    if (typeof b.timeZone === 'string') result.timeZone = b.timeZone
    if (Array.isArray(b.openWeekdays)) result.openWeekdays = b.openWeekdays.map(Number)
    if (Number.isInteger(b.horizonDays)) result.horizonDays = b.horizonDays
    return result
  }
  if (b.status === 'unavailable') return { kind: 'unavailable', message: fallback(b.message) }
  if (b.status === 'rate_limited') return { kind: 'retry_later', message: fallback(b.message) }
  return { kind: 'error', message: fallback(b.message) }
}

/** Thin HTTPS client. Network failures and timeouts come back as { network: true }.
 * v1 paths use baseUrl (VITE_BOOKING_API_BASE). v2 paths use v2BaseUrl (VITE_BOOKING_V2_API_BASE) only.
 */
export function createBookingApi({ baseUrl, v2BaseUrl, fetchImpl = (...a) => fetch(...a), timeoutMs = 20000 }) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  const v2Root = String(v2BaseUrl || '').replace(/\/+$/, '')
  async function call(path, init, { v2 = false } = {}) {
    const origin = v2 ? v2Root : root
    try {
      const res = await fetchImpl(`${origin}${path}`, { ...init, credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) })
      let body = null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      return { httpStatus: res.status, body }
    } catch {
      return { network: true }
    }
  }
  return {
    availability: () => call('/api/availability', { method: 'GET', headers: { Accept: 'application/json' } }),
    availabilityV2: (site, country, timeZone) =>
      call(
        `/api/v2/availability?site=${encodeURIComponent(site)}&country=${encodeURIComponent(country)}&timeZone=${encodeURIComponent(timeZone || '')}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        { v2: true },
      ),
    book: (payload) =>
      call('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }),
    bookV2: (payload) =>
      call(
        '/api/v2/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        },
        { v2: true },
      ),
  }
}

/** Off unless the build sets this to the exact string true. Production builds leave it unset. */
export const BOOKING_V2_SITE = 'qvm'
export function isBookingV2Enabled() {
  return import.meta.env.VITE_BOOKING_V2_ENABLED === 'true'
}

const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ')

/** Curated regions for countries that need a select. Other countries use free text. */
export const REGION_OPTIONS = Object.freeze({
  AU: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', 'Outside Australia'],
  IN: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ],
  US: [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
    'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
    'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
  ],
  CA: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'],
  GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
})

/** Short IANA list for optional timezone changes. Detection uses the browser zone first. */
export const COMMON_TIME_ZONES = Object.freeze([
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Pacific/Auckland',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'UTC',
])

export function detectTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof zone === 'string' && zone ? zone : 'Australia/Sydney'
  } catch {
    return 'Australia/Sydney'
  }
}

/** Zones shown in the optional changer: browser zone first, then the curated list. */
export function timeZoneChoices(preferred) {
  const detected = preferred || detectTimeZone()
  const seen = new Set()
  const out = []
  for (const zone of [detected, ...COMMON_TIME_ZONES]) {
    if (!zone || seen.has(zone)) continue
    seen.add(zone)
    out.push(zone)
  }
  return out
}

export function regionsForCountry(countryCode) {
  const code = String(countryCode || '').toUpperCase()
  return REGION_OPTIONS[code] || null
}

export function countryOptions() {
  const display = new Intl.DisplayNames(['en'], { type: 'region' })
  return COUNTRY_CODES.map((code) => {
    const name = display.of(code)
    return name && name !== code ? { code, name } : null
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** @deprecated Prefer timeZoneChoices for the optional changer. Kept for older tests. */
export function timeZoneOptions() {
  return timeZoneChoices()
}

export function isBookingConfigured({ siteKey, apiBase }) {
  const base = String(apiBase || '')
  const secureBase = /^https:\/\/[^/]+/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)
  return typeof siteKey === 'string' && siteKey.trim().length > 0 && secureBase
}
