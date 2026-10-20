import { ConflictError, PreconditionError } from '../../src/lib/tableStore.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))

/**
 * In-memory stand-in for AzureTableStore with the same semantics that matter here:
 * atomic all-or-nothing batch inserts, 409 on duplicate keys and ETag-guarded updates.
 * Every call yields to the event loop so concurrent callers genuinely interleave.
 */
export class MemoryTableStore {
  constructor() {
    this.tables = new Map()
    this.version = 0
  }

  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)
  }

  key(pk, rk) {
    return `${pk}\u0000${rk}`
  }

  etag() {
    return `W/"${++this.version}"`
  }

  async get(table, pk, rk) {
    await tick()
    const e = this.table(table).get(this.key(pk, rk))
    return e ? structuredClone(e) : null
  }

  async create(table, entity) {
    await tick()
    const m = this.table(table)
    const k = this.key(entity.partitionKey, entity.rowKey)
    if (m.has(k)) throw new ConflictError()
    const etag = this.etag()
    m.set(k, { ...structuredClone(entity), etag })
    return etag
  }

  async createAll(table, entities) {
    await tick()
    const m = this.table(table)
    const pks = new Set(entities.map((e) => e.partitionKey))
    if (pks.size !== 1) throw new Error('Batch entities must share a PartitionKey')
    const keys = entities.map((e) => this.key(e.partitionKey, e.rowKey))
    if (new Set(keys).size !== keys.length || keys.some((k) => m.has(k))) throw new ConflictError()
    entities.forEach((e, i) => m.set(keys[i], { ...structuredClone(e), etag: this.etag() }))
  }

  async update(table, entity, etag) {
    await tick()
    const m = this.table(table)
    const k = this.key(entity.partitionKey, entity.rowKey)
    const current = m.get(k)
    if (!current || (etag !== '*' && current.etag !== etag)) throw new PreconditionError()
    const next = { ...current, ...structuredClone(entity), etag: this.etag() }
    m.set(k, next)
    return next.etag
  }

  async delete(table, pk, rk, etag = '*') {
    await tick()
    const m = this.table(table)
    const k = this.key(pk, rk)
    const current = m.get(k)
    if (!current) return
    if (etag !== '*' && current.etag !== etag) throw new PreconditionError()
    m.delete(k)
  }

  async *list(table, pk, from, to) {
    await tick()
    const rows = [...this.table(table).values()]
      .filter((e) => e.partitionKey === pk && e.rowKey >= from && e.rowKey < to)
      .sort((a, b) => (a.rowKey < b.rowKey ? -1 : 1))
    for (const row of rows) yield structuredClone(row)
  }

  rows(table, prefix = '') {
    return [...this.table(table).values()].filter((e) => e.rowKey.startsWith(prefix))
  }
}
