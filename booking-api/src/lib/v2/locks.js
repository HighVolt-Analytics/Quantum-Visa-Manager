import { sha256Hex } from '../hash.js'

/** One partition so every person-slice for a booking is a single table transaction. */
export const LOCK_PARTITION = 'lock'
export const HOLD_MS = 2 * 60 * 1000
export const SLICE_MS = 30 * 60 * 1000
export const V2_ARUP_HOLD = 'v2-arup-hold'

/** Fixed 30-minute slices that intersect [start, end). Overlapping appointments share a slice. */
export function timeSlices(startIso, endIso) {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  const slices = []
  for (let t = Math.floor(start / SLICE_MS) * SLICE_MS; t < end; t += SLICE_MS) slices.push(new Date(t).toISOString())
  return slices
}

export function lockRowKey(personId, sliceIso) {
  return `person_${personId}|${sliceIso}`
}

/**
 * Graph availabilityView is one character per 30 minutes, starting at the requested start.
 * Every character covering the appointment must be free. A short or errored view is not free.
 */
export function viewIsFree(view, startIso, endIso) {
  if (typeof view !== 'string' || !view.length) return false
  const intervals = Math.ceil((Date.parse(endIso) - Date.parse(startIso)) / SLICE_MS)
  if (!Number.isFinite(intervals) || intervals < 1 || view.length < intervals) return false
  for (let i = 0; i < intervals; i++) {
    if (view[i] !== '0') return false
  }
  return true
}

/** Stable hash of the validated booking. A reused idempotency key with a different body will not match. */
export function requestFingerprint(value) {
  const answers = value.answers || {}
  return sha256Hex(JSON.stringify({
    site: value.site,
    slotStart: new Date(value.slotStart).toISOString(),
    size: answers.size || '',
    system: answers.system || '',
    systemName: answers.systemName || '',
    bottleneck: answers.bottleneck || '',
    first: answers.first || '',
    last: answers.last || '',
    email: String(answers.email || '').toLowerCase(),
    phone: answers.phone || '',
    org: answers.org || '',
    state: answers.state || '',
    country: answers.country || '',
    countryCode: answers.countryCode || '',
    timeZone: value.timeZone || '',
    partner: answers.partner === true,
    consent: answers.consent === true,
  }))
}

export function buildInvitees({ organizer, attendeeEmail, attendeeName, recipients }) {
  const invitees = []
  const seen = new Set([String(organizer || '').toLowerCase()])
  const add = (email, name, role, personId) => {
    const key = String(email || '').toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    invitees.push({ email, name, role, personId: personId || '' })
  }
  add(attendeeEmail, attendeeName, 'visitor', '')
  for (const person of recipients || []) add(person.email, person.id, person.role, person.id)
  return invitees
}
