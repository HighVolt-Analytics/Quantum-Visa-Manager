import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import { rawGraphCaller } from './functions/diagnostics.js'
import { missingBookingSettings, readConfig } from './lib/config.js'
import { SITES } from './lib/v2/roster.js'
import { readSqlServer, SQL_DATABASES } from './lib/v2/config.js'
import { SqlSiteStore } from './lib/v2/sqlStore.js'
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

/**
 * The Function app uses its managed identity. Local development uses DefaultAzureCredential.
 * Neither path reads a storage account key.
 */
export function tableCredential(env = process.env) {
  if (String(env.WEBSITE_INSTANCE_ID || '').trim()) {
    const clientId = String(env.AZURE_CLIENT_ID || '').trim()
    return clientId ? new ManagedIdentityCredential({ clientId }) : new ManagedIdentityCredential()
  }
  return new DefaultAzureCredential()
}

/**
 * One SQL database per site on the shared logical server.
 * Constructing a store does not connect, create a database, or read a password.
 * QVM v1 stays on the existing table store and is not opened here.
 */
function siteStores(env) {
  const server = readSqlServer(env.BOOKING_SQL_SERVER)
  const stores = {}
  if (!server) {
    for (const site of SITES) stores[site] = null
    return stores
  }
  const credential = tableCredential(env)
  for (const site of SITES) {
    stores[site] = new SqlSiteStore({ site, server, database: SQL_DATABASES[site], credential })
  }
  return stores
}

/** Shared table store and the existing v1 calendar client. Does not create events. */
export function getSharedResources(env = process.env) {
  const cfg = readConfig(env)
  const stores = siteStores(env)
  const anySite = Object.values(stores).some(Boolean)
  const storageConfigured = Boolean(cfg.tablesConnectionString || (cfg.storageAccount && cfg.clientId))
  if (!storageConfigured && !anySite) {
    return { storageConfigured: false, store: null, stores, getToken: null, calendar: null }
  }
  if (!storageConfigured) {
    return { storageConfigured: true, store: null, stores, getToken: null, calendar: null }
  }
  const i = (infra ??= buildInfra(cfg))
  return { storageConfigured: true, store: i.store, stores, getToken: i.getToken, calendar: i.calendar }
}

export function getDiagnosticsDeps(env = process.env) {
  if (env.BOOKING_DIAGNOSTICS_ENABLED !== 'true') return { enabled: false }
  const i = (infra ??= buildInfra(readConfig(env)))
  return { enabled: true, calendar: i.calendar, rawGraph: rawGraphCaller({ getToken: i.getToken }) }
}
