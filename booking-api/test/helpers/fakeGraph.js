import { CALENDAR_MAILBOX } from '../../src/lib/config.js'
import { sydneyLocalToUtc } from '../../src/lib/sydneyTime.js'

const SLOT_MS = 30 * 60000

function localToUtc(dt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dt.dateTime)
  return sydneyLocalToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).getTime()
}

function respond(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function timeoutError() {
  const err = new Error('The operation timed out')
  err.name = 'TimeoutError'
  return err
}

/**
 * Minimal Microsoft Graph calendar emulator for one mailbox. Any other mailbox gets
 * 403 ErrorAccessDenied, mirroring the Exchange application RBAC scope.
 * `faults` is a queue of { when(req), status?, body?, headers?, timeout?, applyThenTimeout? }.
 */
export function createFakeGraph() {
  const state = { events: new Map(), byTransaction: new Map(), busy: new Set(), faults: [], calls: [], nextId: 1, teams: true }

  function availability(startMs, endMs) {
    let view = ''
    for (let t = startMs; t < endMs; t += SLOT_MS) {
      const busyEvent = [...state.events.values()].some(
        (e) => !e.isCancelled && e.showAs === 'busy' && e.startMs < t + SLOT_MS && e.endMs > t,
      )
      view += busyEvent || state.busy.has(new Date(t).toISOString()) ? '2' : '0'
    }
    return view
  }

  function route(req) {
    const prefix = `/v1.0/users/${CALENDAR_MAILBOX}`
    if (!req.path.startsWith(`${prefix}/`)) return respond(403, { error: { code: 'ErrorAccessDenied' } })
    const path = req.path.slice(prefix.length)

    if (req.method === 'POST' && path === '/calendar/getSchedule') {
      const start = Date.parse(`${req.body.startTime.dateTime}Z`)
      const end = Date.parse(`${req.body.endTime.dateTime}Z`)
      if (req.body.schedules.length !== 1 || req.body.schedules[0] !== CALENDAR_MAILBOX) {
        return respond(403, { error: { code: 'ErrorAccessDenied' } })
      }
      return respond(200, { value: [{ scheduleId: CALENDAR_MAILBOX, availabilityView: availability(start, end) }] })
    }

    if (req.method === 'GET' && path === '/calendar') {
      return respond(200, { allowedOnlineMeetingProviders: state.teams ? ['teamsForBusiness'] : [], defaultOnlineMeetingProvider: state.teams ? 'teamsForBusiness' : 'unknown' })
    }

    if (req.method === 'POST' && path === '/events') {
      const existing = state.byTransaction.get(req.body.transactionId)
      if (existing) return respond(201, existing)
      const id = `evt-${state.nextId++}`
      const event = {
        ...req.body,
        id,
        isCancelled: false,
        createdDateTime: new Date(1700000000000 + state.nextId * 1000).toISOString(),
        startMs: localToUtc(req.body.start),
        endMs: localToUtc(req.body.end),
        onlineMeeting: req.body.isOnlineMeeting && state.teams ? { joinUrl: `https://teams.example.test/${id}` } : null,
      }
      state.events.set(id, event)
      state.byTransaction.set(req.body.transactionId, event)
      return respond(201, event)
    }

    if (req.method === 'GET' && path === '/events') {
      const filter = new URLSearchParams(req.search).get('$filter') || ''
      const m = /ep\/id eq '([^']+)' and ep\/value eq '([^']+)'/.exec(filter)
      const matches = [...state.events.values()].filter((e) =>
        (e.singleValueExtendedProperties || []).some((p) => m && p.id === m[1] && p.value === m[2]),
      )
      return respond(200, { value: matches })
    }

    const one = /^\/events\/([^/?]+)$/.exec(path)
    if (one) {
      const id = decodeURIComponent(one[1])
      const event = state.events.get(id)
      if (req.method === 'GET') return event ? respond(200, event) : respond(404, { error: { code: 'ErrorItemNotFound' } })
      if (req.method === 'DELETE') {
        if (!event) return respond(404, { error: { code: 'ErrorItemNotFound' } })
        state.events.delete(id)
        return new Response(null, { status: 204 })
      }
    }
    return respond(400, { error: { code: 'UnsupportedRoute' } })
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(url)
    const req = {
      method: init.method || 'GET',
      path: decodeURIComponent(u.pathname),
      search: u.search,
      body: init.body ? JSON.parse(init.body) : undefined,
    }
    state.calls.push(req)
    const i = state.faults.findIndex((f) => !f.when || f.when(req))
    if (i >= 0) {
      const fault = state.faults.splice(i, 1)[0]
      if (fault.timeout) throw timeoutError()
      if (fault.applyThenTimeout) {
        route(req)
        throw timeoutError()
      }
      return respond(fault.status, fault.body ?? { error: { code: `http_${fault.status}` } }, fault.headers)
    }
    return route(req)
  }

  const customerEvents = () => [...state.events.values()].filter((e) => e.attendees?.length)
  const notes = () => [...state.events.values()].filter((e) => e.sensitivity === 'private')
  const isCreate = (req) => req.method === 'POST' && req.path.endsWith('/events')
  const isCustomerCreate = (req) => isCreate(req) && req.body?.attendees?.length > 0

  return { fetchImpl, state, customerEvents, notes, isCreate, isCustomerCreate }
}
