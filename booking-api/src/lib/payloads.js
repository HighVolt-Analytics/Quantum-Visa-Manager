import { BOOKING_PROPERTY_ID, CALENDAR_MAILBOX, NOTE_PROPERTY_ID } from './config.js'
import { graphTimes, slotFromStart, slotLabel } from './schedule.js'

/**
 * The invitation the customer receives. It must never contain questionnaire answers:
 * only the time, an opaque reference and the Teams link Exchange adds.
 */
export function customerEventPayload(booking) {
  const slot = slotFromStart(booking.slotStart)
  return {
    subject: 'Quantum Visa Manager demonstration',
    body: {
      contentType: 'text',
      content: [
        'Your 30-minute Quantum Visa Manager demonstration with High Volt Analytics.',
        `Time: ${slotLabel(slot)}`,
        `Reference: ${booking.reference}`,
        'Join with the Microsoft Teams link in this invitation. To change or cancel, reply to this invitation or email hello@highvolt.tech.',
      ].join('\n'),
    },
    ...graphTimes(slot),
    attendees: [
      { emailAddress: { address: booking.attendeeEmail, name: booking.attendeeName }, type: 'required' },
    ],
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: false,
    responseRequested: true,
    showAs: 'busy',
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    transactionId: booking.bookingId,
    singleValueExtendedProperties: [{ id: BOOKING_PROPERTY_ID, value: booking.bookingId }],
  }
}

/** Private, attendee-free calendar item for Arup. No attendees means no message is sent. */
export function privateNotePayload(booking, answers) {
  const slot = slotFromStart(booking.slotStart)
  const noteId = `${booking.bookingId}-note`
  const lines = [
    `Book a Demo request ${booking.reference}`,
    `Time: ${slotLabel(slot)}`,
    '',
    `Name: ${answers.first} ${answers.last}`,
    `Work email: ${answers.email}`,
    `Phone: ${answers.phone || 'not given'}`,
    `Practice or company: ${answers.org}`,
    `State or territory: ${answers.state}`,
    `Practice size: ${answers.size}`,
    `Current system: ${answers.system}${answers.systemName ? ` (${answers.systemName})` : ''}`,
    `Biggest bottleneck: ${answers.bottleneck}`,
    `Contact consent given: ${booking.consentAt || 'yes'}`,
    '',
    `The customer's Teams invitation is a separate event in ${CALENDAR_MAILBOX}'s calendar.`,
  ]
  return {
    subject: `QVM demo prep: ${answers.org}`,
    body: { contentType: 'text', content: lines.join('\n') },
    ...graphTimes(slot),
    attendees: [],
    sensitivity: 'private',
    showAs: 'free',
    isReminderOn: false,
    transactionId: noteId,
    singleValueExtendedProperties: [{ id: NOTE_PROPERTY_ID, value: noteId }],
  }
}
