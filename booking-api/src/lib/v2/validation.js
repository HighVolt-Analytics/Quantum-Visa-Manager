import { OPTIONS } from '../validation.js'
import { resolveCountry } from './countries.js'
import { SITES } from './roster.js'
import { isValidTimeZone } from './schedule.js'

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

/** Site-specific checks. Unknown answer keys are dropped. QVM keeps its existing choice lists. */
export function validateV2Booking(body) {
  const errors = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body'] }
  const site = SITES.includes(body.site) ? body.site : (errors.push('site'), undefined)
  const a = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const check = (field, result) => {
    if (result.error) errors.push(field)
    return result.value
  }
  const idempotencyKey = typeof body.idempotencyKey === 'string' && UUID.test(body.idempotencyKey)
    ? body.idempotencyKey.toLowerCase()
    : (errors.push('idempotencyKey'), undefined)
  const slotStart = check('slotStart', text(body.slotStart, { required: true, max: 40 }))
  const timeZone = isValidTimeZone(body.timeZone) ? body.timeZone.trim() : (errors.push('timeZone'), undefined)
  const turnstileToken = check('turnstileToken', text(body.turnstileToken, { required: true, max: 2048 }))
  const answers = {
    size: check('size', site === 'qvm' ? choice(a.size, OPTIONS.size) : text(a.size, { required: true, max: 200 })),
    system: check('system', site === 'qvm' ? choice(a.system, OPTIONS.system) : text(a.system, { required: true, max: 200 })),
    systemName: check('systemName', text(a.systemName, { required: false, max: 120 })),
    bottleneck: check('bottleneck', site === 'qvm' ? choice(a.bottleneck, OPTIONS.bottleneck) : text(a.bottleneck, { required: true, max: 500 })),
    first: check('first', text(a.first, { required: true, max: 80 })),
    last: check('last', text(a.last, { required: true, max: 80 })),
    email: check('email', text(a.email, { required: true, max: 254 })),
    phone: check('phone', text(a.phone, { required: false, max: 32 })),
    org: check('org', text(a.org, { required: true, max: 120 })),
    state: check('state', site === 'qvm' ? choice(a.state, OPTIONS.state) : text(a.state, { required: false, max: 80 })),
    country: '',
    countryCode: '',
    partner: a.partner === true,
  }
  const country = resolveCountry(a.country)
  if (!country) errors.push('country')
  else {
    answers.country = country.name
    answers.countryCode = country.code
  }
  if (answers.email && !EMAIL.test(answers.email)) errors.push('email')
  if (answers.phone && !PHONE.test(answers.phone)) errors.push('phone')
  if (a.consent !== true) errors.push('consent')
  if (errors.length) return { ok: false, errors: [...new Set(errors)] }
  return { ok: true, value: { site, idempotencyKey, slotStart, turnstileToken, timeZone, answers } }
}
