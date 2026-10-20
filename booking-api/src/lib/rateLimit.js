import { RATELIMITS_TABLE } from './config.js'
import { ConflictError, PreconditionError } from './tableStore.js'

/** Fixed-window counter in Table Storage. Denies under persistent contention rather than allowing. */
export async function consumeRateLimit(store, { scope, subject, limit, windowMs, now }) {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs
  const partitionKey = scope
  const rowKey = `${subject}_${windowStart}`
  // Each contention round lets at least one caller through, so this covers bursts of up to 10.
  for (let i = 0; i < 10; i++) {
    const row = await store.get(RATELIMITS_TABLE, partitionKey, rowKey)
    if (!row) {
      try {
        await store.create(RATELIMITS_TABLE, { partitionKey, rowKey, count: 1, windowStart })
        return { allowed: limit >= 1 }
      } catch (err) {
        if (err instanceof ConflictError) continue
        throw err
      }
    }
    if (row.count >= limit) return { allowed: false }
    try {
      await store.update(RATELIMITS_TABLE, { partitionKey, rowKey, count: row.count + 1 }, row.etag)
      return { allowed: true }
    } catch (err) {
      if (err instanceof PreconditionError) continue
      throw err
    }
  }
  return { allowed: false }
}

export async function pruneRateLimits(store, { scopes, olderThanMs, now }) {
  let removed = 0
  const cutoff = now.getTime() - olderThanMs
  for (const scope of scopes) {
    for await (const row of store.list(RATELIMITS_TABLE, scope, '', '~')) {
      if (Number(row.windowStart) < cutoff) {
        await store.delete(RATELIMITS_TABLE, scope, row.rowKey, row.etag).catch(() => {})
        removed++
      }
    }
  }
  return removed
}
