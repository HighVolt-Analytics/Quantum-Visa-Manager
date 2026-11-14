import { RATELIMITS_TABLE } from './config.js'
import { ConflictError, PreconditionError } from './tableStore.js'

/** Fixed-window counter in Table Storage. Denies under persistent contention rather than allowing. */
export async function consumeRateLimit(store, { scope, subject, limit, windowMs, now, table = RATELIMITS_TABLE }) {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs
  const partitionKey = scope
  const rowKey = `${subject}_${windowStart}`
  // Each contention round lets at least one caller through, so this covers bursts of up to 10.
  for (let i = 0; i < 10; i++) {
    const row = await store.get(table, partitionKey, rowKey)
    if (!row) {
      try {
        await store.create(table, { partitionKey, rowKey, count: 1, windowStart })
        return { allowed: limit >= 1 }
      } catch (err) {
        if (err instanceof ConflictError) continue
        throw err
      }
    }
    if (row.count >= limit) return { allowed: false }
    try {
      await store.update(table, { partitionKey, rowKey, count: row.count + 1 }, row.etag)
      return { allowed: true }
    } catch (err) {
      if (err instanceof PreconditionError) continue
      throw err
    }
  }
  return { allowed: false }
}

export async function pruneRateLimits(store, { scopes, olderThanMs, now, table = RATELIMITS_TABLE }) {
  let removed = 0
  const cutoff = now.getTime() - olderThanMs
  for (const scope of scopes) {
    for await (const row of store.list(table, scope, '', '~')) {
      if (Number(row.windowStart) < cutoff) {
        await store.delete(table, scope, row.rowKey, row.etag).catch(() => {})
        removed++
      }
    }
  }
  return removed
}
