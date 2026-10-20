import { RESPONSES, clientIp, json, originAllowed } from '../lib/http.js'
import { createLogger, errorCode } from '../lib/log.js'

export const MAX_BODY_BYTES = 8 * 1024

export function makeBookingsHandler(getRuntime) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const rt = getRuntime()
      if (!rt.cfg.enabled) return RESPONSES.disabled()
      if (rt.missing.length) {
        log.error('config_missing', { count: rt.missing.length })
        return RESPONSES.disabled()
      }
      if (!originAllowed(request, rt.cfg.allowedOrigins)) return RESPONSES.forbidden()
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return RESPONSES.unsupported()
      const declared = Number(request.headers.get('content-length') || 0)
      if (declared > MAX_BODY_BYTES) return RESPONSES.tooLarge()
      const raw = await request.text()
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return RESPONSES.tooLarge()
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return json(400, { status: 'invalid', fields: ['body'] })
      }
      const result = await rt.service(log).createBooking({ body, ip: clientIp(request) })
      return json(result.httpStatus, result.body)
    } catch (err) {
      log.error('booking_error', { code: errorCode(err) })
      return RESPONSES.error()
    }
  }
}
