import { RESPONSES, clientIp, json } from '../lib/http.js'
import { createLogger, errorCode } from '../lib/log.js'

export function makeAvailabilityHandler(getRuntime) {
  return async (request, context) => {
    const log = createLogger(context)
    try {
      const rt = getRuntime()
      if (!rt.cfg.enabled) return RESPONSES.disabled()
      if (rt.missing.length) {
        log.error('config_missing', { count: rt.missing.length })
        return RESPONSES.disabled()
      }
      const result = await rt.service(log).availability({ ip: clientIp(request) })
      return json(result.httpStatus, result.body)
    } catch (err) {
      log.error('availability_error', { code: errorCode(err) })
      return RESPONSES.error()
    }
  }
}
