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

const KNOWN_ANSWER_KEYS = new Set([
  'size',
  'system',
  'systemName',
  'bottleneck',
  'first',
  'last',
  'email',
  'phone',
  'org',
  'address',
  'specialRequests',
  'state',
  'country',
  'countryCode',
  'partner',
  'sponsorshipTeam',
  'consent',
])

/**
 * Site-specific checks. QVM keeps its existing choice lists.
 * Consent is stored when accepted. Extra submitted answer keys are kept after light sanitization
 * so the portal can show site-specific fields without inventing values.
 */
export function validateV2Booking(body) {
  const errors = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body'] }
  const site = SITES.includes(body.site) ? body.site : (errors.push('site'), undefined)
  const a = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {}
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
  // HighVolt demo bookings use name/email/address/phone/special requests, not the
  // product-site questionnaire. Other non-QVM sites keep their required practice fields.
  const isHva = site === 'hva'
  const answers = {
    size: check(
      'size',
      site === 'qvm'
        ? choice(a.size, OPTIONS.size)
        : text(a.size, { required: !isHva, max: 200 }),
    ),
    system: check(
      'system',
      site === 'qvm'
        ? choice(a.system, OPTIONS.system)
        : text(a.system, { required: !isHva, max: 200 }),
    ),
    systemName: check('systemName', text(a.systemName, { required: false, max: 120 })),
    bottleneck: check(
      'bottleneck',
      site === 'qvm'
        ? choice(a.bottleneck, OPTIONS.bottleneck)
        : text(isHva ? (a.specialRequests || a.bottleneck) : a.bottleneck, { required: !isHva, max: 500 }),
    ),
    first: check('first', text(a.first, { required: true, max: 80 })),
    last: check('last', text(a.last, { required: true, max: 80 })),
    email: check('email', text(a.email, { required: true, max: 254 })),
    phone: check('phone', text(a.phone, { required: false, max: 32 })),
    org: check('org', text(a.org, { required: !isHva, max: 120 })),
    address: '',
    specialRequests: '',
    state: '',
    country: '',
    countryCode: '',
    partner: a.partner === true,
    consent: false,
  }
  if (a.sponsorshipTeam === true) answers.sponsorshipTeam = true
  if (isHva) {
    answers.address = check('address', text(a.address, { required: false, max: 200 }))
    answers.specialRequests = check('specialRequests', text(a.specialRequests || a.bottleneck, { required: false, max: 500 }))
    if (!answers.size) answers.size = 'HighVolt demo'
    if (!answers.system) answers.system = 'HighVolt demo'
    if (!answers.org) answers.org = answers.address || 'HighVolt demo'
  }
  const country = resolveCountry(a.country)
  if (!country) errors.push('country')
  else {
    answers.country = country.name
    answers.countryCode = country.code
  }
  if (site === 'qvm' && country?.code === 'AU' && a.state) {
    // Region is optional on the form; AU values still use the territory list when present.
    answers.state = check('state', choice(a.state, OPTIONS.state))
  } else {
    answers.state = check('state', text(a.state, { required: false, max: 80 }))
  }
  if (answers.email && !EMAIL.test(answers.email)) errors.push('email')
  if (answers.phone && !PHONE.test(answers.phone)) errors.push('phone')
  if (a.consent !== true) errors.push('consent')
  else answers.consent = true

  for (const [key, value] of Object.entries(a)) {
    if (KNOWN_ANSWER_KEYS.has(key)) continue
    if (typeof key !== 'string' || !key || key.length > 64 || CONTROL.test(key)) continue
    if (typeof value === 'boolean') {
      answers[key] = value
      continue
    }
    if (typeof value === 'string') {
      const extra = text(value, { required: false, max: 500 })
      if (!extra.error && extra.value) answers[key] = extra.value
      continue
    }
    if (Array.isArray(value)) {
      const joined = value.filter((item) => typeof item === 'string').join(', ')
      const extra = text(joined, { required: false, max: 500 })
      if (!extra.error && extra.value) answers[key] = extra.value
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)] }
  return { ok: true, value: { site, idempotencyKey, slotStart, turnstileToken, timeZone, answers } }
}
