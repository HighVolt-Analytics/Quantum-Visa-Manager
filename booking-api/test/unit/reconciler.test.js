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

describe('cancellation detection and cleanup', () => {
  const locks = (t) => ({ slots: t.store.rows(BOOKINGS_TABLE, 'slot_').length, emails: t.store.rows(BOOKINGS_TABLE, 'email_').length })
  const isLookup = (r) => r.method === 'GET' && /\/events\/[^/]+$/.test(r.path)
  const isWindow = (r) => r.method === 'GET' && r.path.endsWith('/calendar/calendarView')
  const isDelete = (r) => r.method === 'DELETE'

  async function confirmed(t, body = bookingBody()) {
    await t.service.createBooking({ body, ip: IP })
    assert.equal(booking(t).state, STATES.COMPLETE)
    return { body, invite: t.graph.customerEvents()[0], note: t.graph.notes()[0] }
  }

  function assertCancelled(t, reason) {
    const b = booking(t)
    assert.equal(b.state, STATES.CANCELLED)
    assert.equal(b.cancelReason, reason)
    assert.equal(b.attendeeEmail, '')
    assert.equal(b.attendeeName, '')
    assert.equal(b.answers, '')
    assert.deepEqual(locks(t), { slots: 0, emails: 0 })
    assert.equal(t.graph.notes().length, 0)
  }

  function assertStillReserved(t) {
    assert.equal(booking(t).state, STATES.COMPLETE)
    assert.deepEqual(locks(t), { slots: 1, emails: 1 })
    assert.equal(t.graph.notes().length, 1)
  }

  it('confirms an Outlook organizer cancellation (Graph 400 non-calendar folder) and cleans up', async () => {
    const t = setup()
    const { body, invite } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    const s = await t.reconciler.run()
    assert.equal(s.cancelled, 1)
    assertCancelled(t, 'moved')
    const text = t.log.text()
    assert.match(text, /qvm.event=cancellation_confirmed .*reason=moved/)
    assert.match(text, /qvm.event=cancelled /)
    assert.doesNotMatch(text, /reconcile_error/)
    assert.ok(!text.includes(body.answers.email))
    assert.ok(!text.includes(body.answers.first))
  })

  it('confirms a deleted invitation (404)', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.state.events.delete(invite.id)
    await t.reconciler.run()
    assertCancelled(t, 'deleted')
  })

  it('confirms an invitation Exchange marks as cancelled', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.state.events.get(invite.id).isCancelled = true
    await t.reconciler.run()
    assertCancelled(t, 'cancelled')
  })

  it('confirms cancellation of a booking still waiting for its Teams link', async () => {
    const t = setup()
    t.graph.state.teams = false
    await t.service.createBooking({ body: bookingBody(), ip: IP })
    assert.equal(booking(t).state, STATES.PENDING_TEAMS)
    t.graph.organizerCancel(t.graph.customerEvents()[0].id)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
  })

  it('keeps an active meeting reserved and does not re-check it for 30 minutes', async () => {
    const t = setup()
    await confirmed(t)
    await t.reconciler.run()
    assertStillReserved(t)
    assert.ok(booking(t).lastCheckedAt)
    const lookup = t.graph.state.calls.findLast(isLookup)
    assert.equal(new URLSearchParams(lookup.search).get('$select'), 'id,isCancelled')
    const calls = t.graph.state.calls.length
    t.clock.advance(5 * MIN)
    await t.reconciler.run()
    assert.equal(t.graph.state.calls.length, calls)
  })

  it('keeps the booking reserved on an unrecognised ErrorInvalidRequest and logs only safe fields', async () => {
    const t = setup()
    await confirmed(t)
    t.graph.state.faults.push({ when: isLookup, status: 400, body: { error: { code: 'ErrorInvalidRequest', message: 'detail ram@highvolt.tech' } } })
    const s = await t.reconciler.run()
    assert.equal(s.cancelled, 0)
    assertStillReserved(t)
    assert.equal(booking(t).lastCheckedAt, undefined)
    const text = t.log.text()
    assert.match(text, /qvm.event=reconcile_error bookingId=\S+ state=COMPLETE op=lookup_event httpStatus=400 code=ErrorInvalidRequest category=invalid_request/)
    assert.doesNotMatch(text, /detail|ram@/)
  })

  it('keeps the booking reserved through transient errors and detects the cancellation afterwards', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: isLookup, status: 503 })
    await t.reconciler.run()
    assertStillReserved(t)
    assert.match(t.log.text(), /reconcile_error .*op=lookup_event httpStatus=503 .*category=server_error/)
    t.clock.advance(5 * MIN)
    await t.reconciler.run()
    assertStillReserved(t)
    t.graph.organizerCancel(invite.id)
    t.clock.advance(31 * MIN)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
  })

  it('does not cancel when the fallback slot search fails, and retries next run', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: isWindow, status: 503 })
    await t.reconciler.run()
    assert.equal(booking(t).state, STATES.COMPLETE)
    assert.deepEqual(locks(t), { slots: 1, emails: 1 })
    assert.match(t.log.text(), /reconcile_error .*op=window_search .*category=server_error/)
    t.clock.advance(5 * MIN)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
  })

  it('does not cancel when the fallback search still finds a live event for the booking', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.state.events.delete(invite.id)
    t.graph.state.events.set('evt-copy', { ...invite, id: 'evt-copy' })
    const s = await t.reconciler.run()
    assert.equal(s.cancelled, 0)
    assertStillReserved(t)
    assert.match(t.log.text(), /reconcile_error .*code=cancellation_contradicted category=inconclusive/)
  })

  it('releases the locks but keeps cleaning up when the private note cannot be deleted yet', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    for (let i = 0; i < 3; i++) t.graph.state.faults.push({ when: isDelete, status: 503 })
    let s = await t.reconciler.run()
    assert.equal(s.cancelled, 0)
    assert.equal(booking(t).state, STATES.CANCELLING)
    assert.deepEqual(locks(t), { slots: 0, emails: 0 })
    assert.equal(t.graph.notes().length, 1)
    assert.match(t.log.text(), /reconcile_error .*state=COMPLETE op=delete_event httpStatus=503/)
    t.clock.advance(5 * MIN)
    s = await t.reconciler.run()
    assert.equal(s.cancelled, 1)
    assertCancelled(t, 'moved')
  })

  it('raises one needs_attention alert after five failed note deletions and keeps retrying', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    for (let i = 0; i < 15; i++) t.graph.state.faults.push({ when: isDelete, status: 503 })
    for (let i = 0; i < 5; i++) {
      await t.reconciler.run()
      t.clock.advance(5 * MIN)
    }
    assert.equal(booking(t).state, STATES.CANCELLING)
    assert.equal((t.log.text().match(/qvm.event=needs_attention .*reason=note_cleanup_failed/g) || []).length, 1)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
  })

  it('resumes a partially completed cleanup and is idempotent afterwards', async () => {
    const t = setup()
    const { invite } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    const realDelete = t.store.delete.bind(t.store)
    let failNext = true
    t.store.delete = async (table, pk, rk, etag) => {
      if (failNext && rk.startsWith('email_')) {
        failNext = false
        throw Object.assign(new Error('storage unavailable'), { code: 'ServiceUnavailable' })
      }
      return realDelete(table, pk, rk, etag)
    }
    await t.reconciler.run()
    assert.equal(booking(t).state, STATES.CANCELLING)
    assert.deepEqual(locks(t), { slots: 0, emails: 1 })
    t.clock.advance(5 * MIN)
    let s = await t.reconciler.run()
    assert.equal(s.cancelled, 1)
    assertCancelled(t, 'moved')
    const calls = t.graph.state.calls.length
    t.clock.advance(5 * MIN)
    s = await t.reconciler.run()
    assert.equal(s.cancelled, 0)
    assert.equal(t.graph.state.calls.length, calls)
    assert.equal((t.log.text().match(/qvm.event=cancelled /g) || []).length, 1)
  })

  it('treats a private note Arup already deleted as cleaned up', async () => {
    const t = setup()
    const { invite, note } = await confirmed(t)
    t.graph.organizerCancel(invite.id)
    t.graph.organizerCancel(note.id)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
    assert.doesNotMatch(t.log.text(), /reconcile_error/)
  })

  it('finds and removes an unrecorded private note during cleanup', async () => {
    const t = setup()
    await confirmed(t)
    const b = booking(t)
    await t.ledger.updateBooking(b, { noteEventId: '' })
    t.graph.organizerCancel(b.eventId)
    await t.reconciler.run()
    assertCancelled(t, 'moved')
  })

  it('frees the slot and email for exactly one new booking after cancellation', async () => {
    const t = setup()
    const email = 'repeat.customer@example.test'
    const { invite } = await confirmed(t, bookingBody({ answers: { email } }))
    const before = await t.service.createBooking({ body: bookingBody({ answers: { email } }), ip: '203.0.113.21' })
    assert.notEqual(before.body.status, 'confirmed')
    t.graph.organizerCancel(invite.id)
    await t.reconciler.run()
    const res = await t.service.createBooking({ body: bookingBody({ answers: { email } }), ip: '203.0.113.22' })
    assert.equal(res.body.status, 'confirmed')
    assert.equal(t.graph.customerEvents().length, 1)
    assert.deepEqual(locks(t), { slots: 1, emails: 1 })
    const active = t.store.rows(BOOKINGS_TABLE, 'bkg_').filter((r) => r.state === STATES.COMPLETE)
    assert.equal(active.length, 1)
  })
})
