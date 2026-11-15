import { app } from '@azure/functions'
import { makeAvailabilityHandler } from './functions/availability.js'
import { makeBookingsHandler } from './functions/bookings.js'
import { makeDiagnosticsHandler } from './functions/diagnostics.js'
import { makeReconcileHandler } from './functions/reconcile.js'
import { makeV2AvailabilityHandler, makeV2BookingsHandler, makeV2LegacyNoteHandler, makeV2MeetingLookupHandler, makeV2MicrosoftBookingsHandler, makeV2ReconcileHandler, makeV2StaffDetailHandler, makeV2StaffHandler } from './lib/v2/handlers.js'
import { getDiagnosticsDeps, getRuntime, getSharedResources } from './runtime.js'

const runtime = () => getRuntime()

app.http('availability', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'availability',
  handler: makeAvailabilityHandler(runtime),
})

app.http('bookings', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'bookings',
  handler: makeBookingsHandler(runtime),
})

// Admin key required, and returns 404 unless BOOKING_DIAGNOSTICS_ENABLED=true.
app.http('diagnostics', {
  methods: ['POST'],
  authLevel: 'admin',
  route: 'diagnostics',
  handler: makeDiagnosticsHandler(() => getDiagnosticsDeps()),
})

app.timer('reconcile', {
  schedule: '0 */5 * * * *',
  runOnStartup: false,
  handler: makeReconcileHandler(runtime),
})

const resources = () => getSharedResources()

app.http('v2Availability', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'v2/availability',
  handler: makeV2AvailabilityHandler(resources),
})

app.http('v2Bookings', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'v2/bookings',
  handler: makeV2BookingsHandler(resources),
})

app.http('v2StaffBookings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v2/staff/bookings',
  handler: makeV2StaffHandler(resources),
})

app.http('v2StaffBooking', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v2/staff/bookings/{site}/{bookingId}',
  handler: makeV2StaffDetailHandler(resources),
})

app.timer('v2Reconcile', {
  schedule: '0 */5 * * * *',
  runOnStartup: false,
  handler: makeV2ReconcileHandler(resources),
})

app.http('v2MicrosoftBookings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v2/staff/microsoft-bookings',
  handler: makeV2MicrosoftBookingsHandler(resources),
})

app.http('v2MeetingLookup', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v2/staff/meeting-lookup/{bookingId}',
  handler: makeV2MeetingLookupHandler(resources),
})

app.http('v2LegacyNote', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v2/staff/legacy-notes/{bookingId}',
  handler: makeV2LegacyNoteHandler(resources),
})
