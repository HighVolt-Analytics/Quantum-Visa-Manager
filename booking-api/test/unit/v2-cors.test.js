import assert from 'node:assert/strict'
import test from 'node:test'
import { makeV2AvailabilityHandler } from '../../src/lib/v2/handlers.js'

function request({ method = 'GET', origin = '', site = 'qvm', country = 'AU', timeZone = 'Australia/Sydney' } = {}) {
  const url = `https://func.example.test/api/v2/availability?site=${encodeURIComponent(site)}&country=${encodeURIComponent(country)}&timeZone=${encodeURIComponent(timeZone)}`
  return {
    method,
    url,
    headers: new Headers(origin ? { origin } : {}),
  }
}

function resources() {
  return {
    store: null,
    stores: { qvm: {} },
    legacyStore: null,
    getToken: null,
  }
}

test('allowed QVM origins receive CORS on availability errors without leaking internals', async () => {
  const handler = makeV2AvailabilityHandler(resources, () => ({
    BOOKING_V2_ENABLED_QVM: 'true',
    BOOKING_ORIGINS_QVM: 'https://quantumvisamanager.com,https://www.quantumvisamanager.com',
    BOOKING_SLOT_MINUTES: '30',
    BOOKING_NOTICE_MINUTES: '0',
    BOOKING_HORIZON_DAYS: '2',
  }))
  const sink = { log() {}, warn() {}, error() {} }
  const denied = await handler(request({ origin: 'https://evil.example' }), sink)
  assert.equal(denied.status, 403)
  assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined)

  const invalid = await handler(request({ origin: 'https://quantumvisamanager.com', country: 'not-a-country' }), sink)
  assert.equal(invalid.status, 400)
  assert.equal(invalid.headers['Access-Control-Allow-Origin'], 'https://quantumvisamanager.com')
  assert.equal(invalid.headers.Vary, 'Origin')
  assert.ok(!JSON.stringify(invalid.jsonBody).includes('stack'))

  const preflight = await handler(request({ method: 'OPTIONS', origin: 'https://www.quantumvisamanager.com' }), sink)
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://www.quantumvisamanager.com')
  assert.ok(!Object.values(preflight.headers).includes('*'))
})
