export const OPTIONS = Object.freeze({
  size: ['Sole agent', '2–5', '6–20', '21+', 'Corporate HR / sponsorship team'],
  system: [
    'Dedicated migration practice software',
    'General CRM or practice management software',
    'Spreadsheets, email and shared drives',
    'A mix of several tools',
    'Something else',
  ],
  bottleneck: [
    'chasing missing documents',
    'checking expiry and eligibility',
    're-entering data into forms',
    'Department and client correspondence',
    'keeping up with changing requirements',
    'after-hours enquiries',
    'sponsor document management',
    'switching from our current system',
  ],
  state: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', 'Outside Australia'],
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
const PHONE = /^[0-9+()\s.-]{6,32}$/
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

function text(value, { required, max }) {
  if (value === undefined || value === null || value === '') return required ? { error: 'required' } : { value: '' }
  if (typeof value !== 'string') return { error: 'invalid' }
  const v = value.trim()
  if (!v) return required ? { error: 'required' } : { value: '' }
  if (v.length > max || CONTROL.test(v)) return { error: 'invalid' }
  return { value: v }
}

function choice(value, options) {
  return typeof value === 'string' && options.includes(value) ? { value } : { error: 'invalid' }
}

/** Validates the browser payload. Unknown fields are dropped. */
export function validateBookingRequest(body) {
  const errors = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body'] }
  const a = body.answers && typeof body.answers === 'object' ? body.answers : {}

  const check = (field, result) => {
    if (result.error) errors.push(field)
    return result.value
  }

  const idempotencyKey = typeof body.idempotencyKey === 'string' && UUID.test(body.idempotencyKey)
    ? body.idempotencyKey.toLowerCase()
    : (errors.push('idempotencyKey'), undefined)
  const slotStart = check('slotStart', text(body.slotStart, { required: true, max: 40 }))
  const turnstileToken = check('turnstileToken', text(body.turnstileToken, { required: true, max: 2048 }))

  const answers = {
    size: check('size', choice(a.size, OPTIONS.size)),
    system: check('system', choice(a.system, OPTIONS.system)),
    systemName: check('systemName', text(a.systemName, { required: false, max: 120 })),
    bottleneck: check('bottleneck', choice(a.bottleneck, OPTIONS.bottleneck)),
    first: check('first', text(a.first, { required: true, max: 80 })),
    last: check('last', text(a.last, { required: true, max: 80 })),
    email: check('email', text(a.email, { required: true, max: 254 })),
    phone: check('phone', text(a.phone, { required: false, max: 32 })),
    org: check('org', text(a.org, { required: true, max: 120 })),
    state: check('state', choice(a.state, OPTIONS.state)),
  }
  if (answers.email && !EMAIL.test(answers.email)) errors.push('email')
  if (answers.phone && !PHONE.test(answers.phone)) errors.push('phone')
  if (a.consent !== true) errors.push('consent')

  if (errors.length) return { ok: false, errors: [...new Set(errors)] }
  return { ok: true, value: { idempotencyKey, slotStart, turnstileToken, answers } }
}
