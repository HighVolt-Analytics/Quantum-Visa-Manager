export const MAIL = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  ACCEPTED: 'accepted_by_graph',
  FAILED: 'failed',
  UNCONFIRMED: 'send_unconfirmed',
})

export const MAX_MAIL_ATTEMPTS = 5
export const MAIL_CLAIM_GRACE_MS = 2 * 60 * 1000

export function initialNotify(recipients) {
  const notify = {}
  for (const recipient of recipients) {
    notify[recipient.id] = {
      personId: recipient.id,
      role: recipient.role,
      status: MAIL.PENDING,
      attempts: 0,
      claimedAt: '',
    }
  }
  return notify
}

/**
 * pending/failed (under the attempt cap) may send.
 * claimed-and-fresh, accepted_by_graph, and send_unconfirmed never send.
 * An expired claim becomes send_unconfirmed instead of sending again.
 */
export function mailAction(entry, nowMs, graceMs = MAIL_CLAIM_GRACE_MS) {
  if (!entry) return 'skip'
  if (entry.status === MAIL.ACCEPTED || entry.status === MAIL.UNCONFIRMED) return 'skip'
  if (entry.status === MAIL.CLAIMED) {
    const age = nowMs - Date.parse(entry.claimedAt || 0)
    return age >= graceMs ? 'expire' : 'skip'
  }
  if (entry.status === MAIL.FAILED && (entry.attempts || 0) >= MAX_MAIL_ATTEMPTS) return 'skip'
  if (entry.status === MAIL.PENDING || entry.status === MAIL.FAILED) return 'send'
  return 'skip'
}

export function summarizeNotify(notify) {
  const counts = { pending: 0, claimed: 0, accepted_by_graph: 0, failed: 0, send_unconfirmed: 0 }
  for (const entry of Object.values(notify || {})) {
    if (counts[entry.status] !== undefined) counts[entry.status] += 1
  }
  return counts
}

/** Staff mail is a short summary plus a portal link. Questionnaire answers stay out of the message. */
export function staffMailBody({ site, market, reference, slotLabel: when, attendeeName, organization, portalUrl }) {
  return [
    `Demo request ${reference}`,
    `Site: ${site}`,
    `Market: ${market}`,
    `When: ${when}`,
    `Visitor: ${attendeeName}`,
    `Organisation: ${organization}`,
    `Open the protected booking: ${portalUrl}`,
    'This message does not include the questionnaire. Graph accepting this send is not delivery confirmation.',
  ].join('\n')
}
