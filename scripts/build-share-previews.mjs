import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SITE = 'https://www.quantumvisamanager.com'
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:5173'
const OUT = path.resolve('public/share')
const PAGES = (process.env.ONLY ? process.env.ONLY.split(',') : ['/', '/platform', '/visa-operations', '/ai-control-security', '/solutions', '/corporate-sponsorship', '/practice-growth', '/how-it-works', '/pricing', '/resources', '/support', '/book-demo'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({ ws, send }))
    ws.addEventListener('error', reject)
  })
}

async function chrome() {
  const port = process.env.PORT || '9345'
  const exe = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const dir = path.join(process.env.TEMP || '/tmp', 'qvm-share-build')
  fs.mkdirSync(dir, { recursive: true })
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank',
  ], { stdio: 'ignore' })
  let wsUrl = ''
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = pages.find((p) => p.type === 'page')
      if (page?.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl
    } catch { /* chrome still starting */ }
    if (!wsUrl) await sleep(200)
  }
  if (!wsUrl) throw new Error('Chrome did not start')
  return { child, ...(await connect(wsUrl)) }
}

function shareHtml({ key, title, desc, landing }) {
  const image = `${SITE}/share/${key}.jpg`
  const page = `${SITE}/share/${key}.html`
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="noindex">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Quantum Visa Manager">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${page}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${image}">
  <link rel="canonical" href="${esc(landing)}">
</head>
<body style="margin:0;background:#161417">
  <a href="${esc(landing)}"><img src="${key}.jpg" alt="${esc(title)}" style="width:100%;height:auto;display:block"></a>
  <script>if (!/bot|crawler|spider|preview|facebookexternalhit|linkedin|slack|whatsapp|telegram|discord/i.test(navigator.userAgent)) location.replace(${JSON.stringify(landing)})</script>
</body>
</html>
`
}

const seen = new Set()
const shots = []

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const { child, send } = await chrome()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails))
    return res.result.value
  }

  const grab = async () => {
    const cards = await evalJs(`(() => {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'))
      const header = document.querySelector('header')
      if (header) header.style.visibility = 'hidden'
      document.querySelectorAll('.share-link').forEach((el) => { el.style.visibility = 'hidden' })
      const found = []
      document.querySelectorAll('.share-link[data-share-key]').forEach((link) => {
        const card = link.closest('.clip, .win, .diff-col, .j-panel, .hero-video, .growth-hero, .matrix, .outcome, .step3, .card, .panel') || link
        card.setAttribute('data-shoot', link.dataset.shareKey)
        found.push({
          key: link.dataset.shareKey,
          landing: link.dataset.shareLanding,
          label: (link.getAttribute('aria-label') || 'Share').replace(/^Share\\s+/, '')
        })
      })
      return found
    })()`)
    for (const card of cards) {
      if (seen.has(card.key)) continue
      await evalJs(`(() => {
        const el = document.querySelector('[data-shoot="${card.key}"]')
        if (el) el.scrollIntoView({ block: 'center', inline: 'center' })
      })()`)
      await sleep(120)
      const box = await evalJs(`(() => {
        const el = document.querySelector('[data-shoot="${card.key}"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        const h = Math.min(r.height, 760)
        return {
          x: Math.max(0, r.left + window.scrollX),
          y: Math.max(0, r.top + window.scrollY),
          w: Math.max(1, r.width),
          h: Math.max(1, h)
        }
      })()`)
      if (!box || box.w < 40 || box.h < 40) continue
      const shot = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 90,
        clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      })
      seen.add(card.key)
      shots.push({ ...card, image: shot.data })
      console.log('shot', card.key)
    }
  }

  for (const route of PAGES) {
    await send('Page.navigate', { url: LOCAL + route })
    let ready = false
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(300)
      ready = await evalJs(`document.querySelectorAll('.share-link').length > 0 || document.body.innerText.length > 400`)
    }
    await sleep(400)
    await grab()
    const counts = await evalJs(`({
      problems: document.querySelectorAll('.p-btn').length,
      stages: document.querySelectorAll('.j-tab').length,
      ops: document.querySelectorAll('[id^="xt"]').length
    })`)
    for (let i = 0; i < counts.problems; i++) {
      await evalJs(`document.querySelectorAll('.p-btn')[${i}].click()`)
      await sleep(350)
      await grab()
    }
    for (let i = 0; i < counts.stages; i++) {
      await evalJs(`document.querySelectorAll('.j-tab')[${i}].click()`)
      await sleep(250)
      await grab()
    }
    for (let i = 0; i < counts.ops; i++) {
      await evalJs(`document.getElementById('xt${i}')?.click()`)
      await sleep(250)
      await grab()
    }
    console.log('page', route, 'total', shots.length)
  }

  const frameTree = await send('Page.getFrameTree')
  const frameId = frameTree.frameTree.frame.id
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false })
  for (const card of shots) {
    const title = card.label || 'Quantum Visa Manager'
    const desc = `${title} on Quantum Visa Manager`
    const landing = `${SITE}${card.landing.startsWith('/') ? card.landing : `/${card.landing}`}`
    const html = `<!doctype html><html><head><style>html,body{margin:0;width:1200px;height:630px;background:#161417;overflow:hidden}body{display:flex;align-items:center;justify-content:center}img{width:1140px;height:590px;object-fit:contain}</style></head><body><img src="data:image/jpeg;base64,${card.image}"></body></html>`
    await send('Page.setDocumentContent', { frameId, html })
    for (let n = 0; n < 30; n++) {
      const ready = await evalJs(`!!(document.images[0] && document.images[0].complete && document.images[0].naturalWidth > 10)`)
      if (ready) break
      await sleep(40)
    }
    const framed = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 })
    fs.writeFileSync(path.join(OUT, `${card.key}.jpg`), Buffer.from(framed.data, 'base64'))
    fs.writeFileSync(path.join(OUT, `${card.key}.html`), shareHtml({ key: card.key, title, desc, landing }))
    console.log('wrote', card.key)
  }
  console.log('done', shots.length)
  child.kill()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
