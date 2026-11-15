import assert from 'node:assert/strict'
import test from 'node:test'
import { SqlSiteStore } from '../../src/lib/v2/sqlStore.js'
import { V2_BOOKINGS_TABLE } from '../../src/lib/v2/config.js'

test('booking rows with email_hash map as bookings, not email claims', () => {
  const store = new SqlSiteStore({ site: 'qvm', server: 'example', database: 'QVM', credential: {} })
  const entity = store.toEntity(V2_BOOKINGS_TABLE, {
    booking_id: 'ecaebd37-a25d-4fe0-9726-03d34268ab47',
    site: 'qvm',
    source: 'site-form',
    market: 'au',
    reference: 'QVM-1',
    slot_start: '2026-11-18T00:00:00.000Z',
    slot_end: '2026-11-18T00:30:00.000Z',
    slot_date: '2026-11-18',
    slot_label: 'label',
    time_zone: 'Australia/Sydney',
    attendee_name: 'redacted',
    attendee_email: 'redacted@example.com',
    organization: 'redacted',
    answers_original: '{}',
    invitees: '[]',
    request_hash: 'abc',
    fingerprint: 'def',
    email_hash: 'emailhashvalue',
    state: 'HELD',
    meeting_status: 'pending',
    event_id: '',
    staff_notify: '{}',
    created_at: '2026-11-15T16:47:59.000Z',
    etag: 'etag1',
  })
  assert.equal(entity.kind, 'booking')
  assert.equal(entity.rowKey, 'bkg_ecaebd37-a25d-4fe0-9726-03d34268ab47')
  assert.equal(entity.site, 'qvm')
  assert.equal(entity.meetingStatus, 'pending')
  assert.equal(entity.emailHash, 'emailhashvalue')
})

test('email claim rows without time_zone still map as email claims', () => {
  const store = new SqlSiteStore({ site: 'qvm', server: 'example', database: 'QVM', credential: {} })
  const entity = store.toEntity(V2_BOOKINGS_TABLE, {
    email_hash: 'emailhashvalue',
    booking_id: 'ecaebd37-a25d-4fe0-9726-03d34268ab47',
    slot_start: '2026-11-18T00:00:00.000Z',
    etag: 'etag1',
  })
  assert.equal(entity.kind, 'email')
  assert.equal(entity.rowKey, 'email_emailhashvalue')
  assert.equal(entity.bookingId, 'ecaebd37-a25d-4fe0-9726-03d34268ab47')
})

test('get after insert returns a booking entity usable for patch (site present)', async () => {
  const bookingId = 'ecaebd37-a25d-4fe0-9726-03d34268ab47'
  const store = new SqlSiteStore({
    site: 'qvm',
    server: 'example',
    database: 'QVM',
    credential: {},
    execute: async () => ({
      rows: [{
        booking_id: bookingId,
        site: 'qvm',
        source: 'site-form',
        market: 'au',
        reference: 'QVM-1',
        slot_start: '2026-11-18T00:00:00.000Z',
        slot_end: '2026-11-18T00:30:00.000Z',
        slot_date: '2026-11-18',
        slot_label: 'label',
        time_zone: 'Australia/Sydney',
        attendee_name: 'redacted',
        attendee_email: 'redacted@example.com',
        organization: 'redacted',
        answers_original: '{}',
        invitees: '[]',
        request_hash: 'abc',
        fingerprint: 'def',
        email_hash: 'emailhashvalue',
        state: 'HELD',
        meeting_status: 'pending',
        event_id: '',
        staff_notify: '{}',
        created_at: '2026-11-15T16:47:59.000Z',
        etag: 'etag1',
      }],
      rowsAffected: [1],
    }),
  })
  const stored = await store.get(V2_BOOKINGS_TABLE, 'qvm', `bkg_${bookingId}`)
  assert.equal(stored.kind, 'booking')
  assert.equal(stored.site, 'qvm')
  assert.ok(stored.site, 'site must be present so siteStore(booking.site) is not null')
})
