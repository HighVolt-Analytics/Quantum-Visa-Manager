import { randomUUID } from 'node:crypto'
import { BookingService, createAvailabilityCache } from '../../src/lib/bookingService.js'
import { CalendarClient } from '../../src/lib/graph.js'
import { Ledger } from '../../src/lib/ledger.js'
import { createLogger } from '../../src/lib/log.js'
import { Reconciler } from '../../src/lib/reconciler.js'
import { createFakeGraph } from './fakeGraph.js'
import { MemoryTableStore } from './memoryTableStore.js'

// Monday 26 October 2026, 07:00 in Sydney (AEDT, UTC+11).
export const MONDAY_7AM_SYDNEY = '2026-10-25T20:00:00.000Z'
// Tuesday 27 October 2026, 10:00 Sydney.
export const TUESDAY_10AM = '2026-10-26T23:00:00.000Z'

export function captureLog() {
  const lines = []
  const sink = {
    log: (m) => lines.push(['info', m]),
    warn: (m) => lines.push(['warn', m]),
    error: (m) => lines.push(['error', m]),
  }
  return { lines, sink, logger: createLogger(sink), text: () => lines.map((l) => l[1]).join('\n') }
}

export function clock(iso) {
  let t = Date.parse(iso)
  return {
    now: () => new Date(t),
    advance: (ms) => {
      t += ms
    },
    set: (next) => {
      t = Date.parse(next)
    },
  }
}

/** Synthetic test person. Not real customer data. */
export function answers(overrides = {}) {
  return {
    size: '2–5',
    system: 'A mix of several tools',
    systemName: 'ExampleCase Pro',
    bottleneck: 'chasing missing documents',
    first: 'Testy',
    last: 'McTestface',
    email: `testy.${randomUUID().slice(0, 8)}@example.test`,
    phone: '0400 000 000',
    org: 'Example Migration Testing Pty Ltd',
    state: 'NSW',
    consent: true,
    ...overrides,
  }
}

export function bookingBody({ slotStart = TUESDAY_10AM, idempotencyKey = randomUUID(), ...rest } = {}) {
  return { idempotencyKey, slotStart, turnstileToken: 'test-token', answers: answers(rest.answers), ...rest.extra }
}

export function setup({ start = MONDAY_7AM_SYDNEY, turnstile } = {}) {
  const c = clock(start)
  const store = new MemoryTableStore()
  const graph = createFakeGraph()
  const log = captureLog()
  const ledger = new Ledger(store, { now: c.now })
  const sleeps = []
  const calendar = new CalendarClient({
    getToken: async () => 'fake-token',
    fetchImpl: graph.fetchImpl,
    retry: { sleep: async (ms) => sleeps.push(ms), now: () => 0 },
  })
  const turnstileCalls = []
  const verifyTurnstile = async (args) => {
    turnstileCalls.push(args)
    return turnstile ? turnstile(args) : { ok: true }
  }
  const service = new BookingService({
    ledger,
    store,
    calendar,
    verifyTurnstile,
    hashKey: 'test-hash-key',
    log: log.logger,
    now: c.now,
    cache: createAvailabilityCache(0),
  })
  const reconciler = new Reconciler({ ledger, calendar, service, store, log: log.logger, now: c.now })
  return { clock: c, store, graph, log, ledger, calendar, service, reconciler, turnstileCalls, sleeps }
}
