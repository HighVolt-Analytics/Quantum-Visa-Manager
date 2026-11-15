# HighVolt (`site=hva`) booking API readiness

## Support status
- Site id `hva` is in the roster, SQL map (`HVA` database), and public gate.
- Production stays off unless `BOOKING_V2_ENABLED_HVA` is exactly `true`.
- Public staff selection is not offered; assignees come from the market roster.

## Contracts
- `GET /api/v2/availability?site=hva&country=&timeZone=`
- `POST /api/v2/bookings` with `site`, `idempotencyKey`, `slotStart`, `timeZone`, `turnstileToken`, `answers`
- HighVolt answers emphasize `first`, `last`, `email`, `phone`, `address`, `specialRequests`, `country`, `consent`

## Required Function App setting names (values not listed)
- `BOOKING_V2_ENABLED_HVA`
- `BOOKING_ORIGINS_HVA`
- `BOOKING_SQL_SERVER`
- `BOOKING_SLOT_MINUTES` (30 for HighVolt demo)
- `BOOKING_NOTICE_MINUTES`
- `BOOKING_HORIZON_DAYS`
- `BOOKING_HASH_KEY`
- `BOOKINGS_PORTAL_BASE_URL`
- `BOOKINGS_PORTAL_API_TOKEN`
- `BOOKING_ASSIGNEE_ARUP_EMAIL` (and other roster people as needed)
- `AZURE_CLIENT_ID` (managed identity Graph)
- Turnstile secrets already used by v1/v2 (`TURNSTILE_*`)

## Database
- Dedicated Azure SQL database name: `HVA` on the shared logical server.
- Apply `booking-api/sql/001_site_database.sql` inside `HVA`.
- Grant the Function App managed identity `db_datareader` and `db_datawriter`.
