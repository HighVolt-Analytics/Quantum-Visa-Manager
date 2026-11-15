import { randomBytes } from 'node:crypto'
import { V2_RATELIMITS_TABLE } from './config.js'
import { ConflictError, PreconditionError } from '../tableStore.js'

const BOOKING_COLUMNS = {
  bookingId: 'booking_id',
  site: 'site',
  source: 'source',
  market: 'market',
  reference: 'reference',
  slotStart: 'slot_start',
  slotEnd: 'slot_end',
  slotDate: 'slot_date',
  slotLabel: 'slot_label',
  timeZone: 'time_zone',
  attendeeName: 'attendee_name',
  attendeeEmail: 'attendee_email',
  organization: 'organization',
  answersOriginal: 'answers_original',
  invitees: 'invitees',
  requestHash: 'request_hash',
  fingerprint: 'fingerprint',
  emailHash: 'email_hash',
  state: 'state',
  meetingStatus: 'meeting_status',
  eventId: 'event_id',
  staffNotify: 'staff_notify',
  createdAt: 'created_at',
}

function newEtag() {
  return randomBytes(16).toString('hex')
}

/**
 * One site database. Constructing the store does not connect or create a database.
 * Queries use the managed-identity token and never include a SQL password.
 */
export class SqlSiteStore {
  constructor({ site, server, database, credential, execute = null }) {
    this.site = site
    this.server = server
    this.database = database
    this.credential = credential
    this.execute = execute
    this.connected = false
    this.pool = null
    this.poolToken = null
  }

  async resetPool() {
    const pool = this.pool
    this.pool = null
    this.poolToken = null
    this.connected = false
    if (pool) await pool.close().catch(() => {})
  }

  async get(table, partitionKey, rowKey) {
    const statement = this.selectStatement(table, partitionKey, rowKey)
    if (!statement) return null
    const result = await this.query({ transaction: false, statements: [statement] })
    const row = result.rows?.[0]
    return row ? this.toEntity(table, row) : null
  }

  async create(table, entity) {
    await this.query({ transaction: false, statements: [this.insertStatement(table, entity)] })
    return entity.etag
  }

  async createAll(_table, entities) {
    await this.query({
      transaction: true,
      statements: entities.map((entity) => this.insertStatement(_table, entity)),
    })
  }

  async update(table, entity, etag) {
    const statement = this.updateStatement(table, entity, etag)
    const result = await this.query({ transaction: false, statements: [statement] })
    if (!(result.rowsAffected?.[0] > 0)) throw new PreconditionError()
    return statement.params.etag
  }

  async delete(table, partitionKey, rowKey, etag = '*') {
    const statement = this.deleteStatement(table, partitionKey, rowKey, etag)
    if (!statement) return
    const result = await this.query({ transaction: false, statements: [statement] })
    if (etag !== '*' && !(result.rowsAffected?.[0] > 0)) throw new PreconditionError()
  }

  async *list(table, partitionKey, fromRowKey, toRowKey) {
    const statement = this.listStatement(table, partitionKey, fromRowKey)
    const result = await this.query({ transaction: false, statements: [statement] })
    for (const row of result.rows || []) {
      const entity = this.toEntity(table, row)
      if (!entity) continue
      if (entity.rowKey >= fromRowKey && entity.rowKey < toRowKey) yield entity
    }
  }

  async query(batch) {
    try {
      if (this.execute) return await this.execute(batch)
      return await this.runMssql(batch)
    } catch (err) {
      if (err instanceof ConflictError || err instanceof PreconditionError) throw err
      if (err?.number === 2627 || err?.number === 2601) throw new ConflictError()
      if (err?.code === 'sql_unavailable') throw err
      const wrapped = new Error('sql_unavailable')
      wrapped.code = 'sql_unavailable'
      throw wrapped
    }
  }

  async ensurePool() {
    if (this.pool?.connected) return this.pool
    const credential = this.credential
    const token = credential ? await credential.getToken('https://database.windows.net/.default') : null
    if (!token?.token) {
      const err = new Error('sql_token')
      err.code = 'sql_unavailable'
      throw err
    }
    const sql = (await import('mssql')).default
    const pool = new sql.ConnectionPool({
      server: this.server,
      database: this.database,
      connectionTimeout: 5000,
      requestTimeout: 8000,
      options: { encrypt: true, trustServerCertificate: false },
      authentication: {
        type: 'azure-active-directory-access-token',
        options: { token: token.token },
      },
    })
    await pool.connect()
    this.pool = pool
    this.poolToken = token.token
    this.connected = true
    return pool
  }

  async runMssql(batch) {
    try {
      const pool = await this.ensurePool()
      if (!batch.transaction) return await executeStatement(pool, batch.statements[0])
      const sql = (await import('mssql')).default
      const tx = new sql.Transaction(pool)
      await tx.begin()
      try {
        let result = { rows: [], rowsAffected: [0] }
        for (const statement of batch.statements) result = await executeStatement(tx, statement)
        await tx.commit()
        return result
      } catch (err) {
        await tx.rollback().catch(() => {})
        throw err
      }
    } catch (err) {
      await this.resetPool()
      if (err?.code === 'sql_unavailable') throw err
      if (err?.name === 'ConnectionError' || err?.code === 'ETIMEOUT' || err?.number === -2) {
        const wrapped = new Error('sql_unavailable')
        wrapped.code = 'sql_unavailable'
        throw wrapped
      }
      throw err
    }
  }

  insertStatement(table, entity) {
    const etag = newEtag()
    if (table === V2_RATELIMITS_TABLE) {
      return {
        sql: 'INSERT INTO rate_limits (scope, subject_key, window_start, hit_count, etag) VALUES (@scope, @subjectKey, @windowStart, @count, @etag)',
        params: { scope: entity.partitionKey, subjectKey: entity.rowKey, windowStart: entity.windowStart, count: entity.count, etag },
      }
    }
    if (entity.kind === 'request' || String(entity.rowKey || '').startsWith('req_')) {
      return {
        sql: 'INSERT INTO idempotency (request_hash, booking_id, fingerprint, etag) VALUES (@requestHash, @bookingId, @fingerprint, @etag)',
        params: { requestHash: entity.requestHash || String(entity.rowKey).slice(4), bookingId: entity.bookingId, fingerprint: entity.fingerprint, etag },
      }
    }
    if (entity.kind === 'email' || String(entity.rowKey || '').startsWith('email_')) {
      return {
        sql: 'INSERT INTO email_claims (email_hash, booking_id, slot_start, etag) VALUES (@emailHash, @bookingId, @slotStart, @etag)',
        params: { emailHash: String(entity.rowKey).slice(6), bookingId: entity.bookingId, slotStart: entity.slotStart, etag },
      }
    }
    if (entity.kind === 'site-slot' || String(entity.rowKey || '').startsWith('slot_')) {
      return {
        sql: `INSERT INTO slot_claims (slot_key, booking_id, request_hash, fingerprint, slot_start, slot_end, expires_at, etag)
              VALUES (@slotKey, @bookingId, @requestHash, @fingerprint, @slotStart, @slotEnd, @expiresAt, @etag)`,
        params: {
          slotKey: entity.rowKey,
          bookingId: entity.bookingId,
          requestHash: entity.requestHash,
          fingerprint: entity.fingerprint,
          slotStart: entity.slotStart,
          slotEnd: entity.slotEnd,
          expiresAt: entity.expiresAt,
          etag,
        },
      }
    }
    const columns = ['booking_id', 'etag']
    const values = ['@bookingId', '@etag']
    const params = { bookingId: entity.bookingId || String(entity.rowKey).slice(4), etag }
    for (const [field, column] of Object.entries(BOOKING_COLUMNS)) {
      if (field === 'bookingId' || entity[field] === undefined) continue
      columns.push(column)
      values.push(`@${field}`)
      params[field] = entity[field]
    }
    return { sql: `INSERT INTO bookings (${columns.join(', ')}) VALUES (${values.join(', ')})`, params }
  }

  updateStatement(table, entity, etag) {
    const next = newEtag()
    if (table === V2_RATELIMITS_TABLE) {
      return {
        sql: 'UPDATE rate_limits SET hit_count = @count, etag = @etag WHERE scope = @scope AND subject_key = @subjectKey AND etag = @expected',
        params: { count: entity.count, etag: next, scope: entity.partitionKey, subjectKey: entity.rowKey, expected: etag },
      }
    }
    if (String(entity.rowKey || '').startsWith('slot_')) {
      const assignments = ['etag = @etag']
      const params = { etag: next, slotKey: entity.rowKey, expected: etag }
      if (entity.expiresAt !== undefined) {
        assignments.push('expires_at = @expiresAt')
        params.expiresAt = entity.expiresAt
      }
      return {
        sql: `UPDATE slot_claims SET ${assignments.join(', ')} WHERE slot_key = @slotKey AND etag = @expected`,
        params,
      }
    }
    const assignments = ['etag = @etag']
    const params = { etag: next, bookingId: entity.bookingId || String(entity.rowKey || '').slice(4), expected: etag }
    for (const [field, column] of Object.entries(BOOKING_COLUMNS)) {
      if (field === 'bookingId' || entity[field] === undefined) continue
      assignments.push(`${column} = @${field}`)
      params[field] = entity[field]
    }
    return {
      sql: `UPDATE bookings SET ${assignments.join(', ')} WHERE booking_id = @bookingId AND etag = @expected`,
      params,
    }
  }

  selectStatement(table, partitionKey, rowKey) {
    if (table === V2_RATELIMITS_TABLE) {
      return {
        sql: 'SELECT scope, subject_key, window_start, hit_count, etag FROM rate_limits WHERE scope = @scope AND subject_key = @subjectKey',
        params: { scope: partitionKey, subjectKey: rowKey },
      }
    }
    if (rowKey.startsWith('req_')) {
      return {
        sql: 'SELECT request_hash, booking_id, fingerprint, etag FROM idempotency WHERE request_hash = @requestHash',
        params: { requestHash: rowKey.slice(4) },
      }
    }
    if (rowKey.startsWith('email_')) {
      return {
        sql: 'SELECT email_hash, booking_id, slot_start, etag FROM email_claims WHERE email_hash = @emailHash',
        params: { emailHash: rowKey.slice(6) },
      }
    }
    if (rowKey.startsWith('slot_')) {
      return {
        sql: 'SELECT slot_key, booking_id, request_hash, fingerprint, slot_start, slot_end, expires_at, etag FROM slot_claims WHERE slot_key = @slotKey',
        params: { slotKey: rowKey },
      }
    }
    if (rowKey.startsWith('bkg_')) {
      return {
        sql: `SELECT ${Object.values(BOOKING_COLUMNS).join(', ')}, etag FROM bookings WHERE booking_id = @bookingId`,
        params: { bookingId: rowKey.slice(4) },
      }
    }
    return null
  }

  deleteStatement(table, partitionKey, rowKey, etag) {
    const expected = etag === '*' ? '' : ' AND etag = @expected'
    const params = { expected: etag }
    if (table === V2_RATELIMITS_TABLE) {
      return { sql: `DELETE FROM rate_limits WHERE scope = @scope AND subject_key = @subjectKey${expected}`, params: { ...params, scope: partitionKey, subjectKey: rowKey } }
    }
    if (rowKey.startsWith('req_')) return { sql: `DELETE FROM idempotency WHERE request_hash = @requestHash${expected}`, params: { ...params, requestHash: rowKey.slice(4) } }
    if (rowKey.startsWith('email_')) return { sql: `DELETE FROM email_claims WHERE email_hash = @emailHash${expected}`, params: { ...params, emailHash: rowKey.slice(6) } }
    if (rowKey.startsWith('slot_')) return { sql: `DELETE FROM slot_claims WHERE slot_key = @slotKey${expected}`, params: { ...params, slotKey: rowKey } }
    if (rowKey.startsWith('bkg_')) return { sql: `DELETE FROM bookings WHERE booking_id = @bookingId${expected}`, params: { ...params, bookingId: rowKey.slice(4) } }
    return null
  }

  listStatement(table, partitionKey, fromRowKey) {
    if (table === V2_RATELIMITS_TABLE) {
      return {
        sql: 'SELECT scope, subject_key, window_start, hit_count, etag FROM rate_limits WHERE scope = @scope',
        params: { scope: partitionKey },
      }
    }
    if (String(fromRowKey).startsWith('slot_')) {
      return {
        sql: 'SELECT slot_key, booking_id, request_hash, fingerprint, slot_start, slot_end, expires_at, etag FROM slot_claims',
        params: {},
      }
    }
    if (String(fromRowKey).startsWith('req_')) {
      return {
        sql: 'SELECT request_hash, booking_id, fingerprint, etag FROM idempotency',
        params: {},
      }
    }
    if (String(fromRowKey).startsWith('email_')) {
      return {
        sql: 'SELECT email_hash, booking_id, slot_start, etag FROM email_claims',
        params: {},
      }
    }
    return {
      sql: `SELECT ${Object.values(BOOKING_COLUMNS).join(', ')}, etag FROM bookings WHERE site = @site`,
      params: { site: partitionKey },
    }
  }

  toEntity(table, row) {
    if (table === V2_RATELIMITS_TABLE) {
      return {
        partitionKey: row.scope,
        rowKey: row.subject_key,
        count: row.hit_count,
        windowStart: Number(row.window_start),
        etag: row.etag,
      }
    }
    if (row.slot_key) return this.slotEntity(row)
    // Bookings also store email_hash / request_hash. Classify email and idempotency
    // rows only when booking fields (time_zone) are absent; otherwise staff get and
    // post-createAll reload return a booking without site and patch throws TypeError.
    if (row.email_hash && !row.time_zone) {
      return {
        partitionKey: this.site,
        rowKey: `email_${row.email_hash}`,
        kind: 'email',
        bookingId: row.booking_id,
        slotStart: row.slot_start,
        etag: row.etag,
      }
    }
    if (row.request_hash && !row.time_zone) {
      return {
        partitionKey: this.site,
        rowKey: `req_${row.request_hash}`,
        kind: 'request',
        bookingId: row.booking_id,
        requestHash: row.request_hash,
        fingerprint: row.fingerprint,
        etag: row.etag,
      }
    }
    if (!row.booking_id) return null
    return {
      partitionKey: row.site || this.site,
      rowKey: `bkg_${row.booking_id}`,
      kind: 'booking',
      bookingId: row.booking_id,
      site: row.site,
      source: row.source,
      market: row.market,
      reference: row.reference,
      slotStart: row.slot_start,
      slotEnd: row.slot_end,
      slotDate: row.slot_date,
      slotLabel: row.slot_label,
      timeZone: row.time_zone,
      attendeeName: row.attendee_name,
      attendeeEmail: row.attendee_email,
      organization: row.organization,
      answersOriginal: row.answers_original,
      invitees: row.invitees,
      requestHash: row.request_hash,
      fingerprint: row.fingerprint,
      emailHash: row.email_hash,
      state: row.state,
      meetingStatus: row.meeting_status,
      eventId: row.event_id,
      staffNotify: row.staff_notify,
      createdAt: row.created_at,
      etag: row.etag,
    }
  }

  slotEntity(row) {
    return {
      partitionKey: this.site,
      rowKey: row.slot_key,
      kind: 'site-slot',
      bookingId: row.booking_id,
      site: this.site,
      requestHash: row.request_hash,
      fingerprint: row.fingerprint,
      slotStart: row.slot_start,
      slotEnd: row.slot_end,
      expiresAt: row.expires_at,
      etag: row.etag,
    }
  }
}

async function executeStatement(parent, statement) {
  const request = parent.request()
  for (const [key, value] of Object.entries(statement.params || {})) request.input(key, value ?? null)
  const result = await request.query(statement.sql)
  return { rows: result.recordset || [], rowsAffected: result.rowsAffected || [] }
}
