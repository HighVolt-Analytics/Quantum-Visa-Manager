# Booking v2 (not enabled)

This change adds a second booking contract beside the existing v1 API. It does not deploy, does not change production settings, and does not turn any site on.

## Switches

Each public v2 route requires `BOOKING_V2_ENABLED_<SITE>` to be exactly `true` and the browser `Origin` to be listed in `BOOKING_ORIGINS_<SITE>`. Origin is a CORS check. It is not proof of who is calling. Rate limits and Turnstile run on the server before any Graph call.

| Site id | Domain | Switch | Origin variable |
|---|---|---|---|
| `hva` | highvolt.tech | `BOOKING_V2_ENABLED_HVA` | `BOOKING_ORIGINS_HVA` |
| `agent` | quantumagent.com.au | `BOOKING_V2_ENABLED_AGENT` | `BOOKING_ORIGINS_AGENT` |
| `qvm` | quantumvisamanager.com | `BOOKING_V2_ENABLED_QVM` | `BOOKING_ORIGINS_QVM` |
| `ledgerline` | quantumledgerline.com, including `/partnership` | `BOOKING_V2_ENABLED_LEDGERLINE` | `BOOKING_ORIGINS_LEDGERLINE` |
| `edupass` | quantumedupass.com | `BOOKING_V2_ENABLED_EDUPASS` | `BOOKING_ORIGINS_EDUPASS` |

All of those switches are unset in this checkout, so they are off. v1 `POST /api/bookings` and partition `demo` are unchanged. The v1 reconciler only lists partition `demo`.

HVA uses this same v2 flow when `BOOKING_V2_ENABLED_HVA` is exactly `true`. While that switch is off, highvolt.tech keeps its current Microsoft Bookings link and this API writes nothing. Importing appointments that already exist in Microsoft Bookings is a separate follow-up. This change does not read, copy, or modify those appointments.

The visitor selects a country from the ISO 3166-1 list (plus Kosovo). The server stores that country and derives the roster: India, Australia, or Other for every remaining country. Availability takes `country`, not `market`. A market value sent by the browser is ignored. IP geolocation is not used. If it is added later, it may only preselect the country control; the visitor must be able to change it, and the booking must not be submitted from the IP result alone.

## Idempotency

- The same `idempotencyKey` and the same validated body replay the stored booking.
- The same key with a different body returns `idempotency_conflict` and does not create another meeting or email.
- A Teams meeting is created only after a lookup by extended property `HvBookingV2Id` and Graph `transactionId` = booking id.
- `create_unconfirmed` is looked up again by the request and by the v2 reconciler. If the event exists, the booking is adopted. If it does not, the meeting is not submitted again. The public response keeps `meetingStatus: create_unconfirmed` and `attention: create_unconfirmed` for follow-up.
- Staff mail is stored per person on the booking as `pending`, `claimed`, `accepted_by_graph`, `failed`, or `send_unconfirmed`.
- `accepted_by_graph` means Graph accepted `sendMail`. It does not mean the mailbox delivered it.
- `send_unconfirmed` (timeout, HTTP 429, or HTTP 5xx, or a claim that expired) is not retried.
- A definite Graph rejection of mail can be retried until five attempts.
- A definite meeting failure sets the booking to `RELEASED` and deletes the visitor email claim, the person locks, and the Arup slot holds.

Staff mail contains the site, market, time, reference, visitor name, organisation, and a portal link. It does not contain the questionnaire.

## Storage

v2 uses one Azure SQL logical server and five databases: `HVA`, `Agent`, `QVM`, `Ledgerline`, and `EduPass`. Each database holds only that site's bookings, idempotency records, same-site slot claims, visitor email claims, and rate limits. The Function setting is the server hostname `BOOKING_SQL_SERVER`, for example `<server>.database.windows.net`. A connection string, user name, or password is ignored. The API opens the five databases and returns the other sites when one database cannot be read. The portal calls that API and does not connect to SQL.

In Azure the Function app uses its managed identity. Set `AZURE_CLIENT_ID` when that identity is user-assigned. Local development uses `DefaultAzureCredential`. No database password is stored in the Function application settings or the portal.

The Function identity needs a user in each of the five databases, with **db_datareader** and **db_datawriter**. This repository does not create the server, the databases, or those users. `sql/001_site_database.sql` is applied inside each existing database. It does not create the server or the databases.

QVM v1 stays on its existing Table Storage account, table `bookings`, partition `demo`. v2 does not write those rows. The portal shows them read-only.

Host and deployment storage for the v2 Function App stay on `AzureWebJobsStorage__accountName` (the dedicated v2 account). Legacy QVM table reads use a separate setting, `BOOKING_LEGACY_TABLES_ACCOUNT`, with the Function app's managed identity. No storage key or connection string is used. If that setting is missing or the read fails, `GET /api/v2/staff/bookings` reports `legacyReadError` / `legacyMissing` instead of silently returning an empty legacy list.

The same person may be booked at the same time on two sites. Staff and the manager resolve that overlap. A second different submission for an overlapping time on the same site is rejected. The same idempotency key and body replay the stored booking and do not create another meeting or staff email.

Hours are 9:00 am–7:00 pm every day in the visitor's confirmed IANA timezone. The country chooses the roster only. `BOOKING_SLOT_MINUTES`, `BOOKING_NOTICE_MINUTES`, and `BOOKING_HORIZON_DAYS` have no default. Until they are set, availability stays unconfigured.

v2 meetings are organized by `support@highvolt.tech`, and staff notification mail is sent from that mailbox. Assignees and the visitor are calendar invitees. v1 remains on `arup@highvolt.tech`.

Existing Microsoft Bookings appointments are read for the portal only. They are not copied into the five databases and no meeting is created from that list. The business id is `BOOKING_MS_BOOKINGS_BUSINESS_ID`. The application permission is `Bookings.Read.All`. Do not request a Bookings write permission.

Availability is limited to 30 requests per 10 minutes per caller, and booking to 10 per hour, using scopes `v2-availability` and `v2-booking`. These numeric limits are a shared default for all v2 sites (and v1 booking uses the same booking/availability numbers); counters are stored per site database, but there is no per-site override for the limit value. The booking counter is consumed after validation and slot checks, and before Turnstile and email-conflict checks, so failed verification and `already_booked` responses still count. When limited, responses may include `retryAfterSeconds` and a `Retry-After` header. Assignee free/busy is not a reason to hide a slot.

Turnstile hostnames come only from `BOOKING_ORIGINS_<SITE>` for the submitted site. A token whose hostname belongs to another site is rejected. An empty origin list fails closed.

## Placeholders

Assignee addresses, appointment length, notice, horizon, storage accounts, and Graph permission are not assumed. Until the variables below are set, a switched-on site still returns `unconfigured` and writes nothing. The organizer and staff sender are fixed as `support@highvolt.tech`; that mailbox still needs Graph permission before a switch is turned on.

- `BOOKING_ASSIGNEE_LAKSHMI_EMAIL`
- `BOOKING_ASSIGNEE_ARUP_EMAIL`
- `BOOKING_ASSIGNEE_PRACHI_EMAIL`
- `BOOKING_ASSIGNEE_SABINA_EMAIL`
- `BOOKING_ASSIGNEE_JASISCA_EMAIL`
- `BOOKING_ASSIGNEE_KHUSHI_EMAIL`
- `BOOKING_SQL_SERVER` (hostname only; databases `HVA`, `Agent`, `QVM`, `Ledgerline`, `EduPass`)
- db_datareader and db_datawriter for the Function identity in each of those databases
- `BOOKING_LEGACY_TABLES_ACCOUNT` (existing v1 QVM Table Storage account name only) for the portal's read-only legacy QVM list
- Storage Table Data Reader on that v1 account for the v2 Function managed identity (`id-bookings-v2-func-prod`)
- `Bookings.Read.All` application permission for the read-only Microsoft Bookings list. Do not add a Bookings write permission.
- `BOOKING_SLOT_MINUTES`
- `BOOKING_NOTICE_MINUTES`
- `BOOKING_HORIZON_DAYS`
- `BOOKINGS_PORTAL_BASE_URL`
- `BOOKING_HASH_KEY` (already used by v1)
- `BOOKING_MS_BOOKINGS_BUSINESS_ID` for the read-only Microsoft Bookings list
- `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`, `TURNSTILE_ACTION` before a site is switched on
- `BOOKINGS_PORTAL_API_TOKEN` for staff reads

QVM keeps its practice state question. The selected country, not that state, chooses the roster. India is available on every form, including QVM.

## Legacy notes

`GET /api/v2/staff/legacy-notes/{bookingId}` reads the existing private calendar note for that v1 booking id. It does not create, update, or copy meetings. If the note was never written, the response is `not_found`.

## Meeting lookup (staff diagnostic)

`GET /api/v2/staff/meeting-lookup/{bookingId}` requires the same `Authorization: Bearer` staff token as other staff routes (`BOOKINGS_PORTAL_API_TOKEN`). It runs the same Graph `findByBooking` lookup used before meeting creation against `support@highvolt.tech`. It does not create events, send mail, or read or write SQL. The JSON body reports only `found`, `httpStatus`, and `graphCode`.

## Frontend gate

Marketing sites call v2 only when `VITE_BOOKING_V2_ENABLED` is exactly `true` at build time. That variable is not set. v2 availability and booking requests use `VITE_BOOKING_V2_API_BASE`; v1 keeps `VITE_BOOKING_API_BASE`. Otherwise they keep posting to v1 and keep the Sydney calendar.

When v2 is on, availability returns `timeZone`, `openWeekdays`, and `horizonDays`. The booking pages label slots and the confirmation in that zone and build the date list from `openWeekdays`, including Saturday when that day is configured.

`lib/websites.ts` in the deployment portal maps `quantumedupass.com` to `HighVolt-Analytics/Quantum-Edupass`. HVA's v2 switch stays off. The public HVA site keeps the Microsoft Bookings link until that switch is turned on. Existing Microsoft Bookings appointments are shown read-only and are not imported.
