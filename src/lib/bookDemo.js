/* Book a Demo: time selection, Cloudflare Turnstile and booking submission. */
import {
  CONTACT,
  buildBookingPayload,
  buildDateOptions,
  confirmationDetails,
  createBookingApi,
  formatSydneyTime,
  idempotencyKeyFor,
  interpretAvailability,
  interpretBooking,
  isBookingConfigured,
  localEquivalent,
  sydneyZoneLabel,
} from './bookingClient.js'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
const API_BASE = import.meta.env.VITE_BOOKING_API_BASE || ''
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

/**
 * Wires the booking step into the existing questionnaire. Returns null when the site was built
 * without a Turnstile site key or API base, so the page keeps its "temporarily unavailable" notice.
 */
export function setupBooking(form, { onUnavailable, reduceMotion }) {
  if (!isBookingConfigured({ siteKey: SITE_KEY, apiBase: API_BASE })) return null

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

  const api = createBookingApi({ baseUrl: API_BASE })
  const state = { stage: 'questions', slots: [], date: null, slot: null, token: '', widgetId: null, attempt: null, busy: false }

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
    step.querySelectorAll('input').forEach((i) => {
      if (on) {
        i.dataset.wasDisabled = i.disabled ? '1' : '0'
        i.disabled = true
      } else if (i.dataset.wasDisabled !== undefined) {
        i.disabled = i.dataset.wasDisabled === '1'
        delete i.dataset.wasDisabled
      }
    })
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
    if (!day || !day.slots.length) {
      timesHint.textContent = 'Choose a date to see available times.'
      return
    }
    zoneNote.textContent = `All times are Sydney time, ${sydneyZoneLabel(new Date(day.slots[0].start))}.`
    timesHint.textContent = `${day.slots.length} available ${day.slots.length === 1 ? 'time' : 'times'} on ${day.longLabel}.`
    for (const s of day.slots) {
      const local = localEquivalent(s.start)
      const input = el('input', { type: 'radio', name: 'bookingSlot', value: s.start })
      input.addEventListener('change', () => {
        state.slot = s
        step.classList.remove('has-error')
        say('')
      })
      timesBox.append(
        el('label', { className: 'choice choice--center choice--stack' }, input,
          el('span', {}, el('b', {}, formatSydneyTime(s.start)), local ? el('small', {}, `${local} your time`) : null)),
      )
    }
  }

  function renderDates() {
    state.days = buildDateOptions(new Date(), state.slots)
    datesBox.replaceChildren()
    const firstOpen = state.days.find((d) => d.available)
    state.date = firstOpen ? firstOpen.date : null
    for (const d of state.days) {
      const unavailable = d.closed || !d.available
      const input = el('input', {
        type: 'radio',
        name: 'bookingDate',
        value: d.date,
        disabled: unavailable,
        checked: d.date === state.date,
        'aria-label': `${d.longLabel}${d.closed ? ', closed' : !d.available ? ', no times available' : ''}`,
      })
      input.addEventListener('change', () => {
        state.date = d.date
        renderTimes()
      })
      const sub = d.closed ? 'Closed' : d.available ? `${d.slots.length} ${d.slots.length === 1 ? 'time' : 'times'}` : 'No times'
      datesBox.append(el('label', { className: 'choice choice--center choice--stack' }, input, el('span', {}, el('b', {}, d.label), el('small', {}, sub))))
    }
    renderTimes()
  }

  async function loadTimes({ quiet = false } = {}) {
    if (!quiet) setBusy(true, 'Loading times…')
    const res = await api.availability()
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
    const payload = buildBookingPayload({ form: fd, slotStart: state.slot.start, turnstileToken: state.token, idempotencyKey: state.attempt.key })

    setBusy(true, 'Booking…')
    say('')
    const res = await api.book(payload)
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
