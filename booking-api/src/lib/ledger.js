import { BOOKINGS_TABLE, PARTITION } from './config.js'
import { slotRowKey } from './schedule.js'
import { ConflictError, PreconditionError } from './tableStore.js'

export const STATES = Object.freeze({
  HELD: 'HELD',
  CREATING: 'CREATING',
  PENDING_TEAMS: 'PENDING_TEAMS',
  CONFIRMED: 'CONFIRMED',
  COMPLETE: 'COMPLETE',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
})

const key = {
  booking: (id) => `bkg_${id}`,
  request: (hash) => `req_${hash}`,
  email: (hash) => `email_${hash}`,
}

/** Booking ledger in one Table partition so a reservation is a single atomic transaction. */
export class Ledger {
  constructor(store, { now = () => new Date() } = {}) {
    this.store = store
    this.now = now
  }

  get(rowKey) {
    return this.store.get(BOOKINGS_TABLE, PARTITION, rowKey)
  }

  getBooking(id) {
    return this.get(key.booking(id))
  }

  getRequest(hash) {
    return this.get(key.request(hash))
  }

  /**
   * Atomically claims the slot, the request key and the customer's email for a new booking.
   * Exactly one concurrent caller can succeed for the same slot.
   */
  async reserve({ bookingId, slotStart, requestHash, fingerprint, emailHash, booking }) {
    const at = this.now().toISOString()
    const base = { partitionKey: PARTITION }
    const entities = [
      { ...base, rowKey: slotRowKey(slotStart), kind: 'slot', bookingId, createdAt: at },
      { ...base, rowKey: key.request(requestHash), kind: 'request', bookingId, fingerprint, createdAt: at },
      { ...base, rowKey: key.email(emailHash), kind: 'email', bookingId, slotStart, createdAt: at },
      {
        ...base,
        rowKey: key.booking(bookingId),
        kind: 'booking',
        state: STATES.HELD,
        slotStart,
        requestHash,
        emailHash,
        createdAt: at,
        updatedAt: at,
        createAttempts: 0,
        noteAttempts: 0,
        noteStatus: 'pending',
        ...booking,
      },
    ]
    try {
      await this.store.createAll(BOOKINGS_TABLE, entities)
      return { ok: true }
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      const request = await this.getRequest(requestHash)
      if (request) return { ok: false, reason: 'duplicate_request', request }
      if (await this.get(slotRowKey(slotStart))) return { ok: false, reason: 'slot_taken' }
      if (await this.get(key.email(emailHash))) return { ok: false, reason: 'email_has_booking' }
      return { ok: false, reason: 'conflict' }
    }
  }

  /** Merge-updates a booking guarded by its ETag. Returns the refreshed booking. */
  async updateBooking(booking, patch) {
    const entity = {
      partitionKey: PARTITION,
      rowKey: booking.rowKey,
      ...patch,
      updatedAt: this.now().toISOString(),
    }
    const etag = await this.store.update(BOOKINGS_TABLE, entity, booking.etag)
    return { ...booking, ...entity, etag }
  }

  async deleteIfOwned(rowKey, bookingId) {
    const row = await this.get(rowKey)
    if (!row || row.bookingId !== bookingId) return
    try {
      await this.store.delete(BOOKINGS_TABLE, PARTITION, rowKey, row.etag)
    } catch (err) {
      if (!(err instanceof PreconditionError)) throw err
    }
  }

  releaseSlot(booking) {
    return this.deleteIfOwned(slotRowKey(booking.slotStart), booking.bookingId)
  }

  releaseEmail(booking) {
    return booking.emailHash ? this.deleteIfOwned(key.email(booking.emailHash), booking.bookingId) : undefined
  }

  async setRequestOutcome(requestHash, outcome) {
    const row = await this.getRequest(requestHash)
    if (!row) return
    try {
      await this.store.update(
        BOOKINGS_TABLE,
        { partitionKey: PARTITION, rowKey: row.rowKey, outcome: JSON.stringify(outcome) },
        row.etag,
      )
    } catch (err) {
      if (!(err instanceof PreconditionError)) throw err
    }
  }

  async reservedSlotStarts(fromIso, toIso) {
    const starts = new Set()
    for await (const row of this.store.list(BOOKINGS_TABLE, PARTITION, slotRowKey(fromIso), slotRowKey(toIso))) {
      const m = /^slot_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(row.rowKey)
      if (m) starts.add(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`)
    }
    return starts
  }

  async *bookings() {
    yield* this.store.list(BOOKINGS_TABLE, PARTITION, 'bkg_', 'bkg`')
  }

  async *requests() {
    yield* this.store.list(BOOKINGS_TABLE, PARTITION, 'req_', 'req`')
  }

  deleteRow(row) {
    return this.store.delete(BOOKINGS_TABLE, PARTITION, row.rowKey, row.etag).catch((err) => {
      if (!(err instanceof PreconditionError)) throw err
    })
  }
}
