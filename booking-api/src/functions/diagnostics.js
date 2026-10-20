import { randomUUID } from 'node:crypto'
import { CALENDAR_MAILBOX, SLOT_MINUTES } from '../lib/config.js'
import { GraphError } from '../lib/graph.js'
import { json } from '../lib/http.js'
import { createLogger, errorCode } from '../lib/log.js'
import { addLocalDays, sydneyLocalToUtc, sydneyParts } from '../lib/sydneyTime.js'

// Mailboxes the RBAC denial probe may target. Read-only getSchedule only.
export const DENIAL_PROBES = Object.freeze(['support@highvolt.tech', 'ram@highvolt.tech'])

async function step(fn) {
  try {
    return { ok: true, ...(await fn()) }
  } catch (err) {
    return { ok: false, code: err instanceof GraphError ? err.code : errorCode(err), status: err.status ?? 0 }
  }
}

/**
 * Post-deployment checks of the mailbox-scoped Graph access. Requires the Function admin key
 * and BOOKING_DIAGNOSTICS_ENABLED=true. Returns status codes only, never calendar content.
 */
export function makeDiagnosticsHandler(getDiagnosticsDeps) {
  return async (_request, context) => {
    const log = createLogger(context)
    const deps = getDiagnosticsDeps()
    if (!deps.enabled) return json(404, { status: 'not_found' })
    const { calendar, rawGraph, now = () => new Date() } = deps
    const start = now()

    const schedule = await step(async () => {
      const end = new Date(start.getTime() + 24 * 3600000)
      const view = await calendar.getSchedule(start.toISOString().slice(0, 16) + ':00.000Z', end.toISOString().slice(0, 16) + ':00.000Z')
      return { intervals: view.length }
    })

    const providers = await step(async () => {
      const cal = await rawGraph('GET', `/users/${encodeURIComponent(CALENDAR_MAILBOX)}/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider`)
      return {
        teamsAllowed: (cal.body?.allowedOnlineMeetingProviders ?? []).includes('teamsForBusiness'),
        defaultProvider: cal.body?.defaultOnlineMeetingProvider ?? null,
        status: cal.status,
      }
    })

    const denials = {}
    for (const mailbox of DENIAL_PROBES) {
      const r = await rawGraph('POST', `/users/${encodeURIComponent(mailbox)}/calendar/getSchedule`, {
        schedules: [mailbox],
        startTime: { dateTime: start.toISOString().slice(0, 19), timeZone: 'UTC' },
        endTime: { dateTime: new Date(start.getTime() + 3600000).toISOString().slice(0, 19), timeZone: 'UTC' },
        availabilityViewInterval: 30,
      })
      denials[mailbox] = { status: r.status, denied: r.status === 403 }
    }

    const teamsEvent = await step(async () => {
      const day = addLocalDays(sydneyParts(start), 30)
      const at = sydneyLocalToUtc(day.year, day.month, day.day, 6, 0)
      const local = (d) => {
        const p = sydneyParts(d)
        return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00`
      }
      const created = await calendar.createEvent({
        subject: 'QVM booking diagnostics (deleted automatically)',
        start: { dateTime: local(at), timeZone: 'AUS Eastern Standard Time' },
        end: { dateTime: local(new Date(at.getTime() + SLOT_MINUTES * 60000)), timeZone: 'AUS Eastern Standard Time' },
        attendees: [],
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
        showAs: 'free',
        sensitivity: 'private',
        isReminderOn: false,
        transactionId: `diag-${randomUUID()}`,
      })
      const joinUrlPresent = Boolean(created?.onlineMeeting?.joinUrl)
      await calendar.deleteEvent(created.id)
      return { created: true, joinUrlPresent, deleted: true }
    })

    const result = {
      status: 'ok',
      mailbox: CALENDAR_MAILBOX,
      getSchedule: schedule,
      onlineMeetingProviders: providers,
      denialProbes: denials,
      teamsEvent,
    }
    log.info('diagnostics_run', {
      status: [schedule.ok, providers.ok, teamsEvent.ok, ...Object.values(denials).map((d) => d.denied)].every(Boolean) ? 'pass' : 'fail',
    })
    return json(200, result)
  }
}

/** Minimal Graph caller used only by diagnostics, including the out-of-scope denial probe. */
export function rawGraphCaller({ getToken, fetchImpl = fetch }) {
  return async (method, path, body) => {
    const token = await getToken()
    const res = await fetchImpl(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    let parsed = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    return { status: res.status, body: res.ok ? parsed : null }
  }
}
