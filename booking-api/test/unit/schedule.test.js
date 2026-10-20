import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { candidateSlots, findSlot, graphTimes, slotRowKey } from '../../src/lib/schedule.js'
import { sydneyLocalToUtc, sydneyOffsetMinutes, sydneyParts } from '../../src/lib/sydneyTime.js'

const at = (iso) => new Date(iso)
const byDate = (slots) => slots.reduce((m, s) => ((m[s.date] ??= []).push(s), m), {})

describe('Australia/Sydney daylight saving', () => {
  it('uses AEST (+10) before and AEDT (+11) after the October 2026 change', () => {
    assert.equal(sydneyOffsetMinutes(at('2026-10-03T12:00:00Z')), 600)
    assert.equal(sydneyOffsetMinutes(at('2026-10-04T12:00:00Z')), 660)
  })

  it('returns to AEST (+10) after the April 2027 change', () => {
    assert.equal(sydneyOffsetMinutes(at('2027-04-03T12:00:00Z')), 660)
    assert.equal(sydneyOffsetMinutes(at('2027-04-04T12:00:00Z')), 600)
  })

  it('rejects the skipped 02:30 on 4 October 2026', () => {
    assert.throws(() => sydneyLocalToUtc(2026, 10, 4, 2, 30), RangeError)
  })

  it('maps 10:00 Sydney correctly on both sides of each transition', () => {
    assert.equal(sydneyLocalToUtc(2026, 10, 2, 10, 0).toISOString(), '2026-10-02T00:00:00.000Z')
    assert.equal(sydneyLocalToUtc(2026, 10, 4, 10, 0).toISOString(), '2026-10-03T23:00:00.000Z')
    assert.equal(sydneyLocalToUtc(2027, 4, 2, 10, 0).toISOString(), '2027-04-01T23:00:00.000Z')
    assert.equal(sydneyLocalToUtc(2027, 4, 4, 10, 0).toISOString(), '2027-04-04T00:00:00.000Z')
  })

  it('offers the DST-change Sundays at the correct UTC instants', () => {
    const oct = candidateSlots(at('2026-10-01T00:00:00Z')).filter((s) => s.date === '2026-10-04')
    assert.equal(oct[0].start, '2026-10-03T23:00:00.000Z')
    assert.equal(oct.length, 8)
    const apr = candidateSlots(at('2027-03-31T00:00:00Z')).filter((s) => s.date === '2027-04-04')
    assert.equal(apr[0].start, '2027-04-04T00:00:00.000Z')
    assert.equal(apr.length, 8)
  })

  it('keeps every window slot inside 10:00-14:00 local for a whole year', () => {
    for (let d = Date.UTC(2026, 9, 1); d < Date.UTC(2027, 9, 1); d += 86400000) {
      const day = new Date(d)
      for (const [h, m] of [[10, 0], [13, 30]]) {
        const utc = sydneyLocalToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, m)
        const back = sydneyParts(utc)
        assert.deepEqual([back.hour, back.minute], [h, m])
        assert.ok([600, 660].includes(sydneyOffsetMinutes(utc)))
      }
    }
  })

  it('sends Graph the Sydney wall-clock time with the Windows zone name', () => {
    const slot = candidateSlots(at('2026-10-01T00:00:00Z')).find((s) => s.start === '2026-10-03T23:00:00.000Z')
    assert.deepEqual(graphTimes(slot), {
      start: { dateTime: '2026-10-04T10:00:00', timeZone: 'AUS Eastern Standard Time' },
      end: { dateTime: '2026-10-04T10:30:00', timeZone: 'AUS Eastern Standard Time' },
    })
  })
})

describe('opening days and window', () => {
  const slots = candidateSlots(at('2026-10-25T13:30:00Z')) // Monday 26 Oct 00:30 Sydney
  const grouped = byDate(slots)

  it('never offers a Saturday', () => {
    assert.ok(slots.every((s) => s.weekday !== 'Saturday'))
    assert.equal(grouped['2026-10-31'], undefined)
    assert.equal(grouped['2026-11-07'], undefined)
  })

  it('offers Sundays', () => {
    assert.equal(grouped['2026-11-01'].length, 8)
  })

  it('offers exactly 10:00 to 13:30 starts, 30 minutes each', () => {
    const times = grouped['2026-10-27'].map((s) => s.time)
    assert.deepEqual(times, ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'])
    assert.equal(grouped['2026-10-27'].at(-1).endTime, '14:00')
    for (const s of slots) assert.equal(Date.parse(s.end) - Date.parse(s.start), 30 * 60000)
  })
})

describe('four-hour minimum notice', () => {
  it('includes a slot exactly four hours away', () => {
    const slots = candidateSlots(at('2026-10-25T19:00:00Z')) // Monday 06:00 Sydney
    assert.equal(slots[0].start, '2026-10-25T23:00:00.000Z') // Monday 10:00
  })

  it('excludes a slot 3 hours 59 minutes away', () => {
    const slots = candidateSlots(at('2026-10-25T19:01:00Z')) // Monday 06:01 Sydney
    assert.equal(slots[0].time, '10:30')
    assert.equal(slots[0].date, '2026-10-26')
  })

  it('rolls to the next open day late in the window', () => {
    const slots = candidateSlots(at('2026-10-26T00:00:00Z')) // Monday 11:00 Sydney, 15:00 earliest
    assert.equal(slots[0].date, '2026-10-27')
    assert.equal(slots[0].time, '10:00')
  })
})

describe('fourteen-day horizon', () => {
  it('runs through the 14th Sydney calendar day and no further', () => {
    const slots = candidateSlots(at('2026-10-25T13:30:00Z')) // Monday 26 Oct 00:30 Sydney
    const dates = [...new Set(slots.map((s) => s.date))]
    assert.equal(dates[0], '2026-10-26')
    assert.equal(dates.at(-1), '2026-11-09')
    assert.ok(!dates.includes('2026-11-10'))
    assert.equal(dates.length, 13) // 15 calendar days minus two Saturdays
  })
})

describe('findSlot', () => {
  const now = at('2026-10-25T20:00:00Z') // Monday 07:00 Sydney

  it('accepts an exact slot in any ISO form', () => {
    assert.equal(findSlot('2026-10-27T10:00:00+11:00', now)?.start, '2026-10-26T23:00:00.000Z')
  })

  it('rejects unaligned, Saturday, past, too-soon and malformed starts', () => {
    assert.equal(findSlot('2026-10-26T23:15:00Z', now), null)
    assert.equal(findSlot('2026-10-30T23:00:00Z', now), null) // Saturday 10:00
    assert.equal(findSlot('2026-10-20T23:00:00Z', now), null)
    assert.equal(findSlot('2026-10-25T23:00:00Z', now), null) // Monday 10:00, under 4 hours
    assert.equal(findSlot('not a date', now), null)
    assert.equal(findSlot(12345, now), null)
  })

  it('builds sortable slot row keys', () => {
    assert.equal(slotRowKey('2026-10-26T23:00:00.000Z'), 'slot_20261026T230000Z')
  })
})
