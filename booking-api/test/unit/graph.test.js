import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BOOKING_PROPERTY_ID, CALENDAR_MAILBOX } from '../../src/lib/config.js'
import { CalendarClient, classifyGraphError, GraphError } from '../../src/lib/graph.js'
import { createFakeGraph, NON_CALENDAR_FOLDER } from '../helpers/fakeGraph.js'

function client(graph, sleeps = []) {
  return new CalendarClient({
    getToken: async () => 'fake-token',
    fetchImpl: graph.fetchImpl,
    retry: { sleep: async (ms) => sleeps.push(ms), now: () => 0 },
  })
}

describe('mailbox restriction', () => {
  it('refuses to construct a client for any other mailbox', () => {
    for (const mailbox of ['support@highvolt.tech', 'ram@highvolt.tech', 'arup@highvolt.tech.evil.example', '']) {
      assert.throws(() => new CalendarClient({ mailbox, getToken: async () => 't' }), /restricted/)
    }
  })

  it('addresses only the booking mailbox on every call', async () => {
    const graph = createFakeGraph()
    const c = client(graph)
    await c.getSchedule('2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z')
    await c.lookupEvent('missing')
    await c.eventsInWindow('2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z')
    await c.deleteEvent('missing')
    await c.findEventsByProperty('7f1d3c1e-0c1e-4a2b-9f3d-2b6a5c4d3e2f')
    assert.ok(graph.state.calls.every((r) => r.path.startsWith(`/v1.0/users/${CALENDAR_MAILBOX}/`)))
    assert.deepEqual(graph.state.calls[0].body.schedules, [CALENDAR_MAILBOX])
  })

  it('surfaces an access-denied response for an out-of-scope mailbox as a non-retryable error', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ status: 403, body: { error: { code: 'ErrorAccessDenied' } } })
    await assert.rejects(client(graph).getSchedule('2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z'), (err) => {
      return err instanceof GraphError && err.code === 'ErrorAccessDenied' && err.retryable === false
    })
    assert.equal(graph.state.calls.length, 1)
  })

  it('rejects unsafe booking ids in property filters', async () => {
    await assert.rejects(client(createFakeGraph()).findEventsByProperty("x' or 1 eq 1"), /Invalid booking id/)
  })
})

describe('retries', () => {
  const event = { subject: 's', start: { dateTime: '2026-10-27T10:00:00', timeZone: 'AUS Eastern Standard Time' }, end: { dateTime: '2026-10-27T10:30:00', timeZone: 'AUS Eastern Standard Time' }, transactionId: 'txn-1' }

  it('honours Retry-After on 429 and then succeeds', async () => {
    const graph = createFakeGraph()
    const sleeps = []
    graph.state.faults.push({ status: 429, headers: { 'retry-after': '2' } })
    const created = await client(graph, sleeps).createEvent(event)
    assert.ok(created.id)
    assert.deepEqual(sleeps, [2000])
  })

  it('does not duplicate an event when the first response is lost', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ applyThenTimeout: true })
    const created = await client(graph).createEvent(event)
    assert.equal(graph.state.events.size, 1)
    assert.equal(created.transactionId, 'txn-1')
  })

  it('marks POST failures after timeouts as uncertain', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ timeout: true }, { timeout: true }, { timeout: true })
    await assert.rejects(client(graph).createEvent(event), (err) => err.uncertain === true && err.code === 'timeout')
  })

  it('does not retry definitive 4xx failures and marks them certain', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ status: 400, body: { error: { code: 'ErrorInvalidRequest' } } })
    await assert.rejects(client(graph).createEvent(event), (err) => err.uncertain === false && err.status === 400)
    assert.equal(graph.state.calls.length, 1)
  })

  it('requires a transactionId for event creation', async () => {
    await assert.rejects(client(createFakeGraph()).createEvent({ subject: 'no txn' }), /transactionId/)
  })

})

describe('event lookup for cancellation checks', () => {
  const BOOKING_ID = '7f1d3c1e-0c1e-4a2b-9f3d-2b6a5c4d3e2f'
  const tagged = {
    subject: 's',
    start: { dateTime: '2026-10-27T10:00:00', timeZone: 'AUS Eastern Standard Time' },
    end: { dateTime: '2026-10-27T10:30:00', timeZone: 'AUS Eastern Standard Time' },
    transactionId: 'txn-tagged',
    singleValueExtendedProperties: [{ id: BOOKING_PROPERTY_ID, value: BOOKING_ID }],
  }

  it('reports a live event as active and selects only the fields cancellation needs', async () => {
    const graph = createFakeGraph()
    const c = client(graph)
    const { id } = await c.createEvent(tagged)
    const result = await c.lookupEvent(id)
    assert.equal(result.state, 'active')
    const search = new URLSearchParams(graph.state.calls.at(-1).search)
    assert.equal(search.get('$select'), 'id,isCancelled')
    await c.lookupEvent(id, { includeOnlineMeeting: true })
    assert.equal(new URLSearchParams(graph.state.calls.at(-1).search).get('$select'), 'id,isCancelled,onlineMeeting')
  })

  it('distinguishes cancelled, deleted and moved-to-Deleted-Items events', async () => {
    const graph = createFakeGraph()
    const c = client(graph)
    const a = await c.createEvent({ ...tagged, transactionId: 'a' })
    const b = await c.createEvent({ ...tagged, transactionId: 'b' })
    graph.state.events.get(a.id).isCancelled = true
    assert.equal((await c.lookupEvent(a.id)).state, 'cancelled')
    assert.equal((await c.lookupEvent('never-existed')).state, 'deleted')
    graph.organizerCancel(b.id)
    assert.equal((await c.lookupEvent(b.id)).state, 'moved')
  })

  it('throws other ErrorInvalidRequest failures with a safe category and no Graph message', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ status: 400, body: { error: { code: 'ErrorInvalidRequest', message: 'secret detail ram@highvolt.tech' } } })
    await assert.rejects(client(graph).lookupEvent('evt-x'), (err) => {
      assert.equal(err.category, 'invalid_request')
      assert.equal(err.operation, 'lookup_event')
      assert.equal(err.status, 400)
      assert.doesNotMatch(JSON.stringify({ ...err, message: err.message }), /secret|ram@/)
      return true
    })
    assert.equal(graph.state.calls.length, 1)
  })

  it('retries transient lookup failures and then throws them as inconclusive', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ status: 503 }, { status: 503 }, { status: 503 })
    await assert.rejects(client(graph).lookupEvent('evt-x'), (err) => err.category === 'server_error' && err.operation === 'lookup_event')
    assert.equal(graph.state.calls.length, 3)
  })

  it('lists events in a window with their booking tag', async () => {
    const graph = createFakeGraph()
    const c = client(graph)
    const { id } = await c.createEvent(tagged)
    const events = await c.eventsInWindow('2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z')
    assert.deepEqual(events, [{ id, isCancelled: false, bookingId: BOOKING_ID }])
    const search = new URLSearchParams(graph.state.calls.at(-1).search)
    assert.equal(search.get('$select'), 'id,isCancelled')
    assert.equal(graph.state.calls.at(-1).path, `/v1.0/users/${CALENDAR_MAILBOX}/calendar/calendarView`)
  })

  it('treats a paged window search as inconclusive', async () => {
    const graph = createFakeGraph()
    graph.state.faults.push({ status: 200, body: { value: [], '@odata.nextLink': 'https://graph.microsoft.com/next' } })
    await assert.rejects(
      client(graph).eventsInWindow('2026-10-26T23:00:00.000Z', '2026-10-26T23:30:00.000Z'),
      (err) => err instanceof GraphError && err.category === 'inconclusive' && err.operation === 'window_search',
    )
  })

  it('treats deleting an already deleted or moved event as done', async () => {
    const graph = createFakeGraph()
    const c = client(graph)
    const { id } = await c.createEvent(tagged)
    graph.organizerCancel(id)
    assert.deepEqual(await c.deleteEvent(id), { alreadyGone: true })
    assert.deepEqual(await c.deleteEvent('never-existed'), { alreadyGone: true })
  })

  it('classifies Graph failures into fixed categories', () => {
    assert.equal(classifyGraphError(404, 'ErrorItemNotFound', ''), 'not_found')
    assert.equal(classifyGraphError(400, 'ErrorInvalidRequest', NON_CALENDAR_FOLDER.error.message), 'non_calendar_folder')
    assert.equal(classifyGraphError(400, 'ErrorInvalidRequest', 'anything else'), 'invalid_request')
    assert.equal(classifyGraphError(403, 'ErrorAccessDenied', ''), 'access_denied')
    assert.equal(classifyGraphError(429, 'TooManyRequests', ''), 'throttled')
    assert.equal(classifyGraphError(503, 'http_503', ''), 'server_error')
    assert.equal(classifyGraphError(0, 'timeout', ''), 'timeout')
  })
})
