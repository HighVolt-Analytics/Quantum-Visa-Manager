const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function json(status, body) {
  return { status, jsonBody: body, headers: { ...BASE_HEADERS } }
}

export const CONTACT = 'hello@highvolt.tech'

export const RESPONSES = Object.freeze({
  disabled: () => json(503, { status: 'unavailable', message: `Online scheduling is temporarily unavailable. Please email ${CONTACT}.` }),
  forbidden: () => json(403, { status: 'forbidden' }),
  tooLarge: () => json(413, { status: 'invalid' }),
  unsupported: () => json(415, { status: 'invalid' }),
  rateLimited: () => json(429, { status: 'rate_limited', message: 'Too many requests. Please try again shortly.' }),
  error: () => json(500, { status: 'error', message: `Something went wrong. Please email ${CONTACT}.` }),
})

export function clientIp(request) {
  const raw = request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || ''
  let ip = raw.split(',')[0].trim()
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']'))
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))
  return ip || 'unknown'
}

export function originAllowed(request, allowedOrigins) {
  const origin = request.headers.get('origin')
  return Boolean(origin) && allowedOrigins.includes(origin)
}

/**
 * Echo a single allowed Origin onto a response. Never uses *.
 * Call only after the Origin is confirmed to be in that site's allowlist.
 */
export function withAllowedOriginCors(response, origin, allowedOrigins) {
  if (!origin || !Array.isArray(allowedOrigins) || !allowedOrigins.includes(origin)) return response
  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  }
}

/** Preflight response for an allowed Origin. Empty body; no internal details. */
export function corsPreflight(origin, allowedOrigins) {
  const base = { status: 204, headers: { ...BASE_HEADERS } }
  return withAllowedOriginCors(base, origin, allowedOrigins)
}
