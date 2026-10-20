import { NOTE_PROPERTY_ID, RATE_LIMITS, SLOT_MINUTES, TIME_ZONE } from './config.js'
import { GraphError } from './graph.js'
import { bookingReference, hmacHex, newBookingId, sha256Hex } from './hash.js'
import { CONTACT } from './http.js'
import { STATES } from './ledger.js'
import { errorCode } from './log.js'
import { customerEventPayload, privateNotePayload } from './payloads.js'
import { consumeRateLimit } from './rateLimit.js'
import { candidateSlots, findSlot, slotFromStart, slotLabel } from './schedule.js'
import { validateBookingRequest } from './validation.js'

const SLOT_MS = SLOT_MINUTES * 60000
const MAX_NOTE_ATTEMPTS = 5

const reply = (httpStatus, body) => ({ httpStatus, body })

function publicSlot(slot) {
  return { start: slot.start, end: slot.end, date: slot.date, time: slot.time, endTime: slot.endTime, weekday: slot.weekday, timeZone: TIME_ZONE, label: slotLabel(slot) }
}

function normaliseIso(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

export function settledState(teamsReady, noteStatus) {
  if (!teamsReady) return STATES.PENDING_TEAMS
  return noteStatus === 'done' ? STATES.COMPLETE : STATES.CONFIRMED
}

/** Shared availability cache so repeated page loads do not each call Graph. */
export function createAvailabilityCache(ttlMs = 30000) {
  return { ttlMs, at: 0, value: null }
}

export class BookingService {
  constructor({ ledger, store, calendar, verifyTurnstile, hashKey, log, now = () => new Date(), cache = createAvailabilityCache() }) {
    this.ledger = ledger
    this.store = store
    this.calendar = calendar
    this.verifyTurnstile = verifyTurnstile
    this.hashKey = hashKey
    this.log = log
    this.now = now
    this.cache = cache
  }

  subjectHash(kind, value, now) {
    return hmacHex(this.hashKey, `${kind}:${now.toISOString().slice(0, 10)}:${value}`).slice(0, 32)
  }

  async rateLimited(scope, ip, now) {
    const { allowed } = await consumeRateLimit(this.store, {
      scope,
      subject: this.subjectHash('ip', ip, now),
      ...RATE_LIMITS[scope],
      now,
    })
    if (!allowed) this.log.warn('rate_limited', { reason: scope })
    return !allowed
  }

  async openSlots(now) {
    const candidates = candidateSlots(now)
    if (!candidates.length) return []
    const first = candidates[0].start
    const last = candidates[candidates.length - 1].end
    const [view, reserved] = await Promise.all([
      this.calendar.getSchedule(first, last),
      this.ledger.reservedSlotStarts(first, last),
    ])
    const base = Date.parse(first)
    return candidates.filter((s) => {
      const i = (Date.parse(s.start) - base) / SLOT_MS
      return view[i] === '0' && !reserved.has(s.start)
    })
  }

  async availability({ ip }) {
    const now = this.now()
    if (await this.rateLimited('availability', ip, now)) return reply(429, { status: 'rate_limited', message: 'Too many requests. Please try again shortly.' })
    if (this.cache.value && now.getTime() - this.cache.at < this.cache.ttlMs) return reply(200, this.cache.value)
    const slots = await this.openSlots(now)
    const body = { status: 'ok', timeZone: TIME_ZONE, durationMinutes: SLOT_MINUTES, slots: slots.map(publicSlot) }
    this.cache.value = body
    this.cache.at = now.getTime()
    return reply(200, body)
  }

  async createBooking({ body, ip }) {
    const now = this.now()
    const validation = validateBookingRequest(body)
    if (!validation.ok) return reply(400, { status: 'invalid', fields: validation.errors })
    const { idempotencyKey, slotStart, turnstileToken, answers } = validation.value
    const requestHash = sha256Hex(idempotencyKey)
    const emailLower = answers.email.toLowerCase()
    const fingerprint = sha256Hex(`${normaliseIso(slotStart)}|${emailLower}`)

    const existing = await this.ledger.getRequest(requestHash)
    if (existing) return this.replay(existing, fingerprint)

    if (await this.rateLimited('booking', ip, now)) return reply(429, { status: 'rate_limited', message: 'Too many requests. Please try again shortly.' })

    const check = await this.verifyTurnstile({ token: turnstileToken, remoteIp: ip, idempotencyKey })
    if (!check.ok) {
      this.log.warn('turnstile_failed', { reason: check.reason })
      return check.reason === 'unavailable'
        ? reply(503, { status: 'verification_unavailable', message: `We couldn't verify your request. Please try again or email ${CONTACT}.` })
        : reply(403, { status: 'verification_failed', message: 'Verification failed. Please refresh the page and try again.' })
    }

    const slot = findSlot(slotStart, now)
    if (!slot) return reply(422, { status: 'slot_unavailable', message: 'That time is no longer available. Please choose another.' })

    const bookingId = newBookingId()
    const reserved = await this.ledger.reserve({
      bookingId,
      slotStart: slot.start,
      requestHash,
      fingerprint,
      emailHash: hmacHex(this.hashKey, `email:${emailLower}`),
      booking: {
        bookingId,
        reference: bookingReference(bookingId),
        attendeeName: `${answers.first} ${answers.last}`,
        attendeeEmail: answers.email,
        answers: JSON.stringify(answers),
        consentAt: now.toISOString(),
      },
    })
    if (!reserved.ok) {
      if (reserved.reason === 'duplicate_request') return this.replay(reserved.request, fingerprint)
      if (reserved.reason === 'email_has_booking') {
        return reply(409, { status: 'already_booked', message: `You already have an upcoming demo booked. To change it, reply to your invitation or email ${CONTACT}.` })
      }
      return reply(409, { status: 'slot_taken', message: 'Someone has just booked that time. Please choose another.' })
    }
    this.log.info('reserved', { bookingId })
    let booking = await this.ledger.getBooking(bookingId)

    try {
      const view = await this.calendar.getSchedule(slot.start, slot.end)
      if (view[0] !== '0') {
        await this.release(booking, 'busy')
        return reply(409, { status: 'slot_taken', message: 'That time has just become unavailable. Please choose another.' })
      }
    } catch (err) {
      this.log.error('schedule_check_failed', { bookingId, code: errorCode(err) })
      await this.release(booking, 'schedule_error')
      return this.failed()
    }

    booking = await this.ledger.updateBooking(booking, { state: STATES.CREATING, createAttempts: 1 })
    const result = await this.createCustomerEvent(booking)
    return this.respond(result.outcome, booking)
  }

  failed() {
    return reply(503, { status: 'failed', message: `We couldn't book that time. Please choose another time or email ${CONTACT}.` })
  }

  respond(outcome, booking) {
    const slot = publicSlot(slotFromStart(booking.slotStart))
    if (outcome === 'confirmed') {
      return reply(200, { status: 'confirmed', reference: booking.reference, slot, message: `Your Microsoft Teams invitation for ${slot.label} is on its way to the email address you entered.` })
    }
    if (outcome === 'pending') {
      return reply(202, { status: 'pending', reference: booking.reference, slot, message: `We're finalising your booking. Your Teams invitation should arrive within a few minutes. If it doesn't, email ${CONTACT}.` })
    }
    if (outcome === 'slot_taken') return reply(409, { status: 'slot_taken', message: 'That time is no longer available. Please choose another.' })
    return this.failed()
  }

  async replay(requestRow, fingerprint) {
    if (requestRow.fingerprint !== fingerprint) {
      return reply(409, { status: 'idempotency_conflict', message: 'This request was already used for a different booking. Please refresh the page and try again.' })
    }
    const booking = await this.ledger.getBooking(requestRow.bookingId)
    if (!booking) return this.failed()
    this.log.info('replayed', { bookingId: booking.bookingId, state: booking.state })
    switch (booking.state) {
      case STATES.CONFIRMED:
      case STATES.COMPLETE:
      case STATES.PENDING_TEAMS:
        return this.respond('confirmed', booking)
      case STATES.HELD:
      case STATES.CREATING:
      case STATES.NEEDS_ATTENTION:
        return this.respond('pending', booking)
      default: {
        let outcome = 'failed'
        try {
          outcome = JSON.parse(requestRow.outcome || '{}').status || 'failed'
        } catch {
          outcome = 'failed'
        }
        return this.respond(outcome, booking)
      }
    }
  }

  async release(booking, reason) {
    await this.ledger.releaseSlot(booking)
    await this.ledger.releaseEmail(booking)
    const updated = await this.ledger.updateBooking(booking, { state: STATES.RELEASED, lastErrorCode: reason, answers: '' })
    await this.ledger.setRequestOutcome(booking.requestHash, { status: reason === 'busy' ? 'slot_taken' : 'failed' })
    this.log.info('released', { bookingId: booking.bookingId, reason })
    return updated
  }

  /** Creates (or idempotently re-creates) the customer's Teams invitation. */
  async createCustomerEvent(booking) {
    try {
      const event = await this.calendar.createEvent(customerEventPayload(booking))
      return await this.adoptEvent(booking, event)
    } catch (err) {
      if (err instanceof GraphError && !err.uncertain) {
        this.log.error('create_failed', { bookingId: booking.bookingId, code: err.code, httpStatus: err.status })
        return { booking: await this.release(booking, 'create_failed'), outcome: 'failed' }
      }
      this.log.warn('create_uncertain', { bookingId: booking.bookingId, code: errorCode(err) })
      return { booking, outcome: 'pending' }
    }
  }

  async adoptEvent(booking, event) {
    const teamsReady = Boolean(event?.onlineMeeting?.joinUrl)
    let updated = await this.ledger.updateBooking(booking, {
      state: settledState(teamsReady, booking.noteStatus),
      eventId: event.id,
      joinUrlPresent: teamsReady,
    })
    await this.ledger.setRequestOutcome(booking.requestHash, { status: 'confirmed' })
    if (teamsReady) this.log.info('confirmed', { bookingId: booking.bookingId })
    else this.log.warn('teams_link_missing', { bookingId: booking.bookingId })
    updated = await this.deliverNote(updated)
    return { booking: updated, outcome: 'confirmed' }
  }

  /** Writes the private prep note to Arup's calendar, then removes the answers from Azure. */
  async deliverNote(booking, { lookupFirst = false } = {}) {
    if (booking.noteStatus !== 'pending' || !booking.answers) return booking
    const attempt = (booking.noteAttempts || 0) + 1
    try {
      let note = null
      if (lookupFirst) {
        const found = await this.calendar.findEventsByProperty(`${booking.bookingId}-note`, NOTE_PROPERTY_ID)
        note = found.find((e) => !e.isCancelled) ?? null
      }
      if (!note) note = await this.calendar.createEvent(privateNotePayload(booking, JSON.parse(booking.answers)))
      const teamsReady = booking.state !== STATES.PENDING_TEAMS
      const updated = await this.ledger.updateBooking(booking, {
        noteStatus: 'done',
        noteEventId: note.id,
        noteAttempts: attempt,
        answers: '',
        state: [STATES.CONFIRMED, STATES.PENDING_TEAMS].includes(booking.state) ? settledState(teamsReady, 'done') : booking.state,
      })
      this.log.info('note_delivered', { bookingId: booking.bookingId })
      return updated
    } catch (err) {
      const failed = attempt >= MAX_NOTE_ATTEMPTS
      const updated = await this.ledger.updateBooking(booking, { noteAttempts: attempt, noteStatus: failed ? 'failed' : 'pending' })
      if (failed) this.log.error('note_failed', { bookingId: booking.bookingId, code: errorCode(err), attempt })
      else this.log.warn('note_retry', { bookingId: booking.bookingId, code: errorCode(err), attempt })
      return updated
    }
  }
}
