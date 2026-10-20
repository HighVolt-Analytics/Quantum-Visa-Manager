import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(m?js)$/.test(name) ? [path] : []
  })
}

const files = ['src', 'test', 'scripts'].flatMap(walk)
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })

const { app } = await import('@azure/functions')
const registered = []
for (const kind of ['http', 'timer']) {
  const original = app[kind]
  app[kind] = (name, options) => {
    registered.push(name)
    return original.call(app, name, options)
  }
}
await import('../src/index.js')
const expected = ['availability', 'bookings', 'diagnostics', 'reconcile']
if (registered.sort().join() !== expected.join()) {
  throw new Error(`Unexpected function registrations: ${registered.join(', ')}`)
}
console.log(`Syntax OK for ${files.length} files; functions registered: ${registered.join(', ')}`)
