import { resolveCountry } from './countries.js'

/**
 * Assignment market comes only from the visitor's selected country.
 * India uses the India roster, Australia the Australia roster, and every other country the Other roster.
 * A market field on the request is ignored.
 */
export function deriveMarket(_site, answers) {
  const a = answers && typeof answers === 'object' ? answers : {}
  const resolved = resolveCountry(a.countryCode || a.country)
  if (!resolved) return { ok: false, fields: ['country'] }
  return { ok: true, market: resolved.market, country: resolved.name, countryCode: resolved.code }
}
