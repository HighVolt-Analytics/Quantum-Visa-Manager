import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  buildBookingPayload,
  buildDateOptions,
  createBookingApi,
  formatSydneyTime,
  idempotencyKeyFor,
  interpretAvailability,
  interpretBooking,
  isBookingConfigured,
  localEquivalent,
  sydneyZoneLabel,
} from '../src/lib/bookingClient.js'

const slot = (start, date, time) => ({ start, end: new Date(Date.parse(start) + 1800000).toISOString(), date, time })

describe('date picker', () => {
  const now = new Date('2026-10-25T20:00:00Z') // Monday 26 Oct, 07:00 Sydney
  const days = buildDateOptions(now, [slot('2026-10-26T23:00:00.000Z', '2026-10-27', '10:00'), slot('2026-10-26T23:30:00.000Z', '2026-10-27', '10:30')])

  it('covers today through the 14th Sydney day', () => {
    assert.equal(days.length, 15)
    assert.equal(days[0].date, '2026-10-26')
    assert.equal(days.at(-1).date, '2026-11-09')
  })

  it('closes Saturdays', () => {
    const saturdays = days.filter((d) => d.closed).map((d) => d.date)
    assert.deepEqual(saturdays, ['2026-10-31', '2026-11-07'])
    assert.ok(days.filter((d) => d.closed).every((d) => !d.available))
  })

  it('only marks days with API slots as available', () => {
    assert.deepEqual(days.filter((d) => d.available).map((d) => d.date), ['2026-10-27'])
    assert.equal(days.find((d) => d.date === '2026-10-27').slots.length, 2)
    assert.equal(days.find((d) => d.date === '2026-10-27').label, 'Tue 27 Oct')
  })

  it('ignores any Saturday slot the API might return', () => {
    const d = buildDateOptions(now, [slot('2026-10-30T23:00:00.000Z', '2026-10-31', '10:00')])
    assert.equal(d.find((x) => x.date === '2026-10-31').available, false)
  })

  it('uses the Sydney date, not the visitor date, near midnight UTC', () => {
    const late = buildDateOptions(new Date('2026-10-25T14:00:00Z'), []) // 01:00 Monday in Sydney, Sunday in UTC
    assert.equal(late[0].date, '2026-10-26')
  })
})

describe('Sydney time display', () => {
  it('formats slot times in Sydney time', () => {
    assert.equal(formatSydneyTime('2026-10-26T23:00:00.000Z'), '10:00 am')
    assert.equal(formatSydneyTime('2026-10-27T02:30:00.000Z'), '1:30 pm')
  })

  it('labels AEST and AEDT either side of the October change', () => {
    assert.equal(sydneyZoneLabel(new Date('2026-10-02T00:00:00Z')), 'AEST (UTC+10)')
    assert.equal(sydneyZoneLabel(new Date('2026-10-03T23:00:00Z')), 'AEDT (UTC+11)')
    assert.equal(sydneyZoneLabel(new Date('2027-04-04T00:00:00Z')), 'AEST (UTC+10)')
  })

  it('shows a local equivalent only for visitors outside Sydney time', () => {
    assert.match(localEquivalent('2026-10-26T23:00:00.000Z', 'Asia/Kolkata'), /4:30/)
    assert.equal(localEquivalent('2026-10-26T23:00:00.000Z', 'Australia/Sydney'), null)
    assert.equal(localEquivalent('2026-10-26T23:00:00.000Z', 'Australia/Melbourne'), null)
  })
})

describe('booking request', () => {
  it('maps the questionnaire to the API contract', () => {
    const fd = new FormData()
    for (const [k, v] of Object.entries({ size: '2–5', system: 'A mix of several tools', systemName: '', bottleneck: 'chasing missing documents', first: ' Test ', last: 'Person', email: 'test@example.test', phone: '', org: 'Example Pty Ltd', state: 'NSW', consent: 'yes' })) fd.set(k, v)
    const p = buildBookingPayload({ form: fd, slotStart: '2026-10-26T23:00:00.000Z', turnstileToken: 'tok', idempotencyKey: 'k' })
    assert.deepEqual(p, {
      idempotencyKey: 'k',
      slotStart: '2026-10-26T23:00:00.000Z',
      turnstileToken: 'tok',
      answers: { size: '2–5', system: 'A mix of several tools', systemName: '', bottleneck: 'chasing missing documents', first: 'Test', last: 'Person', email: 'test@example.test', phone: '', org: 'Example Pty Ltd', state: 'NSW', consent: true },
    })
  })

  it('reuses an idempotency key only for an identical retry', () => {
    let n = 0
    const next = () => `key-${++n}`
    const a = idempotencyKeyFor(null, { slotStart: 's1', email: 'A@Example.test' }, next)
    assert.equal(idempotencyKeyFor(a, { slotStart: 's1', email: 'a@example.test ' }, next).key, 'key-1')
    assert.equal(idempotencyKeyFor(a, { slotStart: 's2', email: 'a@example.test' }, next).key, 'key-2')
  })
})

describe('API responses', () => {
  const okSlot = { start: '2026-10-26T23:00:00.000Z', end: '2026-10-26T23:30:00.000Z' }

  it('treats only a 200 confirmed response with a slot and reference as a booking', () => {
    assert.equal(interpretBooking(200, { status: 'confirmed', reference: 'QVM-ABC234', slot: okSlot }).kind, 'confirmed')
    assert.equal(interpretBooking(200, { status: 'confirmed' }).kind, 'error')
    assert.equal(interpretBooking(200, { status: 'ok' }).kind, 'error')
    assert.equal(interpretBooking(500, null).kind, 'error')
    assert.equal(interpretBooking(202, { status: 'pending', reference: 'QVM-ABC234' }).kind, 'pending')
  })

  it('maps conflicts, expiry and failures to recoverable actions', () => {
    const cases = [
      [409, 'slot_taken', 'slot_gone'],
      [422, 'slot_unavailable', 'slot_gone'],
      [409, 'already_booked', 'already_booked'],
      [409, 'idempotency_conflict', 'new_attempt'],
      [403, 'verification_failed', 'verification'],
      [429, 'rate_limited', 'retry_later'],
      [503, 'unavailable', 'unavailable'],
      [503, 'failed', 'error'],
      [503, 'verification_unavailable', 'error'],
    ]
    for (const [code, status, kind] of cases) assert.equal(interpretBooking(code, { status, message: 'm' }).kind, kind, status)
    assert.deepEqual(interpretBooking(400, { status: 'invalid', fields: ['email'] }).fields, ['email'])
  })

  it('maps availability responses', () => {
    assert.deepEqual(interpretAvailability(200, { status: 'ok', slots: [] }), { kind: 'ok', slots: [] })
    assert.equal(interpretAvailability(503, { status: 'unavailable', message: 'off' }).kind, 'unavailable')
    assert.equal(interpretAvailability(429, { status: 'rate_limited' }).kind, 'retry_later')
    assert.equal(interpretAvailability(500, null).kind, 'error')
  })

  it('calls the exact backend paths without credentials and reports network failures', async () => {
    const calls = []
    const api = createBookingApi({
      baseUrl: 'https://func.example.test/',
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        if (url.endsWith('/api/bookings')) throw new TypeError('Failed to fetch')
        return new Response(JSON.stringify({ status: 'ok', slots: [] }), { status: 200 })
      },
    })
    assert.deepEqual(await api.availability(), { httpStatus: 200, body: { status: 'ok', slots: [] } })
    assert.deepEqual(await api.book({ a: 1 }), { network: true })
    assert.equal(calls[0].url, 'https://func.example.test/api/availability')
    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[1].url, 'https://func.example.test/api/bookings')
    assert.equal(calls[1].init.method, 'POST')
    assert.equal(calls[1].init.headers['Content-Type'], 'application/json')
    assert.equal(calls[1].init.credentials, 'omit')
  })

  it('stays switched off without a site key or a secure API base', () => {
    assert.equal(isBookingConfigured({ siteKey: '', apiBase: 'https://x.test' }), false)
    assert.equal(isBookingConfigured({ siteKey: 'k', apiBase: 'http://x.test' }), false)
    assert.equal(isBookingConfigured({ siteKey: 'k', apiBase: 'https://x.test' }), true)
    assert.equal(isBookingConfigured({ siteKey: 'k', apiBase: 'http://127.0.0.1:7071' }), true)
  })
})

describe('Book a Demo page markup', async () => {
  const html = await readFile(new URL('../src/content/BookDemo.html', import.meta.url), 'utf8')

  it('keeps the four original questionnaire sections', () => {
    for (const legend of ['Practice size', 'Current system', 'Biggest bottleneck', 'Contact details']) assert.ok(html.includes(legend), legend)
    for (const name of ['name="size"', 'name="system"', 'name="systemName"', 'name="bottleneck"', 'name="first"', 'name="last"', 'name="email"', 'name="phone"', 'name="org"', 'name="state"', 'name="consent"']) assert.ok(html.includes(name), name)
  })

  it('hides the time step until the questions are valid and masks the panel from Clarity', () => {
    assert.match(html, /<fieldset class="fieldset" data-booking-step hidden>/)
    assert.match(html, /class="panel reveal" data-clarity-mask="True"/)
    assert.match(html, /href="\/privacy#book-a-demo"/)
  })
})
