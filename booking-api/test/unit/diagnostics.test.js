import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DENIAL_PROBES, makeDiagnosticsHandler, rawGraphCaller } from '../../src/functions/diagnostics.js'
import { CalendarClient } from '../../src/lib/graph.js'
import { getDiagnosticsDeps } from '../../src/runtime.js'
import { captureLog } from '../helpers/fixtures.js'
import { createFakeGraph } from '../helpers/fakeGraph.js'

function deps(graph) {
  const getToken = async () => 'fake-token'
  return {
    enabled: true,
    calendar: new CalendarClient({ getToken, fetchImpl: graph.fetchImpl, retry: { sleep: async () => {}, now: () => 0 } }),
    rawGraph: rawGraphCaller({ getToken, fetchImpl: graph.fetchImpl }),
    now: () => new Date('2026-10-25T20:00:00Z'),
  }
}

describe('post-deployment diagnostics', () => {
  it('is unavailable unless explicitly enabled', async () => {
    assert.deepEqual(getDiagnosticsDeps({}), { enabled: false })
    const res = await makeDiagnosticsHandler(() => ({ enabled: false }))({}, captureLog().sink)
    assert.equal(res.status, 404)
  })

  it('confirms scoped access, denial elsewhere and a Teams link, then removes its test event', async () => {
    const graph = createFakeGraph()
    const log = captureLog()
    const res = await makeDiagnosticsHandler(() => deps(graph))({}, log.sink)
    assert.equal(res.status, 200)
    const r = res.jsonBody
    assert.equal(r.getSchedule.ok, true)
    assert.equal(r.onlineMeetingProviders.teamsAllowed, true)
    for (const mailbox of DENIAL_PROBES) assert.deepEqual(r.denialProbes[mailbox], { status: 403, denied: true })
    assert.deepEqual(r.teamsEvent, { ok: true, created: true, joinUrlPresent: true, deleted: true })
    assert.equal(graph.state.events.size, 0)
    const created = graph.state.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'))
    assert.deepEqual(created.body.attendees, [])
    assert.match(log.text(), /qvm.event=diagnostics_run status=pass/)
  })

  it('reports a missing Teams link without leaving the test event behind', async () => {
    const graph = createFakeGraph()
    graph.state.teams = false
    const res = await makeDiagnosticsHandler(() => deps(graph))({}, captureLog().sink)
    assert.equal(res.jsonBody.teamsEvent.joinUrlPresent, false)
    assert.equal(res.jsonBody.onlineMeetingProviders.teamsAllowed, false)
    assert.equal(graph.state.events.size, 0)
  })

  it('returns only status information, never calendar contents', async () => {
    const graph = createFakeGraph()
    graph.state.events.set('private-1', { id: 'private-1', subject: 'Confidential meeting', showAs: 'busy', startMs: 0, endMs: 0 })
    const res = await makeDiagnosticsHandler(() => deps(graph))({}, captureLog().sink)
    assert.ok(!JSON.stringify(res.jsonBody).includes('Confidential'))
  })
})
