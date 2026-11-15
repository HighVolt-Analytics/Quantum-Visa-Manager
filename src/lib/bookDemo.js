/* Book a Demo: time selection, Cloudflare Turnstile and booking submission. */
import {
  CONTACT,
  buildBookingPayload,
  buildCalendarMonth,
  buildDateOptions,
  buildMarketDateOptions,
  calendarMonthForNow,
  calendarMonthFromDays,
  confirmationDetails,
  createBookingApi,
  dateKeyInZone,
  formatSydneyTime,
  formatZoneTime,
  idempotencyKeyFor,
  interpretAvailability,
  interpretBooking,
  isBookingConfigured,
  isBookingV2Enabled,
  BOOKING_V2_SITE,
  countryOptions,
  detectTimeZone,
  regionsForCountry,
  shiftCalendarMonth,
  SYDNEY,
  timeZoneChoices,
  localEquivalent,
  sydneyZoneLabel,
  zoneLabel,
} from './bookingClient.js'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
const API_BASE = import.meta.env.VITE_BOOKING_API_BASE || ''
const API_BASE_V2 = import.meta.env.VITE_BOOKING_V2_API_BASE || ''
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstileLoading = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = TURNSTILE_SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => {
      turnstileLoading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return turnstileLoading
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === undefined || v === null) continue
    if (k === 'className') node.className = v
    else node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c)
  return node
}

function syncRegionField(form, countryCode) {
  const field = form.querySelector('[data-region-field]') || form.querySelector('[name="state"]')?.closest('.field')
  if (!field) return
  field.dataset.regionField = 'true'
  const previous = String(form.querySelector('[name="state"]')?.value || '').trim()
  const regions = regionsForCountry(countryCode)
  const label = field.querySelector('label')
  if (label) {
    label.htmlFor = 'state'
    label.textContent = 'State / province / region'
  }
  const control = regions
    ? el(
        'select',
        { className: 'select', id: 'state', name: 'state', required: true },
        el('option', { value: '' }, 'Select a region'),
        ...regions.map((name) => el('option', { value: name, selected: name === previous }, name)),
      )
    : el('input', {
        className: 'input',
        id: 'state',
        name: 'state',
        autocomplete: 'address-level1',
        required: true,
        value: regionsForCountry('AU')?.includes(previous) ? '' : previous,
        placeholder: 'State, province or region',
      })
  const existing = field.querySelector('#state, [name="state"]')
  if (existing) existing.replaceWith(control)
  else field.append(control)
  let err = field.querySelector('.err')
  if (!err) {
    err = el('span', { className: 'err' }, 'Please enter your state, province or region.')
    field.append(err)
  } else {
    err.textContent = 'Please enter your state, province or region.'
  }
}

function ensureCountryField(form) {
  if (form.querySelector('[name="country"]')) return
  const stateField = form.querySelector('[name="state"]')?.closest('.field')
  if (!stateField) return
  const countries = countryOptions()
  const hidden = el('input', { type: 'hidden', id: 'country', name: 'country', required: true, value: '' })
  const search = el('input', {
    className: 'input',
    id: 'country-search',
    type: 'search',
    autocomplete: 'off',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'country-list',
    placeholder: 'Search for a country',
  })
  const list = el('ul', { className: 'country-list', id: 'country-list', role: 'listbox', hidden: true })
  const field = el(
    'div',
    { className: 'field', 'data-country-field': 'true' },
    el('label', { for: 'country-search' }, 'Country'),
    hidden,
    search,
    list,
    el('span', { className: 'err' }, 'Please select your country.'),
  )
  stateField.before(field)

  function closeList() {
    list.hidden = true
    search.setAttribute('aria-expanded', 'false')
  }

  function renderList(query) {
    const q = String(query || '').trim().toLowerCase()
    list.replaceChildren()
    const matches = countries.filter((item) => !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase() === q).slice(0, 12)
    for (const item of matches) {
      const option = el('li', { role: 'option', 'data-code': item.code, tabIndex: -1 }, item.name)
      option.addEventListener('mousedown', (event) => {
        event.preventDefault()
        hidden.value = item.code
        search.value = item.name
        closeList()
        syncRegionField(form, item.code)
      })
      list.append(option)
    }
    list.hidden = matches.length === 0
    search.setAttribute('aria-expanded', matches.length ? 'true' : 'false')
  }

  search.addEventListener('focus', () => renderList(search.value))
  search.addEventListener('input', () => {
    hidden.value = ''
    renderList(search.value)
  })
  search.addEventListener('blur', () => {
    window.setTimeout(() => {
      closeList()
      if (!hidden.value) search.value = ''
    }, 150)
  })
  syncRegionField(form, '')
}

function ensureTimeZoneField(form) {
  if (form.querySelector('[name="timeZone"]')) return
  const stateField = form.querySelector('[name="state"]')?.closest('.field')
  if (!stateField) return
  const detected = detectTimeZone()
  const hidden = el('input', { type: 'hidden', id: 'timeZone', name: 'timeZone', value: detected, required: true })
  const summary = el('p', { className: 'hint', 'data-timezone-label': 'true' }, `Using ${detected}`)
  const toggle = el('button', { type: 'button', className: 'link-btn', 'data-timezone-change': 'true' }, 'Change timezone')
  const select = el('select', { className: 'select', id: 'timeZone-select', hidden: true })
  for (const zone of timeZoneChoices(detected)) select.append(el('option', { value: zone, selected: zone === detected }, zone))
  select.addEventListener('change', () => {
    hidden.value = select.value
    summary.textContent = `Using ${select.value}`
  })
  toggle.addEventListener('click', () => {
    select.hidden = !select.hidden
    toggle.textContent = select.hidden ? 'Change timezone' : 'Hide timezone list'
  })
  const field = el(
    'div',
    { className: 'field', 'data-timezone-field': 'true' },
    el('span', { className: 'label' }, 'Timezone'),
    hidden,
    summary,
    el('p', { className: 'hint' }, 'Times are 9:00 am–7:00 pm in this timezone, every day.'),
    toggle,
    select,
  )
  stateField.before(field)
}

/**
 * Wires the booking step into the existing questionnaire. Returns null when the site was built
 * without a Turnstile site key or API base, so the page keeps its "temporarily unavailable" notice.
 */
export function setupBooking(form, { onUnavailable, reduceMotion }) {
  if (isBookingV2Enabled()) {
    ensureCountryField(form)
    ensureTimeZoneField(form)
  }
  if (!isBookingConfigured({ siteKey: SITE_KEY, apiBase: API_BASE })) return null
  if (isBookingV2Enabled() && !isBookingConfigured({ siteKey: SITE_KEY, apiBase: API_BASE_V2 })) return null

  const $ = (s, r = form) => r.querySelector(s)
  const panel = form.parentElement
  const step = $('[data-booking-step]')
  const datesBox = $('[data-booking-dates]')
  const timesBox = $('[data-booking-times]')
  const timesHint = $('[data-booking-times-hint]')
  const zoneNote = $('[data-booking-zone]')
  const tsBox = $('[data-turnstile]')
  const tsField = tsBox.closest('.field')
  const status = $('[data-booking-status]')
  const note = $('[data-booking-note]')
  const submit = $('[type="submit"]')
  const booked = panel.querySelector('[data-booked]')
  const pending = panel.querySelector('[data-pending]')
  if (!step || !datesBox || !timesBox || !tsBox || !status || !submit || !booked || !pending) return null

  const api = createBookingApi({ baseUrl: API_BASE, v2BaseUrl: API_BASE_V2 })
  const state = {
    stage: 'questions',
    slots: [],
    days: [],
    date: null,
    slot: null,
    token: '',
    widgetId: null,
    attempt: null,
    busy: false,
    schedule: null,
    calendar: null,
  }

  note.textContent = 'Next, choose a 30-minute time. Times are shown in Sydney time.'
  submit.textContent = 'Choose a time'

  const scrollTo = (node) => node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })

  function say(message, tone = '') {
    status.textContent = message || ''
    status.dataset.tone = tone
  }

  function setBusy(on, label) {
    state.busy = on
    submit.disabled = on
    submit.setAttribute('aria-busy', on ? 'true' : 'false')
    if (on) {
      submit.replaceChildren(el('span', { className: 'spinner', style: 'border-top-color:currentColor', 'aria-hidden': 'true' }), ` ${label}`)
    } else {
      submit.textContent = state.stage === 'times' ? 'Confirm booking' : 'Choose a time'
    }
    step.querySelectorAll('input, .booking-calendar button').forEach((i) => {
      if (on) {
        i.dataset.wasDisabled = i.disabled ? '1' : '0'
        i.disabled = true
      } else if (i.dataset.wasDisabled !== undefined) {
        i.disabled = i.dataset.wasDisabled === '1'
        delete i.dataset.wasDisabled
      }
    })
  }

  function visitorTimeZone() {
    return String(new FormData(form).get('timeZone') || detectTimeZone() || '').trim()
  }

  function updateZoneNote(day) {
    const visitor = visitorTimeZone()
    const sample = day?.slots?.[0]?.start
    const when = sample ? new Date(sample) : new Date()
    if (state.schedule?.timeZone) {
      zoneNote.textContent = `Times are shown in ${zoneLabel(when, state.schedule.timeZone)}. Your timezone is ${visitor || 'unknown'}.`
      return
    }
    zoneNote.textContent = `All times are Sydney time, ${sydneyZoneLabel(when)}. Your timezone is ${visitor || 'unknown'}.`
  }

  function resetTurnstile() {
    state.token = ''
    if (window.turnstile && state.widgetId !== null) {
      try {
        window.turnstile.reset(state.widgetId)
      } catch {
        state.widgetId = null
      }
    }
  }

  async function ensureTurnstile() {
    if (state.widgetId !== null) return
    try {
      const ts = await loadTurnstile()
      state.widgetId = ts.render(tsBox, {
        sitekey: SITE_KEY,
        action: 'book_demo',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        size: 'flexible',
        callback: (token) => {
          state.token = token
          tsField.classList.remove('has-error')
        },
        'expired-callback': () => {
          state.token = ''
        },
        'timeout-callback': () => {
          state.token = ''
        },
        'error-callback': () => {
          state.token = ''
          say(`The security check couldn't run. Please refresh the page, or email ${CONTACT}.`, 'error')
        },
      })
    } catch {
      say(`The security check couldn't load. Please refresh the page, or email ${CONTACT}.`, 'error')
    }
  }

  function renderTimes() {
    const day = state.days.find((d) => d.date === state.date)
    timesBox.replaceChildren()
    state.slot = null
    updateZoneNote(day)
    if (!day || !day.slots.length) {
      timesHint.textContent = 'Choose a date with available times on the calendar.'
      return
    }
    timesHint.textContent = `${day.slots.length} available ${day.slots.length === 1 ? 'time' : 'times'} on ${day.longLabel}.`
    for (const s of day.slots) {
      const local = localEquivalent(s.start, undefined, state.schedule?.timeZone)
      const input = el('input', { type: 'radio', name: 'bookingSlot', value: s.start })
      input.addEventListener('change', () => {
        state.slot = s
        step.classList.remove('has-error')
        say('')
      })
      timesBox.append(
        el('label', { className: 'choice choice--center choice--stack' }, input,
          el('span', {}, el('b', {}, state.schedule?.timeZone ? formatZoneTime(s.start, state.schedule.timeZone) : formatSydneyTime(s.start)), local ? el('small', {}, `${local} your time`) : null)),
      )
    }
  }

  function monthHasAvailability(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    return state.days.some((d) => d.available && d.date.startsWith(prefix))
  }

  function renderCalendar() {
    if (!state.calendar) state.calendar = calendarMonthFromDays(state.days, state.date)
    const { year, month } = state.calendar
    const grid = buildCalendarMonth(year, month, state.days, state.date)
    const prev = shiftCalendarMonth(year, month, -1)
    const next = shiftCalendarMonth(year, month, 1)
    const canPrev = monthHasAvailability(prev.year, prev.month) || state.days.some((d) => d.date.startsWith(`${prev.year}-${String(prev.month + 1).padStart(2, '0')}-`))
    const canNext = monthHasAvailability(next.year, next.month) || state.days.some((d) => d.date.startsWith(`${next.year}-${String(next.month + 1).padStart(2, '0')}-`))

    datesBox.replaceChildren()
    const nav = el('div', { className: 'booking-cal-nav' })
    const prevBtn = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', 'aria-label': 'Previous month' }, 'Previous')
    prevBtn.disabled = !canPrev
    prevBtn.addEventListener('click', () => {
      if (!canPrev) return
      state.calendar = prev
      renderCalendar()
    })
    const todayBtn = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', 'aria-label': 'Go to today' }, 'Today')
    todayBtn.addEventListener('click', () => {
      const zone = visitorTimeZone() || state.schedule?.timeZone || SYDNEY
      const now = new Date()
      state.calendar = calendarMonthForNow(now, zone)
      const todayKey = dateKeyInZone(now, zone)
      if (state.days.some((d) => d.date === todayKey && d.available)) state.date = todayKey
      renderCalendar()
      renderTimes()
    })
    const nextBtn = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', 'aria-label': 'Next month' }, 'Next')
    nextBtn.disabled = !canNext
    nextBtn.addEventListener('click', () => {
      if (!canNext) return
      state.calendar = next
      renderCalendar()
    })
    nav.append(prevBtn, todayBtn, nextBtn, el('h3', { className: 'booking-cal-title', id: 'bk-cal-title' }, grid.label))
    datesBox.append(nav)

    const week = el('div', { className: 'booking-cal-weekdays', 'aria-hidden': 'true' })
    for (const name of grid.weekdays) week.append(el('span', {}, name))
    datesBox.append(week)

    const body = el('div', {
      className: 'booking-cal-grid',
      role: 'radiogroup',
      'aria-labelledby': 'bk-date-label',
      'aria-describedby': 'bk-cal-title',
    })
    for (const cell of grid.cells) {
      const classes = ['booking-cal-day']
      if (!cell.inMonth) classes.push('is-outside')
      if (cell.available) classes.push('is-available')
      if (cell.selected) classes.push('is-selected')
      if (cell.disabled) classes.push('is-disabled')
      const input = el('input', {
        type: 'radio',
        name: 'bookingDate',
        value: cell.date,
        disabled: cell.disabled,
        checked: cell.selected,
        'aria-label': `${cell.longLabel}${cell.closed ? ', closed' : cell.available ? `, ${cell.slots.length} times available` : ', no times available'}`,
      })
      if (!cell.disabled) {
        input.addEventListener('change', () => {
          state.date = cell.date
          renderCalendar()
          renderTimes()
        })
      }
      const mark = cell.available ? el('span', { className: 'booking-cal-dot', 'aria-hidden': 'true' }) : null
      body.append(
        el('label', { className: classes.join(' ') }, input, el('span', { className: 'booking-cal-num' }, String(cell.day)), mark),
      )
    }
    datesBox.append(body)
  }

  function renderDates() {
    state.days = state.schedule
      ? buildMarketDateOptions(new Date(), state.slots, state.schedule)
      : buildDateOptions(new Date(), state.slots)
    const firstOpen = state.days.find((d) => d.available)
    state.date = firstOpen ? firstOpen.date : null
    state.calendar = calendarMonthFromDays(state.days, state.date)
    renderCalendar()
    renderTimes()
  }

  async function loadTimes({ quiet = false } = {}) {
    if (!quiet) setBusy(true, 'Loading times…')
    const country = String(new FormData(form).get('country') || '')
    const timeZone = String(new FormData(form).get('timeZone') || '')
    if (isBookingV2Enabled() && !country) {
      say('Please select your country.', 'error')
      return false
    }
    if (isBookingV2Enabled() && !timeZone) {
      say('Please select your timezone.', 'error')
      return false
    }
    const res = await (isBookingV2Enabled() ? api.availabilityV2(BOOKING_V2_SITE, country, timeZone) : api.availability())
    setBusy(false)
    if (res.network) {
      say(`We couldn't load available times. Check your connection and try again, or email ${CONTACT}.`, 'error')
      return false
    }
    const r = interpretAvailability(res.httpStatus, res.body)
    if (r.kind === 'unavailable') {
      onUnavailable()
      return false
    }
    if (r.kind !== 'ok') {
      say(r.message, 'error')
      return false
    }
    state.slots = r.slots
    state.schedule = isBookingV2Enabled() && r.timeZone
      ? { timeZone: r.timeZone, openWeekdays: r.openWeekdays, horizonDays: r.horizonDays }
      : null
    note.textContent = state.schedule
      ? `Next, choose a time. Times are shown in ${state.schedule.timeZone}.`
      : 'Next, choose a 30-minute time. Times are shown in Sydney time.'
    renderDates()
    if (!state.slots.length) say(`No times are available in the next 14 days. Please email ${CONTACT} and we'll arrange one.`, 'error')
    return true
  }

  async function showTimes() {
    say('')
    if (!(await loadTimes())) return
    step.hidden = false
    state.stage = 'times'
    submit.textContent = 'Confirm booking'
    note.textContent = 'Your time is reserved only when this page confirms the booking.'
    ensureTurnstile()
    const legend = step.querySelector('legend')
    scrollTo(step)
    legend.focus({ preventScroll: true })
  }

  function markInvalid(fields) {
    let first = null
    for (const name of fields) {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`)
      const box = input && (input.closest('.field') || input.closest('.fieldset'))
      if (!box) continue
      box.classList.add('has-error')
      if (input.type !== 'radio' && input.type !== 'checkbox') input.setAttribute('aria-invalid', 'true')
      first ??= box
    }
    if (first) scrollTo(first)
  }

  /** Only called for a confirmed API response. The celebration plays once per page view. */
  function showBooked(result, email) {
    const d = confirmationDetails(result, email)
    const put = (hook, text) => {
      booked.querySelector(`[data-booked-${hook}]`).textContent = text
    }
    put('date', d.date)
    put('time', d.time)
    put('zone', d.zone)
    put('local', d.local || '')
    booked.querySelector('[data-booked-local-row]').hidden = !d.local
    put('email', d.email)
    put('ref', d.reference)
    form.style.display = 'none'
    if (!booked.dataset.celebrated) {
      booked.dataset.celebrated = 'true'
      booked.classList.add('is-celebrating')
    }
    booked.classList.add('is-on')
    booked.focus({ preventScroll: true })
    scrollTo(booked)
  }

  function showPending(result) {
    pending.querySelector('[data-pending-msg]').textContent =
      result.message || `Your Teams invitation should arrive within a few minutes. If it doesn't, email ${CONTACT}.`
    pending.querySelector('[data-pending-ref]').textContent = result.reference || '—'
    form.style.display = 'none'
    pending.classList.add('is-on')
    pending.focus({ preventScroll: true })
    scrollTo(pending)
  }

  async function book() {
    if (state.busy) return
    if (!state.slot) {
      step.classList.add('has-error')
      say('Please choose a time.', 'error')
      scrollTo(step)
      return
    }
    if (!state.token) {
      tsField.classList.add('has-error')
      say('Please complete the security check.', 'error')
      scrollTo(tsField)
      return
    }
    const fd = new FormData(form)
    const email = String(fd.get('email') || '').trim()
    state.attempt = idempotencyKeyFor(state.attempt, { slotStart: state.slot.start, email }, () => crypto.randomUUID())
    const payload = buildBookingPayload({ form: fd, slotStart: state.slot.start, turnstileToken: state.token, idempotencyKey: state.attempt.key, includeCountry: isBookingV2Enabled() })

    setBusy(true, 'Booking…')
    say('')
    const res = await (isBookingV2Enabled() ? api.bookV2({ site: BOOKING_V2_SITE, ...payload }) : api.book(payload))
    setBusy(false)
    resetTurnstile()

    if (res.network) {
      say("We couldn't reach the booking service. Please complete the security check and press Confirm booking again — you won't be booked twice.", 'error')
      return
    }
    const r = interpretBooking(res.httpStatus, res.body)
    if (r.kind === 'confirmed' || r.kind === 'pending') {
      state.stage = 'done'
      return r.kind === 'confirmed' ? showBooked(r, email) : showPending(r)
    }

    state.attempt = null
    switch (r.kind) {
      case 'slot_gone':
        say(r.message, 'error')
        await loadTimes({ quiet: true })
        scrollTo(step)
        return
      case 'invalid':
        say(r.message, 'error')
        markInvalid(r.fields)
        return
      case 'verification':
        tsField.classList.add('has-error')
        say(r.message, 'error')
        return
      case 'unavailable':
        onUnavailable()
        return
      default:
        say(r.message, 'error')
    }
  }

  return {
    onValid() {
      if (state.busy || state.stage === 'done') return
      if (state.stage === 'questions') showTimes()
      else book()
    },
  }
}
