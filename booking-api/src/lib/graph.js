import { BOOKING_PROPERTY_ID, CALENDAR_MAILBOX } from './config.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export class GraphError extends Error {
  constructor(code, { status = 0, retryable = false, uncertain = false, retryAfterMs, category, operation } = {}) {
    super(`Graph request failed: ${code}`)
    this.name = 'GraphError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.uncertain = uncertain
    this.retryAfterMs = retryAfterMs
    this.category = category ?? classifyGraphError(status, code, '')
    this.operation = operation
  }
}

/**
 * Maps a Graph failure to a fixed, log-safe category. The raw Graph message is only
 * pattern-matched here and is never stored or logged.
 */
export function classifyGraphError(status, code, message) {
  if (status === 0) return code === 'timeout' ? 'timeout' : 'network'
  if (status === 404 || code === 'ErrorItemNotFound') return 'not_found'
  // Exchange answers this way for an item that was moved out of the calendar,
  // e.g. a meeting the organizer cancelled (it goes to Deleted Items).
  if (status === 400 && code === 'ErrorInvalidRequest' && /non-calendar folder/i.test(String(message))) return 'non_calendar_folder'
  if (status === 401 || status === 403) return 'access_denied'
  if (status === 429) return 'throttled'
  if (status >= 500) return 'server_error'
  if (status === 400) return 'invalid_request'
  return 'other'
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

  async request(method, path, body, operation = 'graph') {
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
      throw new GraphError(code, { retryable: true, uncertain: method !== 'GET', operation })
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
      const code = data?.error?.code || `http_${res.status}`
      throw new GraphError(code, {
        status: res.status,
        retryable,
        uncertain: retryable && method !== 'GET',
        retryAfterMs: retryAfterMs(res.headers.get('retry-after')),
        category: classifyGraphError(res.status, code, data?.error?.message),
        operation,
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
        return await this.request('POST', '/calendar/getSchedule', body, 'get_schedule')
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
    return withRetry(() => this.request('POST', '/events', payload, 'create_event'), this.retry)
  }

  /**
   * Looks up a calendar event by ID. Returns { state: 'active' | 'cancelled', event } or
   * { state: 'deleted' | 'moved' }. Any other failure is thrown: it proves nothing.
   */
  async lookupEvent(id, { includeOnlineMeeting = false } = {}) {
    const select = includeOnlineMeeting ? 'id,isCancelled,onlineMeeting' : 'id,isCancelled'
    try {
      const event = await withRetry(
        () => this.request('GET', `/events/${encodeURIComponent(id)}?$select=${select}`, undefined, 'lookup_event'),
        this.retry,
      )
      return { state: event?.isCancelled ? 'cancelled' : 'active', event }
    } catch (err) {
      if (err instanceof GraphError && err.category === 'not_found') return { state: 'deleted' }
      if (err instanceof GraphError && err.category === 'non_calendar_folder') return { state: 'moved' }
      throw err
    }
  }

  /**
   * Events overlapping a time window in the booking calendar, with this app's booking tag.
   * Throws if Graph reports more results than one page, because a partial view proves nothing.
   */
  async eventsInWindow(startIso, endIso, propertyId = BOOKING_PROPERTY_ID) {
    const query = [
      `startDateTime=${encodeURIComponent(startIso)}`,
      `endDateTime=${encodeURIComponent(endIso)}`,
      '$select=id,isCancelled',
      `$expand=${encodeURIComponent(`singleValueExtendedProperties($filter=id eq '${propertyId}')`)}`,
      '$top=50',
    ].join('&')
    const data = await withRetry(() => this.request('GET', `/calendar/calendarView?${query}`, undefined, 'window_search'), this.retry)
    if (!Array.isArray(data?.value) || data['@odata.nextLink']) {
      throw new GraphError('window_incomplete', { status: 200, category: 'inconclusive', operation: 'window_search' })
    }
    return data.value.map((e) => ({
      id: e.id,
      isCancelled: Boolean(e.isCancelled),
      bookingId: (e.singleValueExtendedProperties || []).find((p) => p.id === propertyId)?.value ?? null,
    }))
  }

  async findEventsByProperty(bookingId, propertyId = BOOKING_PROPERTY_ID) {
    if (!/^[0-9a-f-]{36}(-note)?$/.test(bookingId)) throw new Error('Invalid booking id')
    const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${propertyId}' and ep/value eq '${bookingId}')`
    const query = `?$filter=${encodeURIComponent(filter)}&$select=id,isCancelled,onlineMeeting,createdDateTime&$top=10`
    const data = await withRetry(() => this.request('GET', `/events${query}`, undefined, 'property_search'), this.retry)
    return (data?.value ?? []).slice().sort((a, b) => String(a.createdDateTime).localeCompare(String(b.createdDateTime)))
  }

  /** Deletes an event. Already deleted, or already moved to Deleted Items, counts as done. */
  async deleteEvent(id) {
    try {
      await withRetry(() => this.request('DELETE', `/events/${encodeURIComponent(id)}`, undefined, 'delete_event'), this.retry)
      return { deleted: true }
    } catch (err) {
      if (err instanceof GraphError && ['not_found', 'non_calendar_folder'].includes(err.category)) return { alreadyGone: true }
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
