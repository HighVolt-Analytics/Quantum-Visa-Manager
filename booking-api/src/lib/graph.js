import { BOOKING_PROPERTY_ID, CALENDAR_MAILBOX } from './config.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export class GraphError extends Error {
  constructor(code, { status = 0, retryable = false, uncertain = false, retryAfterMs } = {}) {
    super(`Graph request failed: ${code}`)
    this.name = 'GraphError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.uncertain = uncertain
    this.retryAfterMs = retryAfterMs
  }
}

function retryAfterMs(header) {
  if (!header) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 10000) : undefined
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry(fn, { attempts = 3, budgetMs = 15000, baseDelayMs = 500, sleep = defaultSleep, now = Date.now } = {}) {
  const started = now()
  let maybeApplied = false
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      if (!(err instanceof GraphError)) throw err
      if (err.uncertain) maybeApplied = true
      const delay = err.retryAfterMs ?? Math.min(baseDelayMs * 2 ** (attempt - 1), 4000)
      if (!err.retryable || attempt >= attempts || now() - started + delay > budgetMs) {
        err.uncertain = err.uncertain || maybeApplied
        throw err
      }
      await sleep(delay)
    }
  }
}

/**
 * Microsoft Graph calendar client bound to the single booking mailbox.
 * Exchange application RBAC restricts the managed identity to this mailbox;
 * this class refuses to address any other one as well.
 */
export class CalendarClient {
  constructor({ mailbox = CALENDAR_MAILBOX, getToken, fetchImpl = fetch, timeoutMs = 8000, retry = {} }) {
    if (String(mailbox).toLowerCase() !== CALENDAR_MAILBOX) {
      throw new Error('Calendar access is restricted to the booking mailbox')
    }
    this.base = `${GRAPH}/users/${encodeURIComponent(CALENDAR_MAILBOX)}`
    this.getToken = getToken
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.retry = retry
  }

  async request(method, path, body) {
    const token = await this.getToken()
    let res
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      const code = err?.name === 'TimeoutError' ? 'timeout' : 'network'
      throw new GraphError(code, { retryable: true, uncertain: method !== 'GET' })
    }
    if (res.status === 204) return null
    const raw = await res.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      throw new GraphError(data?.error?.code || `http_${res.status}`, {
        status: res.status,
        retryable,
        uncertain: retryable && method !== 'GET',
        retryAfterMs: retryAfterMs(res.headers.get('retry-after')),
      })
    }
    return data
  }

  /** Returns the availabilityView string (one digit per 30 minutes; 0 = free). */
  async getSchedule(startIso, endIso) {
    const body = {
      schedules: [CALENDAR_MAILBOX],
      startTime: { dateTime: startIso.replace('Z', ''), timeZone: 'UTC' },
      endTime: { dateTime: endIso.replace('Z', ''), timeZone: 'UTC' },
      availabilityViewInterval: 30,
    }
    // getSchedule is a read despite being a POST, so retries are always safe.
    const data = await withRetry(async () => {
      try {
        return await this.request('POST', '/calendar/getSchedule', body)
      } catch (err) {
        if (err instanceof GraphError) err.uncertain = false
        throw err
      }
    }, this.retry)
    const item = data?.value?.[0]
    if (!item || item.error || typeof item.availabilityView !== 'string') {
      throw new GraphError('schedule_unavailable', { status: 502 })
    }
    return item.availabilityView
  }

  /** Creates an event. Callers must pass a transactionId so replays cannot duplicate it. */
  async createEvent(payload) {
    if (!payload?.transactionId) throw new Error('transactionId is required')
    return withRetry(() => this.request('POST', '/events', payload), this.retry)
  }

  async getEvent(id) {
    try {
      return await withRetry(
        () => this.request('GET', `/events/${encodeURIComponent(id)}?$select=id,isCancelled,onlineMeeting,start,end`),
        this.retry,
      )
    } catch (err) {
      if (err instanceof GraphError && err.status === 404) return null
      throw err
    }
  }

  async findEventsByProperty(bookingId, propertyId = BOOKING_PROPERTY_ID) {
    if (!/^[0-9a-f-]{36}(-note)?$/.test(bookingId)) throw new Error('Invalid booking id')
    const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${propertyId}' and ep/value eq '${bookingId}')`
    const query = `?$filter=${encodeURIComponent(filter)}&$select=id,isCancelled,onlineMeeting,createdDateTime&$top=10`
    const data = await withRetry(() => this.request('GET', `/events${query}`), this.retry)
    return (data?.value ?? []).slice().sort((a, b) => String(a.createdDateTime).localeCompare(String(b.createdDateTime)))
  }

  async deleteEvent(id) {
    try {
      await withRetry(() => this.request('DELETE', `/events/${encodeURIComponent(id)}`), this.retry)
    } catch (err) {
      if (err instanceof GraphError && err.status === 404) return
      throw err
    }
  }
}

export function managedIdentityTokenProvider(credential) {
  return async () => {
    const token = await credential.getToken('https://graph.microsoft.com/.default')
    if (!token?.token) throw new GraphError('token_unavailable')
    return token.token
  }
}
