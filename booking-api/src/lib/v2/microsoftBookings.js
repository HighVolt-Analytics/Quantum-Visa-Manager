/**
 * Read-only view of appointments that already exist in Microsoft Bookings.
 * Application access is Bookings.Read.All. This module has no create, update,
 * or delete call and does not use a Bookings write permission.
 */

export function presentAppointment(item) {
  const start = item?.startDateTime?.dateTime || item?.start || ''
  const end = item?.endDateTime?.dateTime || item?.end || ''
  return {
    source: 'microsoft-bookings',
    readOnly: true,
    appointmentId: item?.id || '',
    serviceName: item?.serviceName || '',
    customerName: item?.customerName || '',
    start,
    end,
  }
}

export async function readMicrosoftBookings({ businessId, getToken, fetchImpl = fetch }) {
  if (!businessId) {
    return { configured: false, readOnly: true, missing: ['BOOKING_MS_BOOKINGS_BUSINESS_ID'], appointments: [] }
  }
  if (!getToken) {
    return { configured: false, readOnly: true, missing: ['AZURE_CLIENT_ID'], appointments: [] }
  }
  const token = await getToken()
  const url = `https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments?$top=100`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (!res.ok) {
    return { configured: true, readOnly: true, error: 'read_failed', appointments: [] }
  }
  const body = await res.json()
  const appointments = Array.isArray(body?.value) ? body.value.map(presentAppointment) : []
  return { configured: true, readOnly: true, appointments }
}
