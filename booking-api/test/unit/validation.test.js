import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateBookingRequest } from '../../src/lib/validation.js'
import { bookingBody } from '../helpers/fixtures.js'

describe('booking request validation', () => {
  it('accepts the existing questionnaire values and drops unknown fields', () => {
    const body = bookingBody()
    body.answers.extra = 'ignored'
    body.unexpected = true
    const result = validateBookingRequest(body)
    assert.equal(result.ok, true)
    assert.equal(result.value.answers.extra, undefined)
    assert.equal(result.value.unexpected, undefined)
  })

  it('requires consent to be exactly true', () => {
    for (const consent of [false, 'true', 'yes', undefined]) {
      const result = validateBookingRequest(bookingBody({ answers: { consent } }))
      assert.deepEqual(result.errors, ['consent'])
    }
  })

  it('rejects values outside the form options', () => {
    const result = validateBookingRequest(bookingBody({ answers: { size: '100+', state: 'Mars', bottleneck: 'x', system: 'y' } }))
    assert.deepEqual(result.errors.sort(), ['bottleneck', 'size', 'state', 'system'])
  })

  it('rejects bad email, phone, idempotency key and oversized or control-character text', () => {
    const body = bookingBody({ answers: { email: 'not-an-email', phone: 'call me', first: 'x'.repeat(81), org: 'bad\u0007name' } })
    body.idempotencyKey = 'not-a-uuid'
    const result = validateBookingRequest(body)
    assert.deepEqual(result.errors.sort(), ['email', 'first', 'idempotencyKey', 'org', 'phone'])
  })

  it('treats optional fields as optional', () => {
    const result = validateBookingRequest(bookingBody({ answers: { phone: '', systemName: undefined } }))
    assert.equal(result.ok, true)
  })

  it('rejects non-object bodies', () => {
    for (const body of [null, [], 'text', 42]) assert.equal(validateBookingRequest(body).ok, false)
  })
})
