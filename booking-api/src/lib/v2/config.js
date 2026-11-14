import { PEOPLE, SITES } from './roster.js'

/** v2 calendar owner and staff-mail sender. v1 stays on arup@highvolt.tech. */
export const V2_ORGANIZER_MAILBOX = 'support@highvolt.tech'
export const V2_NOTIFY_SENDER = 'support@highvolt.tech'

/** Logical names used by the service. Each site database stores these records in its own tables. */
export const V2_BOOKINGS_TABLE = 'bookingsv2'
export const V2_RATELIMITS_TABLE = 'ratelimitsv2'

/** Database names on the one Azure SQL logical server. They are not secrets. */
export const SQL_DATABASES = Object.freeze({
  hva: 'HVA',
  agent: 'Agent',
  qvm: 'QVM',
  ledgerline: 'Ledgerline',
  edupass: 'EduPass',
})

export function siteStorageSetting() {
  return 'BOOKING_SQL_SERVER'
}

/**
 * The logical server hostname only.
 * A connection string, user name, or password is rejected.
 */
export function readSqlServer(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || /password=|pwd=|user id=|uid=|accountkey=|;|@|\s/.test(raw)) return ''
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.database\.windows\.net$/.test(raw)) return ''
  return raw
}

function list(value) {
  if (!value) return []
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

export function siteSwitchName(site) {
  return `BOOKING_V2_ENABLED_${String(site).toUpperCase()}`
}

export function siteOriginName(site) {
  return `BOOKING_ORIGINS_${String(site).toUpperCase()}`
}

/** Hostnames of one site's configured origins. Turnstile tokens are checked against this list only. */
export function siteTurnstileHostnames(origins) {
  const names = []
  for (const origin of origins || []) {
    try {
      const hostname = new URL(origin).hostname
      if (hostname && !names.includes(hostname)) names.push(hostname)
    } catch {
      /* An origin that is not a URL cannot prove a Turnstile hostname. */
    }
  }
  return names
}

/**
 * Production switches are off unless the variable is exactly "true".
 * Mailbox addresses and market schedules are empty until configured.
 * Origin is a browser CORS check, not proof of who the caller is.
 */
export function readV2Config(env = process.env) {
  const emails = {}
  for (const person of PEOPLE) emails[person] = String(env[`BOOKING_ASSIGNEE_${person.toUpperCase()}_EMAIL`] || '').trim()
  const sites = {}
  for (const site of SITES) {
    sites[site] = {
      enabled: env[siteSwitchName(site)] === 'true',
      origins: list(env[siteOriginName(site)]),
    }
  }
  return {
    sites,
    emails,
    organizerMailbox: V2_ORGANIZER_MAILBOX,
    notifySender: V2_NOTIFY_SENDER,
    portalBaseUrl: String(env.BOOKINGS_PORTAL_BASE_URL || '').trim().replace(/\/+$/, ''),
    staffToken: String(env.BOOKINGS_PORTAL_API_TOKEN || ''),
    hashKey: String(env.BOOKING_HASH_KEY || ''),
    bookingsBusinessId: String(env.BOOKING_MS_BOOKINGS_BUSINESS_ID || '').trim(),
    hvaIntegration: env.BOOKING_HVA_INTEGRATION === 'connected' ? 'connected' : 'pending',
    visit: readVisitWindow(env),
  }
}

/**
 * Hours are fixed at 09:00–19:00 every day in the visitor's confirmed timezone.
 * Length, notice, and horizon have no default. A blank setting stays unconfigured.
 */
export function readVisitWindow(env = process.env) {
  const names = ['BOOKING_SLOT_MINUTES', 'BOOKING_NOTICE_MINUTES', 'BOOKING_HORIZON_DAYS']
  const missing = names.filter((name) => String(env[name] ?? '').trim() === '')
  if (missing.length) return { configured: false, missing }
  const slotMinutes = Number(env.BOOKING_SLOT_MINUTES)
  const noticeMinutes = Number(env.BOOKING_NOTICE_MINUTES)
  const horizonDays = Number(env.BOOKING_HORIZON_DAYS)
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
    return { configured: false, missing: ['BOOKING_SLOT_MINUTES'] }
  }
  if (!Number.isInteger(noticeMinutes) || noticeMinutes < 0) {
    return { configured: false, missing: ['BOOKING_NOTICE_MINUTES'] }
  }
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 60) {
    return { configured: false, missing: ['BOOKING_HORIZON_DAYS'] }
  }
  return { configured: true, missing: [], slotMinutes, noticeMs: noticeMinutes * 60000, horizonDays }
}

/** CORS and switch gate. A matching Origin does not authenticate the caller. */
export function publicWriteGate(cfg, site, origin) {
  if (!SITES.includes(site)) return { ok: false, httpStatus: 400, body: { status: 'invalid', fields: ['site'] } }
  if (!cfg.sites[site]?.enabled) {
    return { ok: false, httpStatus: 503, body: { status: 'unavailable', reason: 'switch_off', site } }
  }
  if (!origin || !cfg.sites[site].origins.includes(origin)) {
    return { ok: false, httpStatus: 403, body: { status: 'forbidden', reason: 'origin_mismatch', site } }
  }
  return { ok: true }
}
