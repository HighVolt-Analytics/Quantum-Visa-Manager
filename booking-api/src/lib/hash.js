import { createHash, createHmac, randomUUID } from 'node:crypto'

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacHex(key, value) {
  return createHmac('sha256', key).update(value).digest('hex')
}

export function newBookingId() {
  return randomUUID()
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Short customer-facing reference derived from the booking ID. Reveals nothing about the customer. */
export function bookingReference(bookingId) {
  const digest = createHash('sha256').update(bookingId).digest()
  let out = ''
  for (let i = 0; i < 6; i++) out += ALPHABET[digest[i] % ALPHABET.length]
  return `QVM-${out}`
}
