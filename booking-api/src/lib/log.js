// Only these keys reach the logs. Customer names, emails, phone numbers, answers,
// IP addresses and tokens must never be passed here.
const SAFE_KEYS = new Set(['bookingId', 'state', 'status', 'code', 'httpStatus', 'attempt', 'count', 'reason', 'durationMs', 'op', 'category'])

function format(event, fields) {
  const parts = [`qvm.event=${event}`]
  for (const [k, v] of Object.entries(fields)) {
    if (!SAFE_KEYS.has(k) || v === undefined || v === null) continue
    parts.push(`${k}=${String(v).replace(/[^\w.:-]/g, '_').slice(0, 80)}`)
  }
  return parts.join(' ')
}

export function createLogger(sink) {
  return {
    info: (event, fields = {}) => sink.log(format(event, fields)),
    warn: (event, fields = {}) => sink.warn(format(event, fields)),
    error: (event, fields = {}) => sink.error(format(event, fields)),
  }
}

export function errorCode(err) {
  if (!err) return 'unknown'
  return err.code || err.name || 'error'
}

/** Log-safe fields describing a failure: operation, HTTP status, Graph code and category. */
export function errorFields(err) {
  return { op: err?.operation, httpStatus: err?.status || undefined, code: errorCode(err), category: err?.category }
}
