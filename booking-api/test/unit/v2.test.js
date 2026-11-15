import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { GraphError } from '../../src/lib/graph.js'
import { BOOKINGS_TABLE, PARTITION } from '../../src/lib/config.js'
import { slotRowKey } from '../../src/lib/schedule.js'
import { Ledger } from '../../src/lib/ledger.js'
import { Reconciler } from '../../src/lib/reconciler.js'
import { publicWriteGate, readLegacyTablesAccount, readSqlServer, readV2Config, siteStorageSetting, siteTurnstileHostnames, SQL_DATABASES, V2_BOOKINGS_TABLE, V2_ORGANIZER_MAILBOX } from '../../src/lib/v2/config.js'
import { validateV2Booking } from '../../src/lib/v2/validation.js'
import { SqlSiteStore } from '../../src/lib/v2/sqlStore.js'
import { getSharedResources, tableCredential } from '../../src/runtime.js'
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import { deriveMarket } from '../../src/lib/v2/market.js'
import { timeSlices, viewIsFree } from '../../src/lib/v2/locks.js'
import { mailAction, MAIL } from '../../src/lib/v2/notifications.js'
import { recipientsFor } from '../../src/lib/v2/roster.js'
import { candidateSlots, visitorSchedule } from '../../src/lib/v2/schedule.js'
import { V2BookingService } from '../../src/lib/v2/service.js'
import { MemoryTableStore } from '../helpers/memoryTableStore.js'

const visit = { configured: true, missing: [], slotMinutes: 30, noticeMs: 0, horizonDays: 2 }
const schedule = visitorSchedule(visit, 'Australia/Sydney')

const now = new Date('2026-11-08T00:00:00.000Z')
const slot = candidateSlots(schedule, now)[0]

function harness(mailBehavior = async () => ({ acceptedByGraph: true })) {
  const store = new MemoryTableStore()
  const events = []
  const sent = []
  const calendar = {
    async getSchedule() { return '0' },
    async findByBooking(_mailbox, bookingId) { return events.filter((event) => event.bookingId === bookingId) },
    async createEvent(_mailbox, payload) {
      const existing = events.find((event) => event.transactionId === payload.transactionId)
      if (existing) return existing
      const event = { id: `evt-${events.length + 1}`, bookingId: payload.bookingId, transactionId: payload.transactionId, attendees: payload.attendees }
      events.push(event)
      return event
    },
  }
  const mail = {
    send: async (message) => {
      const result = await mailBehavior(message, sent.length)
      sent.push(message)
      return result
    },
  }
  const cfg = {
    emails: { arup: 'arup@example.test', jasisca: 'jasisca@example.test', lakshmi: 'lakshmi@example.test', prachi: 'prachi@example.test', sabina: 'sabina@example.test', khushi: 'khushi@example.test' },
    organizerMailbox: V2_ORGANIZER_MAILBOX,
    notifySender: V2_ORGANIZER_MAILBOX,
    portalBaseUrl: 'https://portal.example.test',
    hashKey: 'test-hash',
    visit,
    sites: {
      agent: { origins: ['https://quantumagent.com.au'] },
      qvm: { origins: ['https://quantumvisamanager.com'] },
      ledgerline: { origins: ['https://quantumledgerline.com'] },
      edupass: { origins: ['https://quantumedupass.com'] },
      hva: { origins: [] },
    },
  }
  const log = { info() {}, warn() {}, error() {} }
  const service = new V2BookingService({
    store,
    calendar,
    mail,
    cfg,
    log,
    now: () => now,
    verifyTurnstile: async () => ({ ok: true }),
  })
  return { store, events, sent, service }
}

function body(site, extra = {}) {
  return {
    site,
    idempotencyKey: extra.idempotencyKey || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slotStart: extra.slotStart || slot.start,
    timeZone: extra.timeZone || 'Australia/Sydney',
    turnstileToken: 'token',
    answers: {
      size: '2–10 people',
      system: 'Phone',
      bottleneck: 'Missed calls',
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      org: 'Example Co',
      country: 'Australia',
      consent: true,
      ...extra.answers,
    },
  }
}

test('v2 validation stores consent and keeps extra submitted answer fields', () => {
  const base = {
    site: 'agent',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slotStart: '2026-11-08T22:00:00.000Z',
    timeZone: 'Australia/Sydney',
    turnstileToken: 'token',
    answers: {
      size: '2–10 people',
      system: 'Phone',
      bottleneck: 'Missed calls',
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      org: 'Example Co',
      country: 'Australia',
      consent: true,
      channelPreference: 'WhatsApp',
      partner: true,
    },
  }
  const ok = validateV2Booking(base)
  assert.equal(ok.ok, true)
  assert.equal(ok.value.answers.consent, true)
  assert.equal(ok.value.answers.partner, true)
  assert.equal(ok.value.answers.channelPreference, 'WhatsApp')
  assert.equal(ok.value.answers.country, 'Australia')

  const hva = validateV2Booking({
    site: 'hva',
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    slotStart: '2026-11-08T22:00:00.000Z',
    timeZone: 'Australia/Sydney',
    turnstileToken: 'token',
    answers: {
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      phone: '+61 400 000 000',
      address: '1 Demo Street',
      specialRequests: 'Focus on finance automation',
      country: 'Australia',
      consent: true,
    },
  })
  assert.equal(hva.ok, true)
  assert.equal(hva.value.answers.address, '1 Demo Street')
  assert.equal(hva.value.answers.specialRequests, 'Focus on finance automation')
  assert.equal(hva.value.answers.bottleneck, 'Focus on finance automation')
  assert.equal(hva.value.answers.size, 'HighVolt demo')
  assert.equal(hva.value.answers.org, '1 Demo Street')
  const hvaMissingName = validateV2Booking({
    site: 'hva',
    idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    slotStart: '2026-11-08T22:00:00.000Z',
    timeZone: 'Australia/Sydney',
    turnstileToken: 'token',
    answers: { email: 'ada@example.test', country: 'Australia', consent: true },
  })
  assert.equal(hvaMissingName.ok, false)
  assert.ok(hvaMissingName.errors.includes('first'))
  assert.ok(hvaMissingName.errors.includes('last'))

  const qvm = validateV2Booking({
    ...base,
    site: 'qvm',
    answers: {
      size: 'Sole agent',
      system: 'Spreadsheets, email and shared drives',
      bottleneck: 'after-hours enquiries',
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      org: 'Practice Co',
      state: 'NSW',
      country: 'Australia',
      consent: true,
      referralSource: 'Colleague',
    },
  })
  assert.equal(qvm.ok, true)
  assert.equal(qvm.value.answers.state, 'NSW')
  assert.equal(qvm.value.answers.referralSource, 'Colleague')
  assert.equal(qvm.value.answers.consent, true)
})

test('v2 switches default off and HVA stays off', () => {
  const cfg = readV2Config({})
  for (const site of ['hva', 'agent', 'qvm', 'ledgerline', 'edupass']) {
    assert.equal(cfg.sites[site].enabled, false)
    assert.deepEqual(cfg.sites[site].origins, [])
  }
  assert.equal(cfg.organizerMailbox, V2_ORGANIZER_MAILBOX)
  assert.equal(cfg.notifySender, V2_ORGANIZER_MAILBOX)
  assert.equal(cfg.visit.configured, false)
  assert.deepEqual(cfg.visit.missing, ['BOOKING_SLOT_MINUTES', 'BOOKING_NOTICE_MINUTES', 'BOOKING_HORIZON_DAYS'])
  assert.equal(publicWriteGate(cfg, 'agent', 'https://quantumagent.com.au').body.reason, 'switch_off')
  assert.equal(publicWriteGate(cfg, 'hva', 'https://highvolt.tech').body.reason, 'switch_off')
  const enabled = readV2Config({ BOOKING_V2_ENABLED_AGENT: 'true', BOOKING_ORIGINS_AGENT: 'https://quantumagent.com.au' })
  assert.equal(publicWriteGate(enabled, 'agent', 'https://quantumedupass.com').body.reason, 'origin_mismatch')
  assert.equal(publicWriteGate(enabled, 'agent', 'https://quantumagent.com.au').ok, true)
})

test('the selected country chooses the roster and a browser market is ignored', async () => {
  assert.equal(deriveMarket('qvm', { country: 'India', state: 'NSW', market: 'australia' }).market, 'india')
  assert.equal(deriveMarket('hva', { country: 'AU', market: 'india' }).market, 'australia')
  assert.equal(deriveMarket('agent', { country: 'Singapore', market: 'india' }).market, 'other')
  assert.equal(deriveMarket('edupass', { country: 'Not a country', market: 'india' }).ok, false)
  const { service } = harness()
  const booked = await service.create({
    body: { ...body('agent'), market: 'india', answers: { ...body('agent').answers, country: 'AU' } },
    ip: '127.0.0.8',
  })
  assert.equal(booked.httpStatus, 200)
  const [row] = await service.listForStaff({ site: 'agent' })
  assert.equal(row.market, 'australia')
  assert.equal(row.country, 'Australia')
  assert.equal(row.countryCode, 'AU')
})

test('roster deduplicates someone who is both primary and secondary', () => {
  assert.deepEqual(recipientsFor('hva', 'australia').map((person) => person.id), ['arup'])
  assert.deepEqual(recipientsFor('agent', 'other').map((person) => person.id), ['arup', 'prachi'])
  assert.equal(recipientsFor('agent', 'india').length, 3)
  assert.equal(recipientsFor('qvm', 'australia')[0].id, 'jasisca')
})

test('a retry reuses the meeting and does not send a second staff email', async () => {
  const { service, events, sent } = harness()
  const first = await service.create({ body: body('agent'), origin: 'https://quantumagent.com.au', ip: '127.0.0.1' })
  const second = await service.create({ body: body('agent'), origin: 'https://quantumagent.com.au', ip: '127.0.0.1' })
  assert.equal(first.httpStatus, 200)
  assert.equal(second.httpStatus, 200)
  assert.equal(second.body.reference, first.body.reference)
  assert.equal(events.length, 1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].body.includes('Missed calls'), false)
  assert.match(sent[0].body, /portal\.example\.test/)
})

test('an uncertain staff send is not retried', async () => {
  let calls = 0
  const { service, sent } = harness(async () => {
    calls += 1
    throw new GraphError('timeout', { uncertain: true })
  })
  await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  assert.equal(calls, 1)
  assert.equal(sent.length, 0)
})

test('a definite staff-mail failure can be retried once the claim is released', async () => {
  let fail = true
  const { service, sent } = harness(async () => {
    if (fail) throw new GraphError('ErrorInvalidRecipients', { status: 400, uncertain: false })
    return { acceptedByGraph: true }
  })
  const first = await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  assert.equal(first.body.notifications.failed, 1)
  fail = false
  const second = await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  assert.equal(sent.length, 1)
  assert.equal(second.body.notifications.accepted_by_graph, 1)
})

test('the same person can be booked on two sites at the same time', async () => {
  const stores = { agent: new MemoryTableStore(), qvm: new MemoryTableStore() }
  const { service, events } = harness()
  service.stores = stores
  service.calendar.getSchedule = async () => '1'
  const qvm = body('qvm', {
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    answers: { size: 'Sole agent', system: 'Spreadsheets, email and shared drives', bottleneck: 'after-hours enquiries', state: 'NSW', country: 'Australia' },
  })
  const first = await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  const second = await service.create({ body: qvm, origin: 'x', ip: '127.0.0.1' })
  assert.equal(first.httpStatus, 200)
  assert.equal(second.httpStatus, 200)
  assert.equal(events.length, 2)
  assert.equal((await stores.agent.list(V2_BOOKINGS_TABLE, 'qvm', 'bkg_', 'bkg`').next()).value, undefined)
})

test('a legacy v1 slot row does not block another site and is not rewritten', async () => {
  const { service, store, events } = harness()
  await store.create(BOOKINGS_TABLE, { partitionKey: PARTITION, rowKey: slotRowKey(slot.start), kind: 'slot', bookingId: 'legacy' })
  const result = await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  assert.equal(result.httpStatus, 200)
  assert.equal(events.length, 1)
  const legacy = await store.get(BOOKINGS_TABLE, PARTITION, slotRowKey(slot.start))
  assert.equal(legacy.kind, 'slot')
  assert.equal(legacy.bookingId, 'legacy')
})

test('missing mailbox configuration writes nothing', async () => {
  const { service, events, store } = harness()
  service.cfg.emails.arup = ''
  const result = await service.create({ body: body('agent'), origin: 'x', ip: '127.0.0.1' })
  assert.equal(result.body.status, 'unconfigured')
  assert.ok(result.body.missing.includes('BOOKING_ASSIGNEE_ARUP_EMAIL'))
  assert.equal(events.length, 0)
  assert.equal(store.rows(BOOKINGS_TABLE).length, 0)
})

test('turnstile hostnames are taken from the submitted site only', () => {
  assert.deepEqual(siteTurnstileHostnames(['https://quantumagent.com.au', 'https://www.quantumagent.com.au']), ['quantumagent.com.au', 'www.quantumagent.com.au'])
  assert.deepEqual(siteTurnstileHostnames(['https://quantumedupass.com']), ['quantumedupass.com'])
  assert.deepEqual(siteTurnstileHostnames([]), [])
})

test('a busy calendar does not hide a slot or reject the booking', async () => {
  assert.equal(viewIsFree('0', slot.start, slot.end), true)
  const { service, events } = harness()
  let graphCalls = 0
  service.calendar.getSchedule = async () => {
    graphCalls += 1
    return '1'
  }
  const open = await service.availability({ site: 'agent', market: 'australia', timeZone: 'Australia/Sydney', ip: '203.0.113.9' })
  assert.equal(open.httpStatus, 200)
  assert.ok(open.body.slots.some((item) => item.start === slot.start))
  const result = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(result.httpStatus, 200)
  assert.equal(events.length, 1)
  assert.equal(graphCalls, 0)
})

test('availability is rate limited before any calendar read', async () => {
  const { service } = harness()
  let graphCalls = 0
  service.calendar.getSchedule = async () => {
    graphCalls += 1
    return '0'
  }
  service.cfg.rateLimits = { availability: { limit: 1, windowMs: 10 * 60 * 1000 }, booking: { limit: 5, windowMs: 60 * 60 * 1000 } }
  const first = await service.availability({ site: 'agent', market: 'australia', timeZone: 'Australia/Sydney', ip: '203.0.113.5' })
  const second = await service.availability({ site: 'agent', market: 'australia', timeZone: 'Australia/Sydney', ip: '203.0.113.5' })
  assert.equal(first.httpStatus, 200)
  assert.equal(first.body.timeZone, 'Australia/Sydney')
  assert.deepEqual(first.body.openWeekdays, [0, 1, 2, 3, 4, 5, 6])
  assert.ok(first.body.slots.every((item) => item.time >= '09:00' && item.time < '19:00'))
  assert.equal(second.httpStatus, 429)
  assert.equal(graphCalls, 0)
})

test('booking creation checks Turnstile against that site hostname', async () => {
  const seen = []
  const { service } = harness()
  service.verifyTurnstile = async (args) => {
    seen.push(args.expectedHostnames)
    return { ok: true }
  }
  await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.deepEqual(seen, [['quantumagent.com.au']])
})

test('the same idempotency key with a different body is a conflict', async () => {
  const { service, events } = harness()
  const first = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  const second = await service.create({
    body: body('agent', { answers: { first: 'Grace' } }),
    ip: '127.0.0.1',
  })
  assert.equal(first.httpStatus, 200)
  assert.equal(second.httpStatus, 409)
  assert.equal(second.body.status, 'idempotency_conflict')
  assert.equal(events.length, 1)
})

test('the same site rejects an overlapping start and another site accepts it', async () => {
  const { service, store, events } = harness()
  const slice = timeSlices(slot.start, slot.end)[0]
  await store.create(V2_BOOKINGS_TABLE, {
    partitionKey: 'agent',
    rowKey: slotRowKey(slice),
    kind: 'site-slot',
    bookingId: 'other-booking',
    requestHash: 'other',
    fingerprint: 'other',
    expiresAt: '2026-11-09T00:00:00.000Z',
  })
  const blocked = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(blocked.body.status, 'slot_taken')
  const qvm = body('qvm', {
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    answers: { size: 'Sole agent', system: 'Spreadsheets, email and shared drives', bottleneck: 'after-hours enquiries', state: 'NSW', country: 'Australia', email: 'other@example.test' },
  })
  const allowed = await service.create({ body: qvm, ip: '127.0.0.2' })
  assert.equal(allowed.httpStatus, 200)
  assert.equal(events.length, 1)
})

test('an expired same-site hold can be replaced', async () => {
  const { service, events } = harness()
  const slice = timeSlices(slot.start, slot.end)[0]
  await service.store.create(V2_BOOKINGS_TABLE, {
    partitionKey: 'agent',
    rowKey: slotRowKey(slice),
    kind: 'site-slot',
    bookingId: 'stale',
    requestHash: 'stale',
    fingerprint: 'stale',
    expiresAt: '2020-01-01T00:00:00.000Z',
  })
  const result = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(result.httpStatus, 200)
  assert.equal(events.length, 1)
})

test('a definite meeting failure releases the visitor email claim', async () => {
  const { service, events } = harness()
  service.calendar.createEvent = async () => {
    throw new GraphError('ErrorInvalidRequest', { status: 400, uncertain: false })
  }
  const first = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(first.httpStatus, 503)
  service.calendar.createEvent = async (_mailbox, payload) => {
    const event = { id: 'evt-retry', bookingId: payload.bookingId, transactionId: payload.transactionId }
    events.push(event)
    return event
  }
  const second = await service.create({
    body: body('agent', { idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    ip: '127.0.0.1',
  })
  assert.equal(second.httpStatus, 200)
  assert.equal(events.length, 1)
})

test('create_unconfirmed is adopted by lookup and is not created again', async () => {
  const { service, events, sent } = harness()
  service.calendar.createEvent = async () => {
    throw new GraphError('timeout', { uncertain: true, retryable: true })
  }
  const first = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(first.body.meetingStatus, 'create_unconfirmed')
  assert.equal(first.body.attention, 'create_unconfirmed')
  assert.equal(events.length, 0)
  assert.equal(sent.length, 0)
  const second = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(second.body.meetingStatus, 'create_unconfirmed')
  assert.equal(events.length, 0)
  service.calendar.findByBooking = async (_mailbox, bookingId) => [{ id: 'evt-found', bookingId, isCancelled: false }]
  const adopted = await service.reconcile()
  assert.equal(adopted, undefined)
  const third = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(third.httpStatus, 200)
  assert.equal(third.body.meetingStatus, 'created')
  assert.equal(events.length, 0)
  assert.equal(sent.length, 1)
})

test('a v2 booking does not write the v1 partition, so v1 can reserve the same start', async () => {
  const { service, store, events } = harness()
  const booked = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(booked.httpStatus, 200)
  assert.equal(await store.get(BOOKINGS_TABLE, PARTITION, slotRowKey(slot.start)), null)
  const reserved = await reserveV1(store, slot.start)
  assert.equal(reserved.ok, true)
  assert.equal(events.length, 1)
})

test('configured open weekdays include Saturday when Saturday is open', () => {
  const saturdayOnly = { ...schedule, openWeekdays: [6], horizonDays: 8 }
  const slots = candidateSlots(saturdayOnly, new Date('2026-11-12T00:00:00.000Z'))
  assert.ok(slots.length > 0)
  assert.ok(slots.every((item) => item.weekday === 'Saturday'))
})

function reserveV1(store, slotStart, id = '11111111-1111-4111-8111-111111111111') {
  const ledger = new Ledger(store)
  return ledger.reserve({
    bookingId: id,
    slotStart,
    requestHash: `v1-${id}`,
    fingerprint: 'v1',
    emailHash: `email-${id}`,
    booking: { bookingId: id, attendeeName: 'V1', attendeeEmail: 'v1@example.test', updatedAt: '2020-01-01T00:00:00.000Z' },
  })
}

test('v1 can reserve a time that v2 already booked on another site', async () => {
  const { service, store, events } = harness()
  const booked = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(booked.httpStatus, 200)
  const reserved = await reserveV1(store, slot.start)
  assert.equal(reserved.ok, true)
  assert.equal(events.length, 1)
  const v1Slot = await store.get(BOOKINGS_TABLE, PARTITION, slotRowKey(slot.start))
  assert.equal(v1Slot.kind, 'slot')
})

test('a v1 hold does not stop v2 on another site', async () => {
  const { service, store, events } = harness()
  const reserved = await reserveV1(store, slot.start)
  assert.equal(reserved.ok, true)
  const booked = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(booked.httpStatus, 200)
  assert.equal(events.length, 1)
  const v1Booking = await store.get(BOOKINGS_TABLE, PARTITION, 'bkg_11111111-1111-4111-8111-111111111111')
  assert.equal(v1Booking.kind, 'booking')
})

test('overlapping durations conflict only inside one site', async () => {
  const wide = visitorSchedule({ ...visit, slotMinutes: 60 }, 'Australia/Sydney')
  const wideSlot = candidateSlots(wide, now)[0]
  const overlapStart = timeSlices(wideSlot.start, wideSlot.end).find((slice) => slice !== wideSlot.start)
  assert.ok(overlapStart)
  const { service, events } = harness()
  service.cfg.visit = { ...visit, slotMinutes: 60 }
  const held = await service.create({ body: body('agent', { slotStart: wideSlot.start }), ip: '127.0.0.1' })
  assert.equal(held.httpStatus, 200)
  service.cfg.visit = visit
  const sameSite = await service.create({
    body: body('agent', {
      idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slotStart: overlapStart,
      answers: { email: 'other@example.test' },
    }),
    ip: '127.0.0.2',
  })
  assert.equal(sameSite.body.status, 'slot_taken')
  const otherSite = await service.create({
    body: body('qvm', {
      idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slotStart: overlapStart,
      answers: { size: 'Sole agent', system: 'Spreadsheets, email and shared drives', bottleneck: 'after-hours enquiries', state: 'NSW', country: 'Australia', email: 'qvm@example.test' },
    }),
    ip: '127.0.0.3',
  })
  assert.equal(otherSite.httpStatus, 200)
  assert.equal(events.length, 2)
})

test('a crashed same-site hold expires and the reconciler leaves v1 rows alone', async () => {
  const { service, store, events } = harness()
  const slots = candidateSlots(schedule, now)
  const crashedStart = slots[slots.length - 1].start
  const crashedSlice = timeSlices(crashedStart, new Date(Date.parse(crashedStart) + 30 * 60000).toISOString())[0]
  await store.create(V2_BOOKINGS_TABLE, {
    partitionKey: 'agent',
    rowKey: slotRowKey(crashedSlice),
    kind: 'site-slot',
    bookingId: 'crashed',
    site: 'agent',
    requestHash: 'crashed',
    fingerprint: 'crashed',
    expiresAt: '2020-01-01T00:00:00.000Z',
  })
  const protectedStart = slots[1].start
  await store.create(BOOKINGS_TABLE, {
    partitionKey: PARTITION,
    rowKey: slotRowKey(protectedStart),
    kind: 'slot',
    bookingId: '44444444-4444-4444-8444-444444444444',
  })
  await service.reconcile()
  assert.equal(await store.get(V2_BOOKINGS_TABLE, 'agent', slotRowKey(crashedSlice)), null)
  const v1Slot = await store.get(BOOKINGS_TABLE, PARTITION, slotRowKey(protectedStart))
  assert.equal(v1Slot.kind, 'slot')
  assert.equal(v1Slot.bookingId, '44444444-4444-4444-8444-444444444444')
  const booked = await service.create({
    body: body('agent', { idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff', slotStart: crashedStart }),
    ip: '127.0.0.1',
  })
  assert.equal(booked.httpStatus, 200)
  assert.equal(events.length, 1)
})

test('v1 listing and cleanup do not treat v2 holds as bookings', async () => {
  const { service, store } = harness()
  const booked = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(booked.httpStatus, 200)
  const slots = candidateSlots(schedule, now)
  const other = slots.find((item) => Date.parse(item.start) >= Date.parse(slot.end))
  assert.ok(other)
  const reserved = await reserveV1(store, other.start, '55555555-5555-4555-8555-555555555555')
  assert.equal(reserved.ok, true)
  const ledger = new Ledger(store)
  const listed = []
  for await (const row of ledger.bookings()) listed.push(row)
  assert.equal(listed.some((row) => String(row.rowKey).startsWith('slot_')), false)
  assert.equal(listed.filter((row) => row.kind === 'booking').length, 1)

  const holdKey = slotRowKey(slot.start)
  assert.equal(await store.get(BOOKINGS_TABLE, PARTITION, holdKey), null)
  const v2Row = await store.get(V2_BOOKINGS_TABLE, 'agent', `bkg_${(await service.listForStaff({ site: 'agent' }))[0].bookingId}`)
  await ledger.releaseSlot({ slotStart: slot.start, bookingId: '55555555-5555-4555-8555-555555555555' })
  assert.equal((await store.get(V2_BOOKINGS_TABLE, 'agent', v2Row.rowKey)).bookingId, v2Row.bookingId)

  const reconciler = new Reconciler({
    ledger,
    calendar: { async findEventsByProperty() { return [] }, async deleteEvent() {}, async lookupEvent() { return { state: 'deleted' } } },
    service: {
      async release(booking) {
        await ledger.releaseSlot(booking)
        await ledger.releaseEmail(booking)
        return ledger.updateBooking(booking, { state: 'RELEASED', answers: '' })
      },
    },
    store,
    log: { info() {}, warn() {}, error() {} },
    now: () => now,
  })
  await reconciler.run()
  assert.equal(await store.get(BOOKINGS_TABLE, PARTITION, holdKey), null)
  assert.equal((await store.get(V2_BOOKINGS_TABLE, 'agent', v2Row.rowKey)).bookingId, v2Row.bookingId)
  const v1After = await ledger.getBooking('55555555-5555-4555-8555-555555555555')
  assert.equal(v1After.state, 'RELEASED')
  assert.equal(await store.get(BOOKINGS_TABLE, PARTITION, slotRowKey(other.start)), null)
})

test('site storage uses one SQL server and ignores database passwords', async () => {
  assert.equal(siteStorageSetting('agent'), 'BOOKING_SQL_SERVER')
  assert.equal(readSqlServer('booking-example.database.windows.net'), 'booking-example.database.windows.net')
  assert.equal(readSqlServer('Server=tcp:booking-example.database.windows.net;User ID=app;Password=secret;'), '')
  assert.deepEqual(SQL_DATABASES, { hva: 'HVA', agent: 'Agent', qvm: 'QVM', ledgerline: 'Ledgerline', edupass: 'EduPass' })

  const { service, events, store } = harness()
  service.stores = { agent: null }
  const missing = await service.create({ body: body('agent'), ip: '127.0.0.1' })
  assert.equal(missing.httpStatus, 503)
  assert.deepEqual(missing.body.missing, ['BOOKING_SQL_SERVER'])
  assert.equal(events.length, 0)
  assert.equal(store.rows(V2_BOOKINGS_TABLE).length, 0)

  const resources = getSharedResources({
    BOOKING_SQL_SERVER: 'booking-example.database.windows.net',
    BOOKING_TABLES_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=hvqvm;AccountKey=not-a-real-key;EndpointSuffix=core.windows.net',
  })
  assert.deepEqual(Object.values(resources.stores).map((item) => item.database), ['HVA', 'Agent', 'QVM', 'Ledgerline', 'EduPass'])
  assert.equal(resources.stores.agent.password, undefined)
  assert.equal(resources.stores.agent.connectionString, undefined)
  assert.equal(resources.stores.agent.connected, false)
  assert.ok(resources.stores.agent.credential instanceof DefaultAzureCredential)
  assert.equal(getSharedResources({ BOOKING_SQL_SERVER: 'Server=tcp:booking-example.database.windows.net;Password=secret;' }).stores.qvm, null)
})

test('a site database stores bookings, idempotency, and slot claims in that database only', async () => {
  const schema = await readFile(new URL('../../sql/001_site_database.sql', import.meta.url), 'utf8')
  assert.match(schema, /CREATE TABLE dbo\.bookings/)
  assert.match(schema, /CREATE TABLE dbo\.idempotency/)
  assert.match(schema, /CREATE TABLE dbo\.slot_claims/)
  assert.doesNotMatch(schema, /CREATE DATABASE/i)
  assert.doesNotMatch(schema, /CREATE USER/i)
  assert.doesNotMatch(schema, /PASSWORD\s*=/i)

  const batches = []
  const store = new SqlSiteStore({
    site: 'agent',
    server: 'booking-example.database.windows.net',
    database: 'Agent',
    credential: {},
    execute: async (batch) => {
      batches.push(batch)
      return { rows: [], rowsAffected: [1] }
    },
  })
  await store.createAll(V2_BOOKINGS_TABLE, [
    { partitionKey: 'agent', rowKey: 'req_abc', kind: 'request', bookingId: 'id', requestHash: 'abc', fingerprint: 'f' },
    { partitionKey: 'agent', rowKey: 'slot_2026', kind: 'site-slot', bookingId: 'id', requestHash: 'abc', fingerprint: 'f', slotStart: 's', slotEnd: 'e', expiresAt: 'x' },
    { partitionKey: 'agent', rowKey: 'bkg_id', kind: 'booking', bookingId: 'id', site: 'agent', state: 'HELD' },
  ])
  const sql = batches[0].statements.map((item) => item.sql).join('\n')
  assert.match(sql, /INSERT INTO idempotency/)
  assert.match(sql, /INSERT INTO slot_claims/)
  assert.match(sql, /INSERT INTO bookings/)
  assert.equal(sql.includes('HVA'), false)
  assert.equal(sql.includes('Password'), false)
  assert.equal(store.connected, false)
})

test('one unavailable site database does not hide the other sites or legacy QVM rows', async () => {
  const agent = new MemoryTableStore()
  await agent.create(V2_BOOKINGS_TABLE, {
    partitionKey: 'agent',
    rowKey: 'bkg_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'booking',
    bookingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    site: 'agent',
    slotDate: '2026-11-08',
    staffNotify: '{}',
    invitees: '[]',
    answersOriginal: '{}',
    source: 'site-form',
    reference: 'AGENT-1',
  })
  const down = { list() { throw Object.assign(new Error('down'), { code: 'sql_unavailable' }) } }
  const legacy = new MemoryTableStore()
  await legacy.create(BOOKINGS_TABLE, {
    partitionKey: PARTITION,
    rowKey: 'bkg_11111111-1111-4111-8111-111111111111',
    kind: 'booking',
    bookingId: '11111111-1111-4111-8111-111111111111',
    slotStart: '2026-11-08T00:00:00.000Z',
    state: 'CONFIRMED',
    reference: 'QVM-OLD',
  })
  const { service } = harness()
  service.stores = { agent, hva: down, qvm: down, ledgerline: new MemoryTableStore(), edupass: new MemoryTableStore() }
  service.legacyStore = legacy
  const report = await service.staffRead({})
  assert.equal(report.unavailable.includes('hva'), true)
  assert.equal(report.unavailable.includes('qvm'), true)
  assert.equal(report.bookings.some((row) => row.site === 'agent' && row.source === 'site-form'), true)
  assert.equal(report.bookings.some((row) => row.source === 'legacy-v1' && row.readOnly === true), true)
  assert.equal(report.legacyUnavailable, false)
  assert.equal(report.legacyReadError, '')
})

test('legacy QVM table reads use BOOKING_LEGACY_TABLES_ACCOUNT and report missing or failed reads', async () => {
  assert.equal(readLegacyTablesAccount('stqvmbookdemoprodaue'), 'stqvmbookdemoprodaue')
  assert.equal(readLegacyTablesAccount('DefaultEndpointsProtocol=https;AccountName=stqvm;AccountKey=secret'), '')
  assert.equal(readLegacyTablesAccount('https://stqvm.table.core.windows.net'), '')

  const resources = getSharedResources({
    BOOKING_SQL_SERVER: 'booking-example.database.windows.net',
    BOOKING_LEGACY_TABLES_ACCOUNT: 'stqvmbookdemoprodaue',
  })
  assert.equal(resources.legacyStore.accountName, 'stqvmbookdemoprodaue')
  assert.equal(resources.legacyStore.connectionString, '')
  assert.ok(resources.legacyStore.credential instanceof DefaultAzureCredential)
  assert.equal(getSharedResources({ BOOKING_SQL_SERVER: 'booking-example.database.windows.net' }).legacyStore, null)

  const { service } = harness()
  service.stores = { agent: new MemoryTableStore(), hva: new MemoryTableStore(), qvm: new MemoryTableStore(), ledgerline: new MemoryTableStore(), edupass: new MemoryTableStore() }
  const missing = await service.staffRead({})
  assert.equal(missing.legacyUnavailable, true)
  assert.deepEqual(missing.legacyMissing, ['BOOKING_LEGACY_TABLES_ACCOUNT'])
  assert.equal(missing.legacyReadError, 'missing_setting')
  assert.equal(missing.bookings.some((row) => row.source === 'legacy-v1'), false)

  service.legacyStore = {
    async *list() {
      yield* []
      throw Object.assign(new Error('denied'), { code: 'Forbidden' })
    },
  }
  const failed = await service.staffRead({})
  assert.equal(failed.legacyUnavailable, true)
  assert.equal(failed.legacyReadError, 'unavailable')
  assert.deepEqual(failed.legacyMissing, [])
})

test('the function app uses managed identity and local development uses DefaultAzureCredential', () => {
  const local = tableCredential({})
  assert.ok(local instanceof DefaultAzureCredential)
  const azure = tableCredential({ WEBSITE_INSTANCE_ID: 'instance', AZURE_CLIENT_ID: '11111111-1111-4111-8111-111111111111' })
  assert.ok(azure instanceof ManagedIdentityCredential)
  const systemAssigned = tableCredential({ WEBSITE_INSTANCE_ID: 'instance' })
  assert.ok(systemAssigned instanceof ManagedIdentityCredential)
})

test('expired mail claims are not sent again', () => {
  assert.equal(mailAction({ status: MAIL.ACCEPTED }, Date.now()), 'skip')
  assert.equal(mailAction({ status: MAIL.UNCONFIRMED }, Date.now()), 'skip')
  assert.equal(mailAction({ status: MAIL.CLAIMED, claimedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }, Date.now()), 'expire')
  assert.equal(mailAction({ status: MAIL.FAILED, attempts: 1 }, Date.now()), 'send')
})

test('qvm state accepts non-AU regions as text while AU stays on the territory list', () => {
  const india = validateV2Booking({
    site: 'qvm',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slotStart: slot.start,
    timeZone: 'Asia/Kolkata',
    turnstileToken: 'token',
    answers: {
      size: 'Sole agent',
      system: 'Spreadsheets, email and shared drives',
      bottleneck: 'after-hours enquiries',
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      org: 'Practice Co',
      state: 'Maharashtra',
      country: 'IN',
      consent: true,
    },
  })
  assert.equal(india.ok, true)
  assert.equal(india.value.answers.countryCode, 'IN')
  assert.equal(india.value.answers.state, 'Maharashtra')
  const badAu = validateV2Booking({
    site: 'qvm',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slotStart: slot.start,
    timeZone: 'Australia/Sydney',
    turnstileToken: 'token',
    answers: {
      size: 'Sole agent',
      system: 'Spreadsheets, email and shared drives',
      bottleneck: 'after-hours enquiries',
      first: 'Ada',
      last: 'Lovelace',
      email: 'ada@example.test',
      org: 'Practice Co',
      state: 'Maharashtra',
      country: 'AU',
      consent: true,
    },
  })
  assert.equal(badAu.ok, false)
  assert.ok(badAu.errors.includes('state'))
})

test('availability loads slot holds once then filters candidates in memory', async () => {
  const { service, store } = harness()
  const stages = []
  service.log = {
    info(_event, fields = {}) { if (fields.stage) stages.push(fields) },
    warn() {},
    error() {},
  }
  let listCalls = 0
  let getCalls = 0
  const originalList = store.list.bind(store)
  const originalGet = store.get.bind(store)
  store.list = async function* (...args) {
    listCalls += 1
    yield* originalList(...args)
  }
  store.get = async (...args) => {
    if (String(args[2] || '').startsWith('slot_')) getCalls += 1
    return originalGet(...args)
  }
  const held = candidateSlots(schedule, now)[0]
  await store.create(V2_BOOKINGS_TABLE, {
    partitionKey: 'agent',
    rowKey: slotRowKey(held.start),
    kind: 'site-slot',
    bookingId: 'held',
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  })
  const open = await service.availability({ site: 'agent', market: 'australia', timeZone: 'Australia/Sydney', ip: '203.0.113.40' })
  assert.equal(open.httpStatus, 200)
  assert.equal(listCalls, 1)
  assert.equal(getCalls, 0)
  assert.equal(open.body.slots.some((item) => item.start === held.start), false)
  assert.ok(stages.some((item) => item.stage === 'slot_holds'))
  assert.ok(stages.some((item) => item.stage === 'complete'))
})

test('availability returns a clear 503 when slot-hold SQL is unavailable', async () => {
  const { service } = harness()
  service.store.list = async function* () {
    yield* []
    throw Object.assign(new Error('down'), { code: 'sql_unavailable' })
  }
  const result = await service.availability({ site: 'agent', market: 'australia', timeZone: 'Australia/Sydney', ip: '203.0.113.41' })
  assert.equal(result.httpStatus, 503)
  assert.equal(result.body.status, 'unconfigured')
  assert.ok(!JSON.stringify(result.body).includes('down'))
})
