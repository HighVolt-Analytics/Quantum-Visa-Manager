/** Site-and-market assignee roster. The first id is primary; the rest are secondary. */
export const SITES = Object.freeze(['hva', 'agent', 'qvm', 'ledgerline', 'edupass'])

export const MARKETS = Object.freeze(['india', 'australia', 'other'])

export const PEOPLE = Object.freeze(['lakshmi', 'arup', 'prachi', 'sabina', 'jasisca', 'khushi'])

export const SITE_DOMAINS = Object.freeze({
  hva: 'highvolt.tech',
  agent: 'quantumagent.com.au',
  qvm: 'quantumvisamanager.com',
  ledgerline: 'quantumledgerline.com',
  edupass: 'quantumedupass.com',
})

/** Ledgerline /partnership uses this same site id. */
export const ROSTER = Object.freeze({
  hva: {
    india: ['lakshmi', 'arup'],
    australia: ['arup', 'arup'],
    other: ['arup', 'arup'],
  },
  agent: {
    india: ['lakshmi', 'prachi', 'arup'],
    australia: ['arup', 'arup'],
    other: ['arup', 'prachi', 'arup'],
  },
  qvm: {
    india: ['lakshmi', 'sabina', 'arup'],
    australia: ['jasisca', 'arup'],
    other: ['arup', 'sabina', 'arup'],
  },
  ledgerline: {
    india: ['lakshmi', 'khushi', 'arup'],
    australia: ['arup', 'arup'],
    other: ['arup', 'khushi', 'arup'],
  },
  edupass: {
    india: ['lakshmi', 'prachi', 'arup'],
    australia: ['arup', 'arup'],
    other: ['arup', 'prachi', 'arup'],
  },
})

/** Primary stays first. A person listed in both roles is invited and mailed once. */
export function recipientsFor(site, market) {
  const list = ROSTER[site]?.[market]
  if (!list?.length) return []
  const [primary, ...secondary] = list
  const seen = new Set()
  const out = []
  for (const id of [primary, ...secondary]) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, role: id === primary ? 'primary' : 'secondary' })
  }
  return out
}

export function assigneeEmailVariable(personId) {
  return `BOOKING_ASSIGNEE_${String(personId).toUpperCase()}_EMAIL`
}

export function withEmails(recipients, emails) {
  const missing = []
  const resolved = recipients.map((recipient) => {
    const email = String(emails?.[recipient.id] || '').trim()
    if (!email) missing.push(assigneeEmailVariable(recipient.id))
    return { ...recipient, email }
  })
  return { ok: missing.length === 0, missing, recipients: resolved }
}
