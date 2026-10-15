import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/content')
const hrefMap = {
  'index.html': '/',
  'platform.html': '/platform',
  'visa-operations.html': '/visa-operations',
  'ai-control-security.html': '/ai-control-security',
  'solutions.html': '/solutions',
  'corporate-sponsorship.html': '/corporate-sponsorship',
  'practice-growth.html': '/practice-growth',
  'how-it-works.html': '/how-it-works',
  'pricing.html': '/pricing',
  'resources.html': '/resources',
  'support.html': '/support',
  'book-demo.html': '/book-demo',
  'privacy.html': '/privacy',
  'terms.html': '/terms',
}

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  let html = fs.readFileSync(path.join(dir, file), 'utf8')
  for (const [from, to] of Object.entries(hrefMap)) {
    const re = new RegExp(`href="${from.replace('.', '\\.')}([^"]*)"`, 'g')
    html = html.replace(re, (_, hash) => `href="${to}${hash || ''}"`)
  }
  html = html.replace(/src="assets\//g, 'src="/assets/')
  html = html.replace(/href="assets\//g, 'href="/assets/')
  fs.writeFileSync(path.join(dir, file), html)
  console.log('rewrote', file)
}
