import assert from 'node:assert/strict'
import test from 'node:test'
import { GraphError } from '../../src/lib/graph.js'
import { makeV2MeetingLookupHandler } from '../../src/lib/v2/handlers.js'

const BOOKING_ID = '4890f337-6306-48b9-930d-79991d492661'
const TOKEN = 'staff-token-for-tests-only'

function request({ method = 'GET', bookingId = BOOKING_ID, authorization = `Bearer ${TOKEN}` } = {}) {
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization)
  return {
    method,
    params: { bookingId },
    headers,
  }
}

function env(extra = {}) {
  return {
    BOOKINGS_PORTAL_API_TOKEN: TOKEN,
    ...extra,
  }
}

test('meeting lookup requires staff bearer auth', async () => {
  const calls = { find: 0, create: 0, mail: 0 }
  const handler = makeV2MeetingLookupHandler(
    () => ({
      v2Calendar: {
        findByBooking: async () => {
          calls.find += 1
          return []
        },
        createEvent: async () => {
          calls.create += 1
          return { id: 'evt' }
        },
        sendMail: async () => {
          calls.mail += 1
        },
      },
    }),
    () => env(),
  )
  const sink = { log() {}, warn() {}, error() {} }
  const denied = await handler(request({ authorization: '' }), sink)
  assert.equal(denied.status, 401)
  assert.equal(denied.jsonBody.status, 'unauthorized')
  assert.equal(calls.find, 0)
  assert.equal(calls.create, 0)
  assert.equal(calls.mail, 0)

  const wrong = await handler(request({ authorization: 'Bearer wrong-token-value!!!!' }), sink)
  assert.equal(wrong.status, 401)
  assert.equal(calls.find, 0)
})

test('meeting lookup runs findByBooking only and never creates events or sends mail', async () => {
  const calls = { find: 0, create: 0, mail: 0, methods: [] }
  const handler = makeV2MeetingLookupHandler(
    () => ({
      v2Calendar: {
        findByBooking: async (mailbox, bookingId) => {
          calls.find += 1
          calls.methods.push('findByBooking')
          assert.equal(mailbox, 'support@highvolt.tech')
          assert.equal(bookingId, BOOKING_ID)
          return [{ id: 'evt-1', isCancelled: false }]
        },
        createEvent: async () => {
          calls.create += 1
          calls.methods.push('createEvent')
          return { id: 'evt' }
        },
        sendMail: async () => {
          calls.mail += 1
          calls.methods.push('sendMail')
        },
      },
      store: {
        get: async () => {
          throw new Error('sql get must not run')
        },
        create: async () => {
          throw new Error('sql create must not run')
        },
        createAll: async () => {
          throw new Error('sql createAll must not run')
        },
        update: async () => {
          throw new Error('sql update must not run')
        },
        delete: async () => {
          throw new Error('sql delete must not run')
        },
      },
    }),
    () => env(),
  )
  const logs = []
  const sink = {
    log: (line) => logs.push(line),
    warn: (line) => logs.push(line),
    error: (line) => logs.push(line),
  }
  const res = await handler(request(), sink)
  assert.equal(res.status, 200)
  assert.equal(res.jsonBody.status, 'ok')
  assert.equal(res.jsonBody.found, true)
  assert.equal(res.jsonBody.httpStatus, 200)
  assert.equal(res.jsonBody.graphCode, '')
  assert.equal(calls.find, 1)
  assert.equal(calls.create, 0)
  assert.equal(calls.mail, 0)
  assert.deepEqual(calls.methods, ['findByBooking'])
  assert.ok(!JSON.stringify(res.jsonBody).includes('evt-1'))
  assert.ok(logs.some((line) => String(line).includes('stage=find_by_booking') && String(line).includes(BOOKING_ID)))
})

test('meeting lookup returns Graph status and code without event contents when Graph fails', async () => {
  const calls = { create: 0, mail: 0 }
  const handler = makeV2MeetingLookupHandler(
    () => ({
      v2Calendar: {
        findByBooking: async () => {
          throw new GraphError('ErrorAccessDenied', { status: 403 })
        },
        createEvent: async () => {
          calls.create += 1
        },
        sendMail: async () => {
          calls.mail += 1
        },
      },
    }),
    () => env(),
  )
  const res = await handler(request(), { log() {}, warn() {}, error() {} })
  assert.equal(res.status, 200)
  assert.equal(res.jsonBody.status, 'graph_error')
  assert.equal(res.jsonBody.found, false)
  assert.equal(res.jsonBody.httpStatus, 403)
  assert.equal(res.jsonBody.graphCode, 'ErrorAccessDenied')
  assert.equal(calls.create, 0)
  assert.equal(calls.mail, 0)
})

test('meeting lookup stays unconfigured without a Graph client and does not write', async () => {
  let wrote = false
  const handler = makeV2MeetingLookupHandler(
    () => ({
      getToken: null,
      store: {
        createAll: async () => {
          wrote = true
        },
      },
    }),
    () => env(),
  )
  const res = await handler(request(), { log() {}, warn() {}, error() {} })
  assert.equal(res.status, 503)
  assert.equal(res.jsonBody.status, 'unconfigured')
  assert.deepEqual(res.jsonBody.missing, ['AZURE_CLIENT_ID'])
  assert.equal(wrote, false)
})
