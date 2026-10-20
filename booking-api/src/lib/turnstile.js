const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Server-side Cloudflare Turnstile check. Fails closed: any network or service
 * problem returns `unavailable`, which callers must treat as a refusal.
 */
export async function verifyTurnstile({
  token,
  remoteIp,
  idempotencyKey,
  secret,
  expectedHostnames = [],
  expectedAction = '',
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  if (!token) return { ok: false, reason: 'missing' }
  if (!secret) return { ok: false, reason: 'unavailable' }
  const form = new URLSearchParams({ secret, response: token })
  if (idempotencyKey) form.set('idempotency_key', idempotencyKey)
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp)

  let res
  try {
    res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  if (!res.ok) return { ok: false, reason: 'unavailable' }

  let data
  try {
    data = await res.json()
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  if (data.success !== true) return { ok: false, reason: 'rejected' }
  if (expectedHostnames.length && !expectedHostnames.includes(data.hostname)) return { ok: false, reason: 'hostname' }
  if (expectedAction && data.action !== expectedAction) return { ok: false, reason: 'action' }
  return { ok: true }
}
