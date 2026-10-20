import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { BOOKINGS_TABLE } from '../../src/lib/config.js'
import { STATES } from '../../src/lib/ledger.js'
import { TUESDAY_10AM, answers, bookingBody, setup } from '../helpers/fixtures.js'

const IP = '203.0.113.10'
const bookingRows = (t) => t.store.rows(BOOKINGS_TABLE, 'bkg_')

describe('availability', () => {
  it('returns open slots only, excluding busy calendar time and reserved slots', async () => {
    const t = setup()
    t.graph.state.busy.add(TUESDAY_10AM)
    const res = await t.service.availability({ ip: IP })
    assert.equal(res.httpStatus, 200)
    assert.equal(res.body.timeZone, 'Australia/Sydney')
    const starts = res.body.slots.map((s) => s.start)
    assert.ok(!starts.includes(TUESDAY_10AM))
    assert.ok(starts.includes('2026-10-26T23:30:00.000Z'))

    await t.service.createBooking({ body: bookingBody({ slotStart: '2026-10-26T23:30:00.000Z' }), ip: '198.51.100.1' })
    const after = await t.service.availability({ ip: IP })
    assert.ok(!after.body.slots.some((s) => s.start === '2026-10-26T23:30:00.000Z'))
  })

  it('exposes no calendar details beyond slot times', async () => {
    const t = setup()
    const res = await t.service.availability({ ip: IP })
    assert.deepEqual(Object.keys(res.body.slots[0]).sort(), ['date', 'end', 'endTime', 'label', 'start', 'time', 'timeZone', 'weekday'])
  })

  it('rate limits repeated availability requests from one IP', async () => {
    const t = setup()
    for (let i = 0; i < 30; i++) assert.equal((await t.service.availability({ ip: IP })).httpStatus, 200)
    assert.equal((await t.service.availability({ ip: IP })).httpStatus, 429)
    assert.equal((await t.service.availability({ ip: '198.51.100.2' })).httpStatus, 200)
  })
})

describe('booking flow', () => {
  it('books the slot, invites the customer with Teams and files a private note for Arup', async () => {
    const t = setup()
    const body = bookingBody()
    const res = await t.service.createBooking({ body, ip: IP })
    assert.equal(res.httpStatus, 200)
    assert.equal(res.body.status, 'confirmed')
    assert.match(res.body.reference, /^QVM-[A-Z2-9]{6}$/)
    assert.equal(res.body.slot.start, TUESDAY_10AM)

    const [invite] = t.graph.customerEvents()
    assert.equal(invite.isOnlineMeeting, true)
    assert.equal(invite.onlineMeetingProvider, 'teamsForBusiness')
    assert.deepEqual(invite.attendees, [{ emailAddress: { address: body.answers.email, name: 'Testy McTestface' }, type: 'required' }])
    assert.equal(invite.start.timeZone, 'AUS Eastern Standard Time')
    assert.equal(invite.start.dateTime, '2026-10-27T10:00:00')
    assert.equal(invite.allowNewTimeProposals, false)
    assert.ok(invite.transactionId)

    const [note] = t.graph.notes()
    assert.deepEqual(note.attendees, [])
    assert.equal(note.showAs, 'free')
    assert.match(note.body.content, /Example Migration Testing Pty Ltd/)
    assert.match(note.body.content, /chasing missing documents/)

    const [booking] = bookingRows(t)
    assert.equal(booking.state, STATES.COMPLETE)
    assert.equal(booking.answers, '', 'answers are removed from Azure once the note exists')
  })

  it('keeps every questionnaire answer out of the customer invitation', async () => {
    const t = setup()
    const body = bookingBody({ answers: { systemName: 'UniqueSystemMarker', phone: '0499 999 999' } })
    await t.service.createBooking({ body, ip: IP })
    const inviteJson = JSON.stringify(t.graph.customerEvents()[0])
    for (const secret of ['UniqueSystemMarker', '0499 999 999', body.answers.org, body.answers.bottleneck, body.answers.size, 'NSW', 'A mix of several tools']) {
      assert.ok(!inviteJson.includes(secret), `invitation leaked: ${secret}`)
    }
  })

  it('rejects a slot that became busy after availability was shown, and releases it', async () => {
    const t = setup()
    t.graph.state.busy.add(TUESDAY_10AM)
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 409)
    assert.equal(res.body.status, 'slot_taken')
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 0)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'email_').length, 0)
    assert.equal(t.graph.customerEvents().length, 0)
  })

  it('refuses slots outside the rules', async () => {
    const t = setup()
    const saturday = await t.service.createBooking({ body: bookingBody({ slotStart: '2026-10-30T23:00:00.000Z' }), ip: IP })
    assert.equal(saturday.httpStatus, 422)
    const tooSoon = await t.service.createBooking({ body: bookingBody({ slotStart: '2026-10-25T23:00:00.000Z' }), ip: IP })
    assert.equal(tooSoon.httpStatus, 422)
  })

  it('returns field names, never values, for invalid input', async () => {
    const t = setup()
    const res = await t.service.createBooking({ body: bookingBody({ answers: { email: 'nope', consent: false } }), ip: IP })
    assert.equal(res.httpStatus, 400)
    assert.deepEqual(res.body.fields.sort(), ['consent', 'email'])
  })

  it('allows one upcoming booking per email address', async () => {
    const t = setup()
    const email = 'repeat.person@example.test'
    await t.service.createBooking({ body: bookingBody({ answers: { email } }), ip: IP })
    const second = await t.service.createBooking({ body: bookingBody({ slotStart: '2026-10-26T23:30:00.000Z', answers: { email: 'Repeat.Person@example.test' } }), ip: IP })
    assert.equal(second.httpStatus, 409)
    assert.equal(second.body.status, 'already_booked')
  })

  it('rate limits booking attempts per IP', async () => {
    const t = setup()
    const slots = ['2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-27T00:30:00.000Z', '2026-10-27T01:00:00.000Z', '2026-10-27T01:30:00.000Z']
    const results = []
    for (const slotStart of slots) results.push((await t.service.createBooking({ body: bookingBody({ slotStart }), ip: IP })).httpStatus)
    assert.deepEqual(results, [200, 200, 200, 200, 200, 429])
  })
})

describe('Turnstile enforcement', () => {
  it('blocks a rejected token before anything is reserved', async () => {
    const t = setup({ turnstile: () => ({ ok: false, reason: 'rejected' }) })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 403)
    assert.equal(t.store.rows(BOOKINGS_TABLE).length, 0)
    assert.equal(t.graph.state.calls.length, 0)
  })

  it('fails closed when Turnstile is unavailable', async () => {
    const t = setup({ turnstile: () => ({ ok: false, reason: 'unavailable' }) })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 503)
    assert.equal(t.store.rows(BOOKINGS_TABLE).length, 0)
  })

  it('passes the client IP and idempotency key to Turnstile', async () => {
    const t = setup()
    const body = bookingBody()
    await t.service.createBooking({ body, ip: IP })
    assert.equal(t.turnstileCalls[0].remoteIp, IP)
    assert.equal(t.turnstileCalls[0].idempotencyKey, body.idempotencyKey)
  })
})

describe('duplicates and concurrency', () => {
  it('replays a duplicate submission without a second invitation or Turnstile check', async () => {
    const t = setup()
    const body = bookingBody()
    const first = await t.service.createBooking({ body, ip: IP })
    const second = await t.service.createBooking({ body: structuredClone(body), ip: IP })
    assert.equal(second.httpStatus, 200)
    assert.equal(second.body.reference, first.body.reference)
    assert.equal(t.graph.customerEvents().length, 1)
    assert.equal(t.turnstileCalls.length, 1)
  })

  it('rejects an idempotency key reused for a different booking', async () => {
    const t = setup()
    const body = bookingBody()
    await t.service.createBooking({ body, ip: IP })
    const changed = { ...structuredClone(body), slotStart: '2026-10-26T23:30:00.000Z' }
    const res = await t.service.createBooking({ body: changed, ip: IP })
    assert.equal(res.httpStatus, 409)
    assert.equal(res.body.status, 'idempotency_conflict')
  })

  it('gives a contested slot to exactly one of 20 simultaneous visitors', async () => {
    const t = setup()
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => t.service.createBooking({ body: bookingBody(), ip: `198.51.100.${i + 1}` })),
    )
    const statuses = results.map((r) => r.body.status)
    assert.equal(statuses.filter((s) => s === 'confirmed').length, 1)
    assert.equal(statuses.filter((s) => s === 'slot_taken').length, 19)
    assert.equal(t.graph.customerEvents().length, 1)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 1)
  })

  it('collapses simultaneous retries of one submission into one booking', async () => {
    const t = setup()
    const body = bookingBody({ idempotencyKey: randomUUID() })
    const results = await Promise.all(Array.from({ length: 5 }, () => t.service.createBooking({ body: structuredClone(body), ip: IP })))
    const references = new Set(results.map((r) => r.body.reference))
    assert.equal(references.size, 1)
    assert.ok(results.every((r) => ['confirmed', 'pending'].includes(r.body.status)))
    assert.equal(t.graph.customerEvents().length, 1)
    assert.equal(bookingRows(t).length, 1)
  })
})

describe('Microsoft Graph failures', () => {
  it('reports pending and leaves the booking for reconciliation when Graph keeps failing', async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: t.graph.isCustomerCreate, status: 503 })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 202)
    assert.equal(res.body.status, 'pending')
    assert.equal(bookingRows(t)[0].state, STATES.CREATING)
    assert.equal(t.graph.customerEvents().length, 0)
  })

  it('does not duplicate the invitation when Graph created it but the response was lost', async () => {
    const t = setup()
    t.graph.state.faults.push({ when: t.graph.isCustomerCreate, applyThenTimeout: true })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.body.status, 'confirmed')
    assert.equal(t.graph.customerEvents().length, 1)
  })

  it('releases the slot on a definitive Graph refusal', async () => {
    const t = setup()
    t.graph.state.faults.push({ when: t.graph.isCustomerCreate, status: 403, body: { error: { code: 'ErrorAccessDenied' } } })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 503)
    assert.equal(res.body.status, 'failed')
    assert.equal(bookingRows(t)[0].state, STATES.RELEASED)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 0)
  })

  it('releases the hold if the live free/busy check fails', async () => {
    const t = setup()
    const isSchedule = (r) => r.path.endsWith('/calendar/getSchedule')
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: isSchedule, status: 503 })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.httpStatus, 503)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 0)
  })

  it('still confirms the booking when the Teams link is missing, and flags it', async () => {
    const t = setup()
    t.graph.state.teams = false
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.body.status, 'confirmed')
    assert.equal(bookingRows(t)[0].state, STATES.PENDING_TEAMS)
    assert.match(t.log.text(), /qvm.event=teams_link_missing/)
  })

  it('keeps the customer booking when the private note fails, for later retry', async () => {
    const t = setup()
    t.graph.state.faults.push({ when: (r) => t.graph.isCreate(r) && r.body?.sensitivity === 'private', status: 400 })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.body.status, 'confirmed')
    const [booking] = bookingRows(t)
    assert.equal(booking.state, STATES.CONFIRMED)
    assert.equal(booking.noteStatus, 'pending')
    assert.notEqual(booking.answers, '')
  })
})

describe('sanitised logging', () => {
  it('never writes customer personal data to logs', async () => {
    const t = setup()
    const a = answers({ first: 'Zelda', last: 'Quixote', email: 'zelda.quixote@example.test', phone: '0411 222 333', org: 'Unique Org Marker' })
    await t.service.createBooking({ body: bookingBody({ answers: a }), ip: '192.0.2.55' })
    t.graph.state.faults.push({ when: t.graph.isCustomerCreate, status: 503 }, { when: t.graph.isCustomerCreate, status: 503 }, { when: t.graph.isCustomerCreate, status: 503 })
    await t.service.createBooking({ body: bookingBody({ slotStart: '2026-10-26T23:30:00.000Z', answers: { ...a, email: 'other.zelda@example.test' } }), ip: '192.0.2.55' })
    const text = t.log.text()
    assert.ok(text.length > 0)
    for (const pii of ['Zelda', 'Quixote', 'zelda.quixote', '0411', 'Unique Org Marker', '192.0.2.55', 'test-token']) {
      assert.ok(!text.includes(pii), `log leaked ${pii}`)
    }
  })
})
