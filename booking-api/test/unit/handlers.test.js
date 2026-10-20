import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeAvailabilityHandler } from '../../src/functions/availability.js'
import { makeBookingsHandler } from '../../src/functions/bookings.js'
import { makeReconcileHandler } from '../../src/functions/reconcile.js'
import { readConfig } from '../../src/lib/config.js'
import { captureLog } from '../helpers/fixtures.js'

function request({ method = 'POST', headers = {}, body = '' } = {}) {
  const h = new Headers(headers)
  return { method, headers: h, text: async () => body }
}

function runtime(env, calls = []) {
  return () => ({
    cfg: readConfig(env),
    missing: [],
    storageConfigured: true,
    service: () => {
      calls.push('service')
      return {
        createBooking: async () => ({ httpStatus: 200, body: { status: 'confirmed' } }),
        availability: async () => ({ httpStatus: 200, body: { status: 'ok', slots: [] } }),
      }
    },
    reconciler: () => {
      calls.push('reconciler')
      return { run: async () => ({}) }
    },
  })
}

const enabled = { BOOKING_ENABLED: 'true' }
const good = { origin: 'https://quantumvisamanager.com', 'content-type': 'application/json' }

describe('BOOKING_ENABLED gate', () => {
  it('returns 503 and touches nothing while booking is disabled', async () => {
    for (const env of [{}, { BOOKING_ENABLED: 'false' }, { BOOKING_ENABLED: 'TRUE' }]) {
      const calls = []
      const log = captureLog()
      const b = await makeBookingsHandler(runtime(env, calls))(request({ headers: good, body: '{}' }), log.sink)
      const a = await makeAvailabilityHandler(runtime(env, calls))(request({ method: 'GET' }), log.sink)
      assert.equal(b.status, 503)
      assert.equal(a.status, 503)
      assert.equal(b.jsonBody.status, 'unavailable')
      assert.deepEqual(calls, [])
    }
  })

  it('stays closed when required secrets are missing', async () => {
    const log = captureLog()
    const rt = () => ({ ...runtime(enabled)(), missing: ['TURNSTILE_SECRET'] })
    const res = await makeBookingsHandler(rt)(request({ headers: good, body: '{}' }), log.sink)
    assert.equal(res.status, 503)
    assert.match(log.text(), /qvm.event=config_missing/)
    assert.ok(!log.text().includes('TURNSTILE_SECRET'))
  })
})

describe('booking request guards', () => {
  const handler = makeBookingsHandler(runtime(enabled))
  const log = captureLog()

  it('requires an allowed Origin', async () => {
    assert.equal((await handler(request({ headers: { 'content-type': 'application/json' }, body: '{}' }), log.sink)).status, 403)
    assert.equal((await handler(request({ headers: { ...good, origin: 'https://evil.example' }, body: '{}' }), log.sink)).status, 403)
  })

  it('requires JSON, a bounded body and valid syntax', async () => {
    assert.equal((await handler(request({ headers: { ...good, 'content-type': 'text/plain' }, body: '{}' }), log.sink)).status, 415)
    assert.equal((await handler(request({ headers: good, body: 'x'.repeat(9000) }), log.sink)).status, 413)
    assert.equal((await handler(request({ headers: good, body: '{bad' }), log.sink)).status, 400)
  })

  it('passes a well-formed request to the booking service with no-store headers', async () => {
    const res = await handler(request({ headers: good, body: '{}' }), log.sink)
    assert.equal(res.status, 200)
    assert.equal(res.headers['Cache-Control'], 'no-store')
  })

  it('hides internal errors behind a generic message', async () => {
    const failing = () => ({ ...runtime(enabled)(), service: () => ({ createBooking: async () => { throw new Error('secret detail') } }) })
    const l = captureLog()
    const res = await makeBookingsHandler(failing)(request({ headers: good, body: '{}' }), l.sink)
    assert.equal(res.status, 500)
    assert.ok(!JSON.stringify(res.jsonBody).includes('secret detail'))
    assert.ok(!l.text().includes('secret detail'))
  })
})

describe('reconcile timer', () => {
  it('runs the reconciler when storage is configured', async () => {
    const calls = []
    await makeReconcileHandler(runtime({}, calls))({}, captureLog().sink)
    assert.deepEqual(calls, ['reconciler'])
  })
})
