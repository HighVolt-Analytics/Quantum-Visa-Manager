/**
 * ISO 3166-1 alpha-2 countries and territories, plus XK (Kosovo), which visitors can select.
 * English names come from Intl so the stored country is the canonical name for that code.
 * IP address is never read here. A browser-supplied market is not accepted.
 */
export const COUNTRY_CODES = Object.freeze(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' '),
)

const CODE_SET = new Set(COUNTRY_CODES)
let catalog = null

function namesByCode() {
  if (catalog) return catalog
  const display = new Intl.DisplayNames(['en'], { type: 'region' })
  catalog = new Map()
  for (const code of COUNTRY_CODES) {
    const name = display.of(code)
    if (typeof name === 'string' && name && name !== code) catalog.set(code, name)
  }
  return catalog
}

export function countryOptions() {
  return [...namesByCode().entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** Accepts an ISO code or the canonical English name. Returns null for anything else. */
export function resolveCountry(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const names = namesByCode()
  const upper = raw.toUpperCase()
  const code = CODE_SET.has(upper) && names.has(upper)
    ? upper
    : [...names.entries()].find(([, name]) => name === raw)?.[0]
  if (!code) return null
  const market = code === 'IN' ? 'india' : code === 'AU' ? 'australia' : 'other'
  return { code, name: names.get(code), market }
}
