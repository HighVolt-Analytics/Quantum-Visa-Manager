import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { verifyTurnstile } from '../../src/lib/turnstile.js'

function fakeFetch(response, calls = []) {
  return async (url, init) => {
    calls.push({ url, body: Object.fromEntries(init.body) })
    if (response instanceof Error) throw response
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status ?? 200 })
  }
}

const base = {
  token: 'tok',
  remoteIp: '203.0.113.7',
  idempotencyKey: '7f1d3c1e-0c1e-4a2b-9f3d-2b6a5c4d3e2f',
  secret: 'test-secret',
  expectedHostnames: ['quantumvisamanager.com'],
  expectedAction: 'book_demo',
}

describe('Cloudflare Turnstile server-side verification', () => {
  it('accepts a successful token for the right hostname and action', async () => {
    const calls = []
    const result = await verifyTurnstile({
      ...base,
      fetchImpl: fakeFetch({ body: { success: true, hostname: 'quantumvisamanager.com', action: 'book_demo' } }, calls),
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    assert.deepEqual(calls[0].body, {
      secret: 'test-secret',
      response: 'tok',
      idempotency_key: base.idempotencyKey,
      remoteip: '203.0.113.7',
    })
  })

  it('rejects failed, wrong-hostname and wrong-action tokens', async () => {
    const cases = [
      [{ success: false, 'error-codes': ['invalid-input-response'] }, 'rejected'],
      [{ success: true, hostname: 'evil.example', action: 'book_demo' }, 'hostname'],
      [{ success: true, hostname: 'quantumvisamanager.com', action: 'login' }, 'action'],
    ]
    for (const [body, reason] of cases) {
      const result = await verifyTurnstile({ ...base, fetchImpl: fakeFetch({ body }) })
      assert.deepEqual(result, { ok: false, reason })
    }
  })

  it('fails closed when Cloudflare is unreachable, errors or the secret is missing', async () => {
    assert.equal((await verifyTurnstile({ ...base, fetchImpl: fakeFetch(new Error('down')) })).reason, 'unavailable')
    assert.equal((await verifyTurnstile({ ...base, fetchImpl: fakeFetch({ status: 500 }) })).reason, 'unavailable')
    assert.equal((await verifyTurnstile({ ...base, secret: '', fetchImpl: fakeFetch({ body: { success: true } }) })).reason, 'unavailable')
  })

  it('rejects a missing token without calling Cloudflare', async () => {
    const calls = []
    const result = await verifyTurnstile({ ...base, token: '', fetchImpl: fakeFetch({ body: {} }, calls) })
    assert.deepEqual(result, { ok: false, reason: 'missing' })
    assert.equal(calls.length, 0)
  })
})
