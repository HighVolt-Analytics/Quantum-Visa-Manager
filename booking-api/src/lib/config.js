export const CALENDAR_MAILBOX = 'arup@highvolt.tech'

export const TIME_ZONE = 'Australia/Sydney'
export const GRAPH_TIME_ZONE = 'AUS Eastern Standard Time'
export const SLOT_MINUTES = 30
export const DAY_START_MINUTES = 10 * 60
export const DAY_END_MINUTES = 14 * 60
// Sunday (0) to Friday (5). Saturday (6) is closed.
export const OPEN_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5])
export const MIN_NOTICE_MS = 4 * 60 * 60 * 1000
export const HORIZON_DAYS = 14

export const PARTITION = 'demo'
export const BOOKINGS_TABLE = 'bookings'
export const RATELIMITS_TABLE = 'ratelimits'

export const BOOKING_PROPERTY_ID = 'String {0b9c5e72-3f4a-4d61-9a8e-5c2f7d1e4b30} Name QvmBookingId'
export const NOTE_PROPERTY_ID = 'String {0b9c5e72-3f4a-4d61-9a8e-5c2f7d1e4b30} Name QvmBookingNoteId'

export const RATE_LIMITS = Object.freeze({
  availability: { limit: 30, windowMs: 10 * 60 * 1000 },
  booking: { limit: 5, windowMs: 60 * 60 * 1000 },
})

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://quantumvisamanager.com',
  'https://www.quantumvisamanager.com',
])

function list(value, fallback) {
  if (!value) return [...fallback]
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

export function readConfig(env = process.env) {
  return {
    enabled: env.BOOKING_ENABLED === 'true',
    allowedOrigins: list(env.BOOKING_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    turnstileSecret: env.TURNSTILE_SECRET || '',
    turnstileHostnames: list(env.TURNSTILE_HOSTNAMES, ['quantumvisamanager.com', 'www.quantumvisamanager.com']),
    turnstileAction: env.TURNSTILE_ACTION ?? 'book_demo',
    hashKey: env.BOOKING_HASH_KEY || '',
    clientId: env.AZURE_CLIENT_ID || '',
    storageAccount: env.AzureWebJobsStorage__accountName || '',
    tablesConnectionString: env.BOOKING_TABLES_CONNECTION_STRING || '',
  }
}

export function missingBookingSettings(cfg) {
  const missing = []
  if (!cfg.turnstileSecret) missing.push('TURNSTILE_SECRET')
  if (!cfg.hashKey) missing.push('BOOKING_HASH_KEY')
  if (!cfg.tablesConnectionString && !cfg.storageAccount) missing.push('AzureWebJobsStorage__accountName')
  if (!cfg.tablesConnectionString && !cfg.clientId) missing.push('AZURE_CLIENT_ID')
  return missing
}
