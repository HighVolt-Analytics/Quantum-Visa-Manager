import { SLOT_MINUTES } from './config.js'
import { STATES } from './ledger.js'
import { errorCode } from './log.js'
import { pruneRateLimits } from './rateLimit.js'

const MINUTE = 60000
const HOLD_TIMEOUT_MS = 2 * MINUTE
const CREATE_GRACE_MS = MINUTE
const CREATE_REPLAY_WINDOW_MS = 15 * MINUTE
const TEAMS_GRACE_MS = 15 * MINUTE
const RECHECK_MS = 30 * MINUTE
const ARCHIVE_AFTER_MS = 24 * 60 * MINUTE
const DELETE_AFTER_MS = 30 * 24 * 60 * MINUTE

const age = (iso, now) => now.getTime() - Date.parse(iso)

/** Runs every five minutes and settles every booking the request path could not. */
export class Reconciler {
  constructor({ ledger, calendar, service, store, log, now = () => new Date() }) {
    this.ledger = ledger
    this.calendar = calendar
    this.service = service
    this.store = store
    this.log = log
    this.now = now
  }

  async run() {
    const now = this.now()
    const s = { checked: 0, released: 0, adopted: 0, replayed: 0, attention: 0, notes: 0, cancelled: 0, archived: 0, deleted: 0 }
    for await (const booking of this.ledger.bookings()) {
      s.checked++
      try {
        await this.reconcile(booking, now, s)
      } catch (err) {
        this.log.error('reconcile_error', { bookingId: booking.bookingId, code: errorCode(err) })
      }
    }
    for await (const request of this.ledger.requests()) {
      if (age(request.createdAt, now) > DELETE_AFTER_MS) await this.ledger.deleteRow(request)
    }
    await pruneRateLimits(this.store, { scopes: ['availability', 'booking'], olderThanMs: 2 * 24 * 60 * MINUTE, now })
    const summary = Object.entries(s).map(([k, v]) => `${k}:${v}`).join('_')
    this.log.info('reconcile_summary', { count: s.checked, reason: summary })
    return s
  }

  async reconcile(b, now, s) {
    const slotEnded = Date.parse(b.slotStart) + SLOT_MINUTES * MINUTE < now.getTime()
    switch (b.state) {
      case STATES.HELD:
        if (age(b.updatedAt, now) > HOLD_TIMEOUT_MS) {
          await this.service.release(b, 'stale_hold')
          s.released++
        }
        return
      case STATES.CREATING:
        return this.resolveCreating(b, now, s)
      case STATES.PENDING_TEAMS:
        return this.resolvePendingTeams(b, now, s)
      case STATES.CONFIRMED:
      case STATES.COMPLETE:
        if (slotEnded) return this.archive(b, s)
        return this.checkConfirmed(b, now, s)
      case STATES.NEEDS_ATTENTION:
        if (slotEnded) return this.archive(b, s)
        return
      case STATES.RELEASED:
      case STATES.CANCELLED:
        if (age(b.updatedAt, now) > ARCHIVE_AFTER_MS) return this.archive(b, s)
        return
      case STATES.ARCHIVED:
        if (age(b.updatedAt, now) > DELETE_AFTER_MS) {
          await this.ledger.deleteRow(b)
          s.deleted++
        }
        return
      default:
        return
    }
  }

  async resolveCreating(b, now, s) {
    if (age(b.updatedAt, now) < CREATE_GRACE_MS) return
    const live = (await this.calendar.findEventsByProperty(b.bookingId)).filter((e) => !e.isCancelled)
    if (live.length > 1) return this.attention(b, 'duplicate_events', s)
    if (live.length === 1) {
      await this.service.adoptEvent(b, live[0])
      s.adopted++
      return
    }
    if (age(b.createdAt, now) < CREATE_REPLAY_WINDOW_MS && Date.parse(b.slotStart) > now.getTime()) {
      const updated = await this.ledger.updateBooking(b, { createAttempts: (b.createAttempts || 0) + 1 })
      await this.service.createCustomerEvent(updated)
      s.replayed++
      return
    }
    return this.attention(b, 'create_unconfirmed', s)
  }

  async resolvePendingTeams(b, now, s) {
    const event = await this.calendar.getEvent(b.eventId)
    if (!event || event.isCancelled) return this.cancel(b, s)
    let current = b
    if (event.onlineMeeting?.joinUrl) {
      current = await this.ledger.updateBooking(b, {
        state: b.noteStatus === 'done' ? STATES.COMPLETE : STATES.CONFIRMED,
        joinUrlPresent: true,
      })
      this.log.info('teams_link_resolved', { bookingId: b.bookingId })
    } else if (age(b.createdAt, now) > TEAMS_GRACE_MS) {
      return this.attention(b, 'teams_link_missing', s)
    }
    await this.deliverPendingNote(current, s)
  }

  async checkConfirmed(b, now, s) {
    let current = await this.deliverPendingNote(b, s)
    if (current.lastCheckedAt && age(current.lastCheckedAt, now) < RECHECK_MS) return
    const event = await this.calendar.getEvent(current.eventId)
    if (!event || event.isCancelled) return this.cancel(current, s)
    await this.ledger.updateBooking(current, { lastCheckedAt: now.toISOString() })
  }

  async deliverPendingNote(b, s) {
    if (b.noteStatus !== 'pending') return b
    const updated = await this.service.deliverNote(b, { lookupFirst: true })
    if (updated.noteStatus === 'done') s.notes++
    return updated
  }

  async attention(b, reason, s) {
    await this.ledger.updateBooking(b, { state: STATES.NEEDS_ATTENTION, lastErrorCode: reason })
    this.log.error('needs_attention', { bookingId: b.bookingId, reason })
    s.attention++
  }

  async cancel(b, s) {
    if (b.noteEventId) await this.calendar.deleteEvent(b.noteEventId)
    await this.ledger.releaseSlot(b)
    await this.ledger.releaseEmail(b)
    await this.ledger.updateBooking(b, { state: STATES.CANCELLED, answers: '' })
    this.log.info('cancelled', { bookingId: b.bookingId })
    s.cancelled++
  }

  async archive(b, s) {
    await this.ledger.releaseSlot(b)
    await this.ledger.releaseEmail(b)
    await this.ledger.updateBooking(b, { state: STATES.ARCHIVED, attendeeName: '', attendeeEmail: '', answers: '' })
    s.archived++
  }
}
