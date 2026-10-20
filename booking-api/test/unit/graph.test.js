import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CALENDAR_MAILBOX } from '../../src/lib/config.js'
import { CalendarClient, GraphError } from '../../src/lib/graph.js'
import { createFakeGraph } from '../helpers/fakeGraph.js'

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
    await c.getEvent('missing')
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

  it('returns null for a missing event', async () => {
    assert.equal(await client(createFakeGraph()).getEvent('nope'), null)
  })
})
