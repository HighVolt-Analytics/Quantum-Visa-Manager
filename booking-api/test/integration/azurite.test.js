import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { TableClient } from '@azure/data-tables'
import { BOOKINGS_TABLE, RATELIMITS_TABLE } from '../../src/lib/config.js'
import { Ledger } from '../../src/lib/ledger.js'
import { consumeRateLimit } from '../../src/lib/rateLimit.js'
import { AzureTableStore, PreconditionError } from '../../src/lib/tableStore.js'

// Azurite's well-known local development connection string (no real credential).
const CONNECTION = 'UseDevelopmentStorage=true'
const PORT = 10002
const require = createRequire(import.meta.url)

function portOpen() {
  return new Promise((resolve) => {
    const s = createConnection({ port: PORT, host: '127.0.0.1' })
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })
}

let azurite

before(async () => {
  if (await portOpen()) throw new Error(`Port ${PORT} is already in use; stop the other Azurite instance first`)
  const pkgPath = require.resolve('azurite/package.json')
  const bin = join(pkgPath, '..', require(pkgPath).bin['azurite-table'])
  azurite = spawn(process.execPath, [bin, '--silent', '--inMemoryPersistence', '--skipApiVersionCheck', '--tableHost', '127.0.0.1', '--tablePort', String(PORT)], { stdio: 'ignore' })
  for (let i = 0; i < 100 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 100))
  if (!(await portOpen())) throw new Error('Azurite table service did not start')
  for (const table of [BOOKINGS_TABLE, RATELIMITS_TABLE]) {
    await TableClient.fromConnectionString(CONNECTION, table, { allowInsecureConnection: true }).createTable()
  }
})

after(() => {
  azurite?.kill()
})

const store = () => new AzureTableStore({ connectionString: CONNECTION })

function reservation(slotStart, overrides = {}) {
  const bookingId = randomUUID()
  return {
    bookingId,
    slotStart,
    requestHash: randomUUID().replaceAll('-', ''),
    fingerprint: 'f',
    emailHash: randomUUID().replaceAll('-', ''),
    booking: { bookingId },
    ...overrides,
  }
}

describe('Azure Table Storage (Azurite) reservation semantics', () => {
  it('grants a contested slot to exactly one of 25 concurrent reservations across clients', async () => {
    const slot = '2026-11-03T23:00:00.000Z'
    // Separate store instances model separate Function instances.
    const results = await Promise.all(Array.from({ length: 25 }, () => new Ledger(store()).reserve(reservation(slot))))
    assert.equal(results.filter((r) => r.ok).length, 1)
    assert.ok(results.filter((r) => !r.ok).every((r) => r.reason === 'slot_taken'))
  })

  it('writes nothing when any entity in the batch conflicts', async () => {
    const ledger = new Ledger(store())
    const first = reservation('2026-11-04T23:00:00.000Z')
    assert.equal((await ledger.reserve(first)).ok, true)
    const second = reservation('2026-11-04T23:30:00.000Z', { emailHash: first.emailHash })
    const res = await ledger.reserve(second)
    assert.deepEqual({ ok: res.ok, reason: res.reason }, { ok: false, reason: 'email_has_booking' })
    assert.equal(await ledger.getBooking(second.bookingId), null)
    assert.deepEqual([...(await ledger.reservedSlotStarts('2026-11-04T23:30:00.000Z', '2026-11-05T00:00:00.000Z'))], [])
  })

  it('detects a duplicate request key', async () => {
    const ledger = new Ledger(store())
    const r = reservation('2026-11-05T23:00:00.000Z')
    await ledger.reserve(r)
    const again = await ledger.reserve({ ...r, bookingId: randomUUID(), slotStart: '2026-11-05T23:30:00.000Z', emailHash: 'other' })
    assert.equal(again.reason, 'duplicate_request')
  })

  it('rejects a stale ETag on update', async () => {
    const ledger = new Ledger(store())
    const r = reservation('2026-11-06T23:00:00.000Z')
    await ledger.reserve(r)
    const b = await ledger.getBooking(r.bookingId)
    await ledger.updateBooking(b, { state: 'CREATING' })
    await assert.rejects(ledger.updateBooking(b, { state: 'RELEASED' }), PreconditionError)
  })

  it('counts rate-limit windows correctly under concurrency', async () => {
    const s = store()
    const now = new Date('2026-10-26T00:00:00Z')
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(s, { scope: 'booking', subject: 'abc', limit: 5, windowMs: 3600000, now })))
    assert.ok(results.filter((r) => r.allowed).length <= 5)
  })
})
