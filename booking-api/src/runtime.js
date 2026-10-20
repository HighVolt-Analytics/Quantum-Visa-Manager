import { ManagedIdentityCredential } from '@azure/identity'
import { rawGraphCaller } from './functions/diagnostics.js'
import { missingBookingSettings, readConfig } from './lib/config.js'
import { BookingService, createAvailabilityCache } from './lib/bookingService.js'
import { CalendarClient, managedIdentityTokenProvider } from './lib/graph.js'
import { Ledger } from './lib/ledger.js'
import { Reconciler } from './lib/reconciler.js'
import { AzureTableStore } from './lib/tableStore.js'
import { verifyTurnstile } from './lib/turnstile.js'

let infra = null

function buildInfra(cfg) {
  const credential = new ManagedIdentityCredential({ clientId: cfg.clientId })
  const store = new AzureTableStore({
    accountName: cfg.storageAccount,
    credential,
    connectionString: cfg.tablesConnectionString,
  })
  const getToken = managedIdentityTokenProvider(credential)
  return {
    store,
    getToken,
    ledger: new Ledger(store),
    calendar: new CalendarClient({ getToken }),
    cache: createAvailabilityCache(),
  }
}

/** Reads configuration on every call; Azure resources are only created once booking is usable. */
export function getRuntime(env = process.env) {
  const cfg = readConfig(env)
  const lazyInfra = () => (infra ??= buildInfra(cfg))
  return {
    cfg,
    missing: missingBookingSettings(cfg),
    storageConfigured: Boolean(cfg.tablesConnectionString || (cfg.storageAccount && cfg.clientId)),
    service(log) {
      const i = lazyInfra()
      return new BookingService({
        ledger: i.ledger,
        store: i.store,
        calendar: i.calendar,
        cache: i.cache,
        hashKey: cfg.hashKey,
        log,
        verifyTurnstile: (args) =>
          verifyTurnstile({
            ...args,
            secret: cfg.turnstileSecret,
            expectedHostnames: cfg.turnstileHostnames,
            expectedAction: cfg.turnstileAction,
          }),
      })
    },
    reconciler(log) {
      const i = lazyInfra()
      const service = this.service(log)
      return new Reconciler({ ledger: i.ledger, calendar: i.calendar, store: i.store, service, log })
    },
  }
}

export function getDiagnosticsDeps(env = process.env) {
  if (env.BOOKING_DIAGNOSTICS_ENABLED !== 'true') return { enabled: false }
  const i = (infra ??= buildInfra(readConfig(env)))
  return { enabled: true, calendar: i.calendar, rawGraph: rawGraphCaller({ getToken: i.getToken }) }
}
