import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BOOKINGS_TABLE, RATELIMITS_TABLE } from '../../src/lib/config.js'
import { STATES } from '../../src/lib/ledger.js'
import { bookingBody, setup } from '../helpers/fixtures.js'

const MIN = 60000
const IP = '203.0.113.20'
const booking = (t) => t.store.rows(BOOKINGS_TABLE, 'bkg_')[0]

async function failCreate(t, times = 3) {
  for (let i = 0; i < times; i++) t.graph.state.faults.push({ when: t.graph.isCustomerCreate, status: 503 })
  const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
  assert.equal(res.body.status, 'pending')
}

describe('reconciliation of uncertain event creation', () => {
  it('replays creation with the same transactionId and confirms', async () => {
    const t = setup()
    await failCreate(t)
    t.clock.advance(2 * MIN)
    const s = await t.reconciler.run()
    assert.equal(s.replayed, 1)
    assert.equal(booking(t).state, STATES.COMPLETE)
    assert.equal(t.graph.customerEvents().length, 1)
  })

  it('adopts an event that was created even though every response was lost', async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: t.graph.isCustomerCreate, applyThenTimeout: true })
    const res = await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(res.body.status, 'pending')
    assert.equal(t.graph.customerEvents().length, 1)
    t.clock.advance(2 * MIN)
    const s = await t.reconciler.run()
    assert.equal(s.adopted, 1)
    assert.equal(s.replayed, 0)
    assert.equal(t.graph.customerEvents().length, 1)
    assert.equal(booking(t).state, STATES.COMPLETE)
  })

  it('stops and raises an alert instead of creating after 15 minutes without confirmation', async () => {
    const t = setup()
    await failCreate(t)
    t.clock.advance(16 * MIN)
    const s = await t.reconciler.run()
    assert.equal(s.attention, 1)
    assert.equal(booking(t).state, STATES.NEEDS_ATTENTION)
    assert.match(t.log.text(), /qvm.event=needs_attention .*reason=create_unconfirmed/)
    assert.equal(t.graph.customerEvents().length, 0)
  })

  it('flags duplicate events rather than guessing which to keep', async () => {
    const t = setup()
    await failCreate(t)
    const b = booking(t)
    for (const id of ['dup-a', 'dup-b']) {
      t.graph.state.events.set(id, { id, isCancelled: false, createdDateTime: '2026-10-25T20:00:00Z', singleValueExtendedProperties: [{ id: 'String {0b9c5e72-3f4a-4d61-9a8e-5c2f7d1e4b30} Name QvmBookingId', value: b.bookingId }] })
    }
    t.clock.advance(2 * MIN)
    const s = await t.reconciler.run()
    assert.equal(s.attention, 1)
    assert.match(t.log.text(), /reason=duplicate_events/)
  })

  it('leaves an in-flight creation alone during the grace period', async () => {
    const t = setup()
    await failCreate(t)
    const callsBefore = t.graph.state.calls.length
    await t.reconciler.run()
    assert.equal(t.graph.state.calls.length, callsBefore)
    assert.equal(booking(t).state, STATES.CREATING)
  })
})

describe('other reconciliation duties', () => {
  it('releases a hold abandoned before any Graph call', async () => {
    const t = setup()
    const b = bookingBody()
    await t.ledger.reserve({ bookingId: '11111111-1111-4111-8111-111111111111', slotStart: b.slotStart, requestHash: 'h', fingerprint: 'f', emailHash: 'e', booking: { bookingId: '11111111-1111-4111-8111-111111111111' } })
    t.clock.advance(3 * MIN)
    const s = await t.reconciler.run()
    assert.equal(s.released, 1)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 0)
  })

  it('resolves a missing Teams link once Exchange adds it', async () => {
    const t = setup()
    t.graph.state.teams = false
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    const ev = t.graph.customerEvents()[0]
    ev.onlineMeeting = { joinUrl: 'https://teams.example.test/late' }
    await t.reconciler.run()
    assert.equal(booking(t).state, STATES.COMPLETE)
  })

  it('retries the private note and alerts after five failures', async () => {
    const t = setup()
    const isNote = (r) => t.graph.isCreate(r) && r.body?.sensitivity === 'private'
    for (let i = 0; i < 5; i++) t.graph.state.faults.push({ when: isNote, status: 400 })
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    for (let i = 0; i < 4; i++) {
      t.clock.advance(5 * MIN)
      await t.reconciler.run()
    }
    assert.equal(booking(t).noteStatus, 'failed')
    assert.match(t.log.text(), /qvm.event=note_failed/)
    assert.equal(t.graph.notes().length, 0)
  })

  it('delivers a pending note on a later run and purges the answers', async () => {
    const t = setup()
    t.graph.state.faults.push({ when: (r) => t.graph.isCreate(r) && r.body?.sensitivity === 'private', status: 503 }, { when: (r) => t.graph.isCreate(r) && r.body?.sensitivity === 'private', status: 503 }, { when: (r) => t.graph.isCreate(r) && r.body?.sensitivity === 'private', status: 503 })
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(booking(t).noteStatus, 'pending')
    t.clock.advance(5 * MIN)
    await t.reconciler.run()
    assert.equal(t.graph.notes().length, 1)
    assert.equal(booking(t).answers, '')
    assert.equal(booking(t).state, STATES.COMPLETE)
  })

  it('frees the slot and removes the private note when the invitation is cancelled', async () => {
    const t = setup()
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    const invite = t.graph.customerEvents()[0]
    t.graph.state.events.delete(invite.id)
    const s = await t.reconciler.run()
    assert.equal(s.cancelled, 1)
    assert.equal(booking(t).state, STATES.CANCELLED)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'slot_').length, 0)
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'email_').length, 0)
    assert.equal(t.graph.notes().length, 0)
  })

  it('archives past meetings and removes personal details', async () => {
    const t = setup()
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    t.clock.set('2026-10-27T01:00:00.000Z')
    const s = await t.reconciler.run()
    assert.equal(s.archived, 1)
    const b = booking(t)
    assert.equal(b.state, STATES.ARCHIVED)
    assert.equal(b.attendeeEmail, '')
    assert.equal(b.attendeeName, '')
    assert.equal(t.store.rows(BOOKINGS_TABLE, 'email_').length, 0)
  })

  it('prunes old rate-limit windows', async () => {
    const t = setup()
    await t.service.availability({ ip: IP })
    assert.equal(t.store.rows(RATELIMITS_TABLE).length, 1)
    t.clock.advance(3 * 24 * 60 * MIN)
    await t.reconciler.run()
    assert.equal(t.store.rows(RATELIMITS_TABLE).length, 0)
  })
})
