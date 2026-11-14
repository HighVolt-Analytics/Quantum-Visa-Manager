import { BOOKINGS_TABLE, PARTITION, RATE_LIMITS } from '../config.js'
import { GraphError } from '../graph.js'
import { bookingReference, hmacHex, newBookingId, sha256Hex } from '../hash.js'
import { consumeRateLimit, pruneRateLimits } from '../rateLimit.js'
import { slotRowKey } from '../schedule.js'
import { ConflictError } from '../tableStore.js'
import { siteStorageSetting, siteTurnstileHostnames, V2_BOOKINGS_TABLE, V2_RATELIMITS_TABLE } from './config.js'
import { deriveMarket } from './market.js'
import { HOLD_MS, buildInvitees, requestFingerprint, timeSlices } from './locks.js'
import { MAIL, initialNotify, mailAction, staffMailBody, summarizeNotify } from './notifications.js'
import { withEmails, recipientsFor } from './roster.js'
import { candidateSlots, findSlot, slotLabel, visitorSchedule } from './schedule.js'
import { validateV2Booking } from './validation.js'

const V2_PROPERTY_ID = 'String {6c1a9e40-2b7d-4f5a-8c31-9d0e4a7b2c18} Name HvBookingV2Id'
const V2_SITES = ['hva', 'agent', 'qvm', 'ledgerline', 'edupass']

const reply = (httpStatus, body) => ({ httpStatus, body })

export class V2BookingService {
  constructor({ store, stores, legacyStore, calendar, mail, cfg, verifyTurnstile, log, now = () => new Date() }) {
    this.store = store
    this.stores = stores || null
    // Legacy QVM rows use a dedicated Table account. Do not fall back to host storage.
    this.legacyStore = legacyStore || null
    this.calendar = calendar
    this.mail = mail
    this.cfg = cfg
    this.verifyTurnstile = verifyTurnstile
    this.log = log
    this.now = now
  }

  /** One store per site. Without a map, unit tests share the single injected store. */
  siteStore(site) {
    if (this.stores) return this.stores[site] || null
    return this.store
  }

  limits(scope) {
    return this.cfg.rateLimits?.[scope] || RATE_LIMITS[scope]
  }

  /** Runs before any Graph call. A missing hash key still limits, using a one-way digest of the IP. */
  async rateLimited(site, scope, ip) {
    const store = this.siteStore(site)
    if (!store) return false
    const now = this.now()
    const day = now.toISOString().slice(0, 10)
    const subject = this.cfg.hashKey
      ? hmacHex(this.cfg.hashKey, `v2:${scope}:${day}:${ip}`).slice(0, 32)
      : sha256Hex(`v2:${scope}:${day}:${ip}`).slice(0, 32)
    const { allowed } = await consumeRateLimit(store, {
      scope: `v2-${scope}`,
      subject,
      ...this.limits(scope),
      now,
      table: V2_RATELIMITS_TABLE,
    })
    if (!allowed) this.log.warn('v2_rate_limited', { reason: scope, site })
    return !allowed
  }

  async availability({ site, market, timeZone, ip }) {
    const store = this.siteStore(site)
    if (!store) return reply(503, { status: 'unconfigured', missing: [siteStorageSetting(site)] })
    if (await this.rateLimited(site, 'availability', ip || 'unknown')) {
      return reply(429, { status: 'rate_limited', message: 'Too many requests. Please try again shortly.' })
    }
    const schedule = visitorSchedule(this.cfg.visit, timeZone)
    if (!schedule.configured) return reply(503, { status: 'unconfigured', missing: schedule.missing })
    const emailed = withEmails(recipientsFor(site, market), this.cfg.emails)
    if (!emailed.ok) return reply(503, { status: 'unconfigured', missing: emailed.missing })
    const open = []
    for (const slot of candidateSlots(schedule, this.now())) {
      if (await this.slotBusy(site, slot)) continue
      open.push({ start: slot.start, end: slot.end, date: slot.date, time: slot.time, endTime: slot.endTime, timeZone: slot.timeZone })
    }
    return reply(200, {
      status: 'ok',
      site,
      market,
      timeZone: schedule.timeZone,
      openWeekdays: schedule.openWeekdays,
      horizonDays: schedule.horizonDays,
      slotMinutes: schedule.slotMinutes,
      slots: open,
    })
  }

  async create({ body, ip }) {
    const parsed = validateV2Booking(body)
    if (!parsed.ok) return reply(400, { status: 'invalid', fields: parsed.errors })
    const { site, idempotencyKey, slotStart, turnstileToken, timeZone, answers } = parsed.value
    const store = this.siteStore(site)
    if (!store) return reply(503, { status: 'unconfigured', missing: [siteStorageSetting(site)] })
    const marketResult = deriveMarket(site, answers)
    if (!marketResult.ok) return reply(400, { status: 'invalid', fields: marketResult.fields })
    const market = marketResult.market
    const fingerprint = requestFingerprint(parsed.value)
    const requestHash = sha256Hex(`${site}:${idempotencyKey}`)
    const existing = await store.get(V2_BOOKINGS_TABLE, site, `req_${requestHash}`)
    if (existing) return this.replay(site, existing, fingerprint)

    const schedule = visitorSchedule(this.cfg.visit, timeZone)
    if (!schedule.configured) return reply(503, { status: 'unconfigured', missing: schedule.missing })
    const slot = findSlot(schedule, slotStart, this.now())
    if (!slot) return reply(422, { status: 'slot_unavailable' })

    if (await this.rateLimited(site, 'booking', ip || 'unknown')) {
      return reply(429, { status: 'rate_limited', message: 'Too many requests. Please try again shortly.' })
    }

    const emailed = withEmails(recipientsFor(site, market), this.cfg.emails)
    if (!emailed.ok) return reply(503, { status: 'unconfigured', missing: emailed.missing })
    const missing = []
    if (!this.cfg.portalBaseUrl) missing.push('BOOKINGS_PORTAL_BASE_URL')
    if (!this.cfg.hashKey) missing.push('BOOKING_HASH_KEY')
    if (missing.length) return reply(503, { status: 'unconfigured', missing })

    const expectedHostnames = siteTurnstileHostnames(this.cfg.sites?.[site]?.origins)
    if (!expectedHostnames.length) return reply(403, { status: 'verification_failed' })
    const check = await this.verifyTurnstile({ token: turnstileToken, remoteIp: ip, idempotencyKey, expectedHostnames })
    if (!check.ok) {
      return check.reason === 'unavailable'
        ? reply(503, { status: 'verification_unavailable' })
        : reply(403, { status: 'verification_failed' })
    }

    let bookingId = newBookingId()
    const claimed = await this.claimSlot({ bookingId, site, requestHash, fingerprint, slot })
    if (!claimed.ok) {
      if (claimed.reason === 'idempotency_conflict') return reply(409, { status: 'idempotency_conflict' })
      if (claimed.replay) return this.replay(site, claimed.request, fingerprint)
      return reply(claimed.reason === 'unavailable' ? 503 : 409, { status: claimed.reason === 'unavailable' ? 'slot_unavailable' : 'slot_taken' })
    }
    bookingId = claimed.bookingId

    const emailHash = hmacHex(this.cfg.hashKey, `v2:${site}:${answers.email.toLowerCase()}`)
    const notify = initialNotify(emailed.recipients)
    const invitees = buildInvitees({
      organizer: this.cfg.organizerMailbox,
      attendeeEmail: answers.email,
      attendeeName: `${answers.first} ${answers.last}`,
      recipients: emailed.recipients,
    })
    const booking = {
      partitionKey: site,
      rowKey: `bkg_${bookingId}`,
      kind: 'booking',
      bookingId,
      site,
      market,
      source: 'site-form',
      reference: bookingReference(bookingId).replace(/^QVM-/, `${site.toUpperCase()}-`),
      slotStart: slot.start,
      slotEnd: slot.end,
      slotDate: slot.date,
      slotLabel: slotLabel(slot),
      timeZone: slot.timeZone,
      attendeeName: `${answers.first} ${answers.last}`,
      attendeeEmail: answers.email,
      organization: answers.org,
      answersOriginal: JSON.stringify(answers),
      invitees: JSON.stringify(invitees),
      requestHash,
      fingerprint,
      emailHash,
      state: 'HELD',
      meetingStatus: 'pending',
      eventId: '',
      staffNotify: JSON.stringify(notify),
      createdAt: this.now().toISOString(),
    }
    try {
      await store.createAll(V2_BOOKINGS_TABLE, [
        { partitionKey: site, rowKey: `req_${requestHash}`, kind: 'request', bookingId, requestHash, fingerprint },
        { partitionKey: site, rowKey: `email_${emailHash}`, kind: 'email', bookingId, slotStart: slot.start },
        booking,
      ])
    } catch (err) {
      await this.releaseHold(site, bookingId)
      if (err instanceof ConflictError) {
        const request = await store.get(V2_BOOKINGS_TABLE, site, `req_${requestHash}`)
        if (request) return this.replay(site, request, fingerprint)
        return reply(409, { status: 'already_booked' })
      }
      throw err
    }
    const stored = await store.get(V2_BOOKINGS_TABLE, site, booking.rowKey)
    await this.commitHold(stored)
    const meeting = await this.ensureMeeting(stored, emailed.recipients, answers.email, booking.attendeeName)
    const mailed = await this.ensureStaffMail(meeting.booking)
    return this.publicResult(mailed)
  }

  async replay(site, requestRow, fingerprint) {
    if (requestRow.fingerprint && fingerprint && requestRow.fingerprint !== fingerprint) {
      return reply(409, { status: 'idempotency_conflict' })
    }
    const booking = await this.siteStore(site).get(V2_BOOKINGS_TABLE, site, `bkg_${requestRow.bookingId}`)
    if (!booking) return reply(503, { status: 'failed' })
    const meeting = await this.ensureMeeting(booking, this.rosterFrom(booking), booking.attendeeEmail, booking.attendeeName)
    const mailed = await this.ensureStaffMail(meeting.booking)
    this.log.info('v2_replay', { bookingId: booking.bookingId, site })
    return this.publicResult(mailed)
  }

  rosterFrom(booking) {
    const recipients = JSON.parse(booking.staffNotify || '{}')
    return Object.values(recipients).map((entry) => ({
      id: entry.personId,
      role: entry.role,
      email: this.cfg.emails[entry.personId] || '',
    }))
  }

  /** Same-site slot rows only. Another site, and an assignee's calendar, do not hide the time. */
  async slotBusy(site, slot) {
    const store = this.siteStore(site)
    if (!store) return false
    const nowMs = this.now().getTime()
    for (const slice of timeSlices(slot.start, slot.end)) {
      const row = await store.get(V2_BOOKINGS_TABLE, site, slotRowKey(slice))
      if (!row || row.kind !== 'site-slot') continue
      if (Date.parse(row.expiresAt || 0) <= nowMs) continue
      return true
    }
    return false
  }

  async claimSlot({ bookingId, site, requestHash, fingerprint, slot }) {
    const store = this.siteStore(site)
    const slices = timeSlices(slot.start, slot.end)
    const expiresAt = new Date(this.now().getTime() + HOLD_MS).toISOString()
    const nowMs = this.now().getTime()
    let adopted = bookingId
    for (const slice of slices) {
      const rowKey = slotRowKey(slice)
      const existing = await store.get(V2_BOOKINGS_TABLE, site, rowKey)
      if (!existing) continue
      if (existing.kind === 'site-slot' && Date.parse(existing.expiresAt || 0) <= nowMs) {
        await store.delete(V2_BOOKINGS_TABLE, site, rowKey, existing.etag)
        continue
      }
      if (existing.requestHash !== requestHash) return { ok: false, reason: 'slot_taken' }
      if (existing.fingerprint !== fingerprint) return { ok: false, reason: 'idempotency_conflict' }
      adopted = existing.bookingId
    }
    const rows = []
    for (const slice of slices) {
      const rowKey = slotRowKey(slice)
      const existing = await store.get(V2_BOOKINGS_TABLE, site, rowKey)
      if (existing) continue
      rows.push({
        partitionKey: site,
        rowKey,
        kind: 'site-slot',
        bookingId: adopted,
        site,
        requestHash,
        fingerprint,
        slotStart: slot.start,
        slotEnd: slot.end,
        expiresAt,
      })
    }
    if (rows.length) {
      try {
        await store.createAll(V2_BOOKINGS_TABLE, rows)
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err
        const held = await store.get(V2_BOOKINGS_TABLE, site, rows[0].rowKey)
        if (held?.requestHash === requestHash && held.fingerprint === fingerprint) adopted = held.bookingId
        else return { ok: false, reason: 'slot_taken' }
      }
    }
    return { ok: true, bookingId: adopted }
  }

  async commitHold(booking) {
    const store = this.siteStore(booking.site)
    if (!store) return
    const slices = timeSlices(booking.slotStart, booking.slotEnd)
    for (const slice of slices) {
      const row = await store.get(V2_BOOKINGS_TABLE, booking.site, slotRowKey(slice))
      if (row?.kind === 'site-slot' && row.bookingId === booking.bookingId) {
        await store.update(V2_BOOKINGS_TABLE, { partitionKey: booking.site, rowKey: row.rowKey, expiresAt: booking.slotEnd }, row.etag).catch(() => {})
      }
    }
  }

  async releaseHold(site, bookingId) {
    const store = this.siteStore(site)
    if (!store) return
    for await (const row of store.list(V2_BOOKINGS_TABLE, site, 'slot_', 'slot`')) {
      if (row.kind === 'site-slot' && row.bookingId === bookingId) {
        await store.delete(V2_BOOKINGS_TABLE, site, row.rowKey, row.etag).catch(() => {})
      }
    }
  }

  async releaseEmail(booking) {
    const store = this.siteStore(booking.site)
    if (!booking.emailHash || !store) return
    const rowKey = `email_${booking.emailHash}`
    const row = await store.get(V2_BOOKINGS_TABLE, booking.site, rowKey)
    if (row?.bookingId === booking.bookingId) await store.delete(V2_BOOKINGS_TABLE, booking.site, rowKey, row.etag).catch(() => {})
  }

  /** Frees this site's slot claim and the visitor email after a definite failure. v1 rows are left in place. */
  async releaseBooking(booking) {
    await this.releaseHold(booking.site, booking.bookingId)
    await this.releaseEmail(booking)
    return this.patch(booking, { meetingStatus: 'failed', state: 'RELEASED' })
  }

  /**
   * Looks up the booking before creating a meeting.
   * create_unconfirmed is adopted when the event exists and is never submitted again when it does not.
   */
  async ensureMeeting(booking, recipients, attendeeEmail, attendeeName) {
    if (booking.meetingStatus === 'failed' || booking.state === 'RELEASED') return { booking, failed: true }
    if (booking.meetingStatus === 'created' && booking.eventId) return { booking }
    const found = await this.calendar.findByBooking(this.cfg.organizerMailbox, booking.bookingId)
    const live = (found || []).filter((event) => !event.isCancelled)
    if (live.length) return { booking: await this.patch(booking, { meetingStatus: 'created', eventId: live[0].id, state: 'CONFIRMED' }) }
    if (booking.meetingStatus === 'create_unconfirmed') {
      this.log.warn('v2_meeting_unresolved', { bookingId: booking.bookingId, site: booking.site, reason: 'create_unconfirmed' })
      return { booking, unresolved: true }
    }
    const claimed = await this.patch(booking, { meetingStatus: 'creating' })
    const invitees = buildInvitees({
      organizer: this.cfg.organizerMailbox,
      attendeeEmail,
      attendeeName,
      recipients,
    })
    try {
      const event = await this.calendar.createEvent(this.cfg.organizerMailbox, {
        subject: `${booking.site} demonstration ${booking.reference}`,
        transactionId: booking.bookingId,
        bookingId: booking.bookingId,
        propertyId: V2_PROPERTY_ID,
        attendees: invitees,
        start: booking.slotStart,
        end: booking.slotEnd,
        timeZone: booking.timeZone,
      })
      return {
        booking: await this.patch(claimed, {
          meetingStatus: 'created',
          eventId: event.id,
          state: 'CONFIRMED',
          invitees: JSON.stringify(invitees),
        }),
      }
    } catch (err) {
      if (err instanceof GraphError && err.uncertain) {
        this.log.warn('v2_meeting_unconfirmed', { bookingId: booking.bookingId, site: booking.site })
        return { booking: await this.patch(claimed, { meetingStatus: 'create_unconfirmed', state: 'NEEDS_ATTENTION' }), unresolved: true }
      }
      const failed = await this.releaseBooking(claimed)
      this.log.error('v2_meeting_failed', { bookingId: booking.bookingId, site: booking.site, code: err?.code })
      return { booking: failed, failed: true }
    }
  }

  /** Claims each recipient, sends once, and records Graph acceptance separately from delivery. */
  async ensureStaffMail(booking) {
    if (booking.meetingStatus !== 'created') return booking
    const notify = JSON.parse(booking.staffNotify || '{}')
    let current = booking
    for (const entry of Object.values(notify)) {
      const action = mailAction(entry, this.now().getTime())
      if (action === 'skip') continue
      if (action === 'expire') {
        entry.status = MAIL.UNCONFIRMED
        current = await this.patch(current, { staffNotify: JSON.stringify(notify) })
        continue
      }
      entry.status = MAIL.CLAIMED
      entry.attempts = (entry.attempts || 0) + 1
      entry.claimedAt = this.now().toISOString()
      current = await this.patch(current, { staffNotify: JSON.stringify(notify) })
      const portalUrl = `${this.cfg.portalBaseUrl}/?section=bookings&site=${encodeURIComponent(booking.site)}&booking=${encodeURIComponent(booking.bookingId)}`
      try {
        await this.mail.send({
          sender: this.cfg.notifySender,
          to: this.cfg.emails[entry.personId],
          idempotencyKey: `${booking.bookingId}:${entry.personId}`,
          subject: `Demo ${booking.reference} (${booking.site} / ${booking.market})`,
          body: staffMailBody({
            site: booking.site,
            market: booking.market,
            reference: booking.reference,
            slotLabel: booking.slotLabel,
            attendeeName: booking.attendeeName,
            organization: booking.organization,
            portalUrl,
          }),
        })
        entry.status = MAIL.ACCEPTED
        current = await this.patch(current, { staffNotify: JSON.stringify(notify) })
      } catch (err) {
        entry.status = err instanceof GraphError && err.uncertain ? MAIL.UNCONFIRMED : MAIL.FAILED
        current = await this.patch(current, { staffNotify: JSON.stringify(notify) })
        this.log.warn('v2_staff_mail', { bookingId: booking.bookingId, site: booking.site, status: entry.status })
      }
    }
    return current
  }

  async patch(booking, fields) {
    const store = this.siteStore(booking.site)
    const etag = await store.update(V2_BOOKINGS_TABLE, { partitionKey: booking.partitionKey, rowKey: booking.rowKey, ...fields }, booking.etag)
    return { ...booking, ...fields, etag }
  }

  publicResult(booking) {
    if (booking.meetingStatus === 'failed' || booking.state === 'RELEASED') {
      return reply(503, { status: 'failed' })
    }
    const notify = summarizeNotify(JSON.parse(booking.staffNotify || '{}'))
    const confirmed = booking.meetingStatus === 'created'
    return reply(confirmed ? 200 : 202, {
      status: confirmed ? 'confirmed' : 'pending',
      meetingStatus: booking.meetingStatus,
      attention: booking.meetingStatus === 'create_unconfirmed' ? 'create_unconfirmed' : undefined,
      reference: booking.reference,
      slot: { start: booking.slotStart, end: booking.slotEnd, date: booking.slotDate, timeZone: booking.timeZone },
      notifications: notify,
    })
  }

  async listForStaff(filters) {
    return (await this.staffRead(filters)).bookings
  }

  /**
   * Reads each site database separately. A database that cannot be read is marked
   * unavailable and the other sites are still returned. Legacy QVM rows are read only
   * from BOOKING_LEGACY_TABLES_ACCOUNT; missing config or read failure is reported.
   */
  async staffRead({ date, site, assignee }) {
    const bookings = []
    const unavailable = []
    const sites = site ? [site] : V2_SITES
    for (const id of sites) {
      if (!V2_SITES.includes(id)) continue
      const store = this.siteStore(id)
      if (!store) continue
      try {
        for await (const row of store.list(V2_BOOKINGS_TABLE, id, 'bkg_', 'bkg`')) {
          if (row.kind && row.kind !== 'booking') continue
          if (date && row.slotDate !== date) continue
          const notify = JSON.parse(row.staffNotify || '{}')
          if (assignee && !notify[assignee]) continue
          bookings.push(this.staffSummary(row))
        }
      } catch (err) {
        unavailable.push(id)
        this.log.warn('v2_site_read_failed', { site: id, code: err?.code || 'unavailable' })
      }
    }
    let legacyUnavailable = false
    let legacyMissing = []
    let legacyReadError = ''
    if (!site || site === 'qvm') {
      if (!this.legacyStore) {
        legacyUnavailable = true
        legacyMissing = ['BOOKING_LEGACY_TABLES_ACCOUNT']
        legacyReadError = 'missing_setting'
        this.log.warn('v2_legacy_read_skipped', { code: 'missing_setting' })
      } else {
        try {
          for await (const row of this.legacyStore.list(BOOKINGS_TABLE, PARTITION, 'bkg_', 'bkg`')) {
            if (date && row.slotStart && !String(row.slotStart).startsWith(date)) continue
            if (assignee && assignee !== 'arup') continue
            bookings.push({
              bookingId: row.bookingId,
              site: 'qvm',
              source: 'legacy-v1',
              readOnly: true,
              reference: row.reference || '',
              slotStart: row.slotStart || '',
              state: row.state || '',
              market: 'unknown',
              answersPresent: Boolean(row.answers),
              meetingStatus: row.eventId ? 'created' : 'unknown',
              invitees: [],
              notifications: {},
            })
          }
        } catch (err) {
          legacyUnavailable = true
          legacyReadError = 'unavailable'
          this.log.warn('v2_legacy_read_failed', { code: err?.code || 'unavailable' })
        }
      }
    }
    return { bookings, unavailable, legacyUnavailable, legacyMissing, legacyReadError }
  }

  async staffDetail(site, bookingId) {
    if (!V2_SITES.includes(site)) return { status: 'not_found', booking: null }
    const store = this.siteStore(site)
    if (!store) return { status: 'not_found', booking: null }
    try {
      const row = await store.get(V2_BOOKINGS_TABLE, site, `bkg_${bookingId}`)
      if (!row) return { status: 'not_found', booking: null }
      return { status: 'ok', booking: { ...this.staffSummary(row), answersOriginal: row.answersOriginal || '' } }
    } catch (err) {
      this.log.warn('v2_site_read_failed', { site, code: err?.code || 'unavailable' })
      return { status: 'unavailable', booking: null }
    }
  }

  staffSummary(row) {
    let invitees = []
    let answers = {}
    try { invitees = JSON.parse(row.invitees || '[]') } catch { invitees = [] }
    try { answers = JSON.parse(row.answersOriginal || '{}') } catch { answers = {} }
    return {
      bookingId: row.bookingId,
      site: row.site,
      source: row.source || 'site-form',
      market: row.market,
      country: answers.country || '',
      countryCode: answers.countryCode || '',
      reference: row.reference,
      slotStart: row.slotStart,
      slotDate: row.slotDate,
      timeZone: row.timeZone,
      state: row.state,
      meetingStatus: row.meetingStatus,
      eventIdPresent: Boolean(row.eventId),
      attendeeName: row.attendeeName,
      organization: row.organization,
      invitees,
      notifications: JSON.parse(row.staffNotify || '{}'),
    }
  }

  /** Releases expired holds, adopts a confirmed calendar event, and never resends an uncertain email. */
  async reconcile() {
    const now = this.now()
    for (const site of V2_SITES) {
      const store = this.siteStore(site)
      if (!store) continue
      try {
        await this.sweepSiteSlots(site, now)
        for await (const row of store.list(V2_BOOKINGS_TABLE, site, 'bkg_', 'bkg`')) {
          if (row.kind && row.kind !== 'booking') continue
          if (row.state === 'RELEASED' || row.meetingStatus === 'failed') {
            await this.releaseEmail(row)
            await this.releaseHold(site, row.bookingId)
            continue
          }
          if (!['create_unconfirmed', 'creating', 'pending'].includes(row.meetingStatus)) continue
          const age = now.getTime() - Date.parse(row.createdAt || 0)
          if (row.meetingStatus !== 'create_unconfirmed' && age < HOLD_MS) continue
          const meeting = await this.ensureMeeting(row, this.rosterFrom(row), row.attendeeEmail, row.attendeeName)
          if (meeting.booking.meetingStatus === 'created') await this.ensureStaffMail(meeting.booking)
        }
        await pruneRateLimits(store, {
          scopes: ['v2-availability', 'v2-booking'],
          olderThanMs: 2 * 24 * 60 * 60 * 1000,
          now,
          table: V2_RATELIMITS_TABLE,
        })
      } catch (err) {
        this.log.error('v2_reconcile_site_failed', { site, code: err?.code || 'unavailable' })
      }
    }
  }

  /** Deletes an expired same-site hold that no longer belongs to a live booking. Never reads the v1 table. */
  async sweepSiteSlots(site, now) {
    const store = this.siteStore(site)
    if (!store) return
    for await (const row of store.list(V2_BOOKINGS_TABLE, site, 'slot_', 'slot`')) {
      if (row.kind !== 'site-slot') continue
      if (Date.parse(row.expiresAt || 0) > now.getTime()) continue
      const booking = row.bookingId ? await store.get(V2_BOOKINGS_TABLE, site, `bkg_${row.bookingId}`) : null
      const stillBooked = booking && booking.state !== 'RELEASED' && booking.meetingStatus !== 'failed' && Date.parse(booking.slotEnd) > now.getTime()
      if (stillBooked) {
        await store.update(V2_BOOKINGS_TABLE, { partitionKey: site, rowKey: row.rowKey, expiresAt: booking.slotEnd }, row.etag).catch(() => {})
        continue
      }
      await store.delete(V2_BOOKINGS_TABLE, site, row.rowKey, row.etag).catch(() => {})
    }
  }
}
