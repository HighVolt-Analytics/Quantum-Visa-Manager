import { GraphError } from '../graph.js'
import { clientIp, json, originAllowed } from '../http.js'
import { createLogger, errorCode } from '../log.js'
import { NOTE_PROPERTY_ID, readConfig } from '../config.js'
import { verifyTurnstile } from '../turnstile.js'
import { publicWriteGate, readV2Config } from './config.js'
import { deriveMarket } from './market.js'
import { readMicrosoftBookings } from './microsoftBookings.js'
import { SITES, SITE_DOMAINS } from './roster.js'
import { isValidTimeZone } from './schedule.js'
import { V2BookingService } from './service.js'
import { timingSafeEqual } from 'node:crypto'

function tokensMatch(provided, expected) {
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function staffUnauthorized(request, cfg) {
  if (!cfg.staffToken) return json(503, { status: 'unconfigured', missing: ['BOOKINGS_PORTAL_API_TOKEN'] })
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!tokensMatch(token, cfg.staffToken)) return json(401, { status: 'unauthorized' })
  return null
}

function graphClient(getToken, fetchImpl = fetch) {
  const GRAPH = 'https://graph.microsoft.com/v1.0'
  async function request(mailbox, method, path, body) {
    if (!mailbox) throw new GraphError('mailbox_unconfigured', { status: 503 })
    const token = await getToken()
    let res
    try {
      res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(mailbox)}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
    } catch (err) {
      const code = err?.name === 'TimeoutError' ? 'timeout' : 'network'
      throw new GraphError(code, { retryable: true, uncertain: method !== 'GET' })
    }
    if (res.status === 204) return null
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      throw new GraphError(data?.error?.code || `http_${res.status}`, {
        status: res.status,
        retryable,
        uncertain: retryable && method !== 'GET',
      })
    }
    return data
  }
  return {
    async getSchedule(mailbox, startIso, endIso) {
      const data = await request(mailbox, 'POST', '/calendar/getSchedule', {
        schedules: [mailbox],
        startTime: { dateTime: startIso.replace('Z', ''), timeZone: 'UTC' },
        endTime: { dateTime: endIso.replace('Z', ''), timeZone: 'UTC' },
        availabilityViewInterval: 30,
      })
      const item = data?.value?.[0]
      const view = item?.availabilityView
      if (!item || item.error || typeof view !== 'string' || !view.length) {
        throw new GraphError('schedule_unavailable', { status: 502 })
      }
      return view
    },
    async findByBooking(mailbox, bookingId) {
      const filter = `singleValueExtendedProperties/Any(ep: ep/id eq 'String {6c1a9e40-2b7d-4f5a-8c31-9d0e4a7b2c18} Name HvBookingV2Id' and ep/value eq '${bookingId}')`
      const data = await request(mailbox, 'GET', `/events?$filter=${encodeURIComponent(filter)}&$select=id,isCancelled&$top=5`)
      return data?.value || []
    },
    async createEvent(mailbox, payload) {
      return request(mailbox, 'POST', '/events', {
        subject: payload.subject,
        body: { contentType: 'text', content: 'Join with the Microsoft Teams link in this invitation.' },
        start: { dateTime: payload.start.replace('Z', ''), timeZone: 'UTC' },
        end: { dateTime: payload.end.replace('Z', ''), timeZone: 'UTC' },
        attendees: payload.attendees.map((person) => ({
          emailAddress: { address: person.email, name: person.name },
          type: 'required',
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
        transactionId: payload.transactionId,
        singleValueExtendedProperties: [{ id: payload.propertyId, value: payload.bookingId }],
      })
    },
    async sendMail({ sender, to, subject, body, idempotencyKey }) {
      await request(sender, 'POST', '/sendMail', {
        message: {
          subject,
          body: { contentType: 'text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
          internetMessageHeaders: [{ name: 'x-hv-booking-mail', value: idempotencyKey }],
        },
        saveToSentItems: true,
      })
      return { acceptedByGraph: true }
    },
  }
}

function serviceFrom(resources, env, log) {
  const cfg = readV2Config(env)
  const v1 = readConfig(env)
  const graph = resources.getToken ? graphClient(resources.getToken) : null
  return {
    cfg,
    service: new V2BookingService({
      store: resources.store,
      stores: resources.stores,
      legacyStore: resources.legacyStore || null,
      calendar: graph,
      mail: graph,
      cfg,
      log,
      verifyTurnstile: (args) => verifyTurnstile({
        token: args.token,
        remoteIp: args.remoteIp,
        idempotencyKey: args.idempotencyKey,
        secret: v1.turnstileSecret,
        expectedHostnames: args.expectedHostnames || [],
        expectedAction: v1.turnstileAction,
      }),
    }),
  }
}

export function catalog(cfg) {
  return SITES.map((site) => ({
    id: site,
    domain: SITE_DOMAINS[site],
    status: cfg.sites[site].enabled ? 'enabled' : 'switch_off',
    bookings: [],
  }))
}

export function makeV2AvailabilityHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const url = new URL(request.url)
      const site = url.searchParams.get('site') || ''
      const country = url.searchParams.get('country') || ''
      const timeZone = url.searchParams.get('timeZone') || ''
      const current = env()
      const cfg = readV2Config(current)
      const gate = publicWriteGate(cfg, site, request.headers.get('origin'))
      if (!gate.ok) return json(gate.httpStatus, gate.body)
      const derived = deriveMarket(site, { country })
      if (!derived.ok) return json(400, { status: 'invalid', fields: ['country'] })
      if (!isValidTimeZone(timeZone)) return json(400, { status: 'invalid', fields: ['timeZone'] })
      const market = derived.market
      const resources = getResources()
      const { service } = serviceFrom(resources, current, log)
      const result = await service.availability({ site, market, timeZone, ip: clientIp(request) })
      return json(result.httpStatus, result.body)
    } catch (err) {
      log.error('v2_availability_error', { code: errorCode(err) })
      return json(500, { status: 'error' })
    }
  }
}

export function makeV2BookingsHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const current = env()
      const cfg = readV2Config(current)
      let body
      try { body = await request.json() } catch { return json(400, { status: 'invalid', fields: ['body'] }) }
      const gate = publicWriteGate(cfg, body?.site, request.headers.get('origin'))
      if (!gate.ok) return json(gate.httpStatus, gate.body)
      if (!originAllowed(request, cfg.sites[body.site].origins)) return json(403, { status: 'forbidden' })
      const resources = getResources()
      const { service } = serviceFrom(resources, current, log)
      const result = await service.create({ body, origin: request.headers.get('origin'), ip: clientIp(request) })
      return json(result.httpStatus, result.body)
    } catch (err) {
      log.error('v2_booking_error', { code: errorCode(err) })
      return json(500, { status: 'error' })
    }
  }
}

export function makeV2StaffHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const current = env()
      const cfg = readV2Config(current)
      const denied = staffUnauthorized(request, cfg)
      if (denied) return denied
      const resources = getResources()
      const url = new URL(request.url)
      const { service } = serviceFrom(resources, current, log)
      const sqlConfigured = Object.values(resources.stores || {}).some(Boolean)
      const report = await service.staffRead({
        date: url.searchParams.get('date') || '',
        site: url.searchParams.get('site') || '',
        assignee: url.searchParams.get('assignee') || '',
      })
      const sites = catalog(cfg).map((site) => {
        const failed = report.unavailable.includes(site.id)
        const rows = report.bookings.filter((row) => row.site === site.id)
        const legacyReadError = site.id === 'qvm' ? (report.legacyReadError || '') : ''
        return {
          ...site,
          bookings: failed ? rows.filter((row) => row.source === 'legacy-v1') : rows,
          readError: failed ? 'unavailable' : '',
          legacyReadError,
        }
      })
      const missing = sqlConfigured ? [] : ['BOOKING_SQL_SERVER']
      const legacyMissing = report.legacyMissing || []
      const status = (report.unavailable.length || report.legacyUnavailable)
        ? 'partial'
        : (missing.length && !report.bookings.length ? 'unconfigured' : 'ok')
      return json(200, {
        status,
        missing,
        legacyMissing,
        legacyReadError: report.legacyReadError || '',
        legacyUnavailable: Boolean(report.legacyUnavailable),
        sites,
        legacyReadOnly: true,
      })
    } catch (err) {
      log.error('v2_staff_error', { code: errorCode(err) })
      return json(500, { status: 'error' })
    }
  }
}

export function makeV2StaffDetailHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const current = env()
      const cfg = readV2Config(current)
      const denied = staffUnauthorized(request, cfg)
      if (denied) return denied
      const resources = getResources()
      if (!resources.stores?.[request.params.site]) return json(503, { status: 'unconfigured', missing: ['BOOKING_SQL_SERVER'] })
      const { service } = serviceFrom(resources, current, log)
      const result = await service.staffDetail(request.params.site, request.params.bookingId)
      const httpStatus = result.status === 'ok' ? 200 : result.status === 'unavailable' ? 503 : 404
      return json(httpStatus, result)
    } catch (err) {
      log.error('v2_staff_detail_error', { code: errorCode(err) })
      return json(500, { status: 'error' })
    }
  }
}

/** Settles expired v2 locks and looks up unconfirmed meetings. Does not create a second event. */
export function makeV2ReconcileHandler(getResources, env = () => process.env) {
  return async (_timer, context) => {
    const log = createLogger(context)
    try {
      const resources = getResources()
      if (!resources.storageConfigured) {
        log.warn('v2_reconcile_skipped', { reason: 'storage_not_configured' })
        return
      }
      const { service } = serviceFrom(resources, env(), log)
      await service.reconcile()
    } catch (err) {
      log.error('v2_reconcile_failed', { code: errorCode(err) })
    }
  }
}

/** Lists existing Microsoft Bookings appointments. It does not create or copy meetings. */
export function makeV2MicrosoftBookingsHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const cfg = readV2Config(env())
      const denied = staffUnauthorized(request, cfg)
      if (denied) return denied
      const resources = getResources()
      const result = await readMicrosoftBookings({
        businessId: cfg.bookingsBusinessId,
        getToken: resources.getToken,
      })
      return json(200, { status: result.configured ? 'ok' : 'unconfigured', ...result })
    } catch (err) {
      log.error('v2_microsoft_bookings_error', { code: errorCode(err) })
      return json(200, { status: 'read_failed', readOnly: true, appointments: [] })
    }
  }
}

/** Reads an existing v1 private note. Does not create or update calendar events. */
export function makeV2LegacyNoteHandler(getResources, env = () => process.env) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const cfg = readV2Config(env())
      const denied = staffUnauthorized(request, cfg)
      if (denied) return denied
      const resources = getResources()
      if (!resources.calendar) return json(503, { status: 'unconfigured', missing: ['AZURE_CLIENT_ID'] })
      const bookingId = request.params.bookingId
      if (!/^[0-9a-f-]{36}$/i.test(bookingId || '')) return json(400, { status: 'invalid' })
      const found = await resources.calendar.findEventsByProperty(`${bookingId}-note`, NOTE_PROPERTY_ID, 'id,isCancelled,body')
      const note = (found || []).find((event) => !event.isCancelled)
      if (!note) return json(200, { status: 'not_found' })
      return json(200, {
        status: 'recovered',
        eventIdPresent: Boolean(note.id),
        body: note.body?.content || note.bodyPreview || '',
      })
    } catch (err) {
      log.error('v2_legacy_note_error', { code: errorCode(err) })
      return json(500, { status: 'error' })
    }
  }
}
