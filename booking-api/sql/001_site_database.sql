-- Apply this script inside each existing database: HVA, Agent, QVM, Ledgerline, and EduPass.
-- It does not create the logical server, the databases, or a database user.
-- The Function app identity needs a user in each database, with db_datareader and db_datawriter.
-- Do not store a SQL password or connection string in application settings.

IF OBJECT_ID(N'dbo.bookings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.bookings (
    booking_id nvarchar(36) NOT NULL CONSTRAINT pk_bookings PRIMARY KEY,
    site nvarchar(32) NOT NULL,
    source nvarchar(32) NOT NULL,
    market nvarchar(32) NOT NULL,
    reference nvarchar(64) NOT NULL,
    slot_start nvarchar(40) NOT NULL,
    slot_end nvarchar(40) NOT NULL,
    slot_date nvarchar(10) NOT NULL,
    slot_label nvarchar(120) NOT NULL,
    time_zone nvarchar(80) NOT NULL,
    attendee_name nvarchar(200) NOT NULL,
    attendee_email nvarchar(320) NOT NULL,
    organization nvarchar(200) NOT NULL,
    answers_original nvarchar(max) NOT NULL,
    invitees nvarchar(max) NOT NULL,
    request_hash nvarchar(64) NOT NULL,
    fingerprint nvarchar(128) NOT NULL,
    email_hash nvarchar(128) NOT NULL,
    state nvarchar(32) NOT NULL,
    meeting_status nvarchar(40) NOT NULL,
    event_id nvarchar(200) NOT NULL CONSTRAINT df_bookings_event_id DEFAULT N'',
    staff_notify nvarchar(max) NOT NULL,
    created_at nvarchar(40) NOT NULL,
    etag nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.idempotency', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.idempotency (
    request_hash nvarchar(64) NOT NULL CONSTRAINT pk_idempotency PRIMARY KEY,
    booking_id nvarchar(36) NOT NULL,
    fingerprint nvarchar(128) NOT NULL,
    etag nvarchar(40) NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.slot_claims', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.slot_claims (
    slot_key nvarchar(80) NOT NULL CONSTRAINT pk_slot_claims PRIMARY KEY,
    booking_id nvarchar(36) NOT NULL,
    request_hash nvarchar(64) NOT NULL,
    fingerprint nvarchar(128) NOT NULL,
    slot_start nvarchar(40) NOT NULL,
    slot_end nvarchar(40) NOT NULL,
    expires_at nvarchar(40) NOT NULL,
    etag nvarchar(40) NOT NULL
  );
END;

-- Visitor email claims stay in the same site database so a retry cannot book that visitor twice.
IF OBJECT_ID(N'dbo.email_claims', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.email_claims (
    email_hash nvarchar(128) NOT NULL CONSTRAINT pk_email_claims PRIMARY KEY,
    booking_id nvarchar(36) NOT NULL,
    slot_start nvarchar(40) NOT NULL,
    etag nvarchar(40) NOT NULL
  );
END;

-- Rate limits stay in the same site database. They are not written to the v1 table account.
IF OBJECT_ID(N'dbo.rate_limits', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rate_limits (
    scope nvarchar(64) NOT NULL,
    subject_key nvarchar(80) NOT NULL,
    window_start bigint NOT NULL,
    hit_count int NOT NULL,
    etag nvarchar(40) NOT NULL,
    CONSTRAINT pk_rate_limits PRIMARY KEY (scope, subject_key)
  );
END;
