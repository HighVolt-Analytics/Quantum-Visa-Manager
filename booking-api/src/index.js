import { app } from '@azure/functions'
import { makeAvailabilityHandler } from './functions/availability.js'
import { makeBookingsHandler } from './functions/bookings.js'
import { makeDiagnosticsHandler } from './functions/diagnostics.js'
import { makeReconcileHandler } from './functions/reconcile.js'
import { getDiagnosticsDeps, getRuntime } from './runtime.js'

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
