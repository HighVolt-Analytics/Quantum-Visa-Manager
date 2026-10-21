import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const WORKFLOW = new URL('../.github/workflows/deploy.yml', import.meta.url)

function pushSection(workflow) {
  const match = workflow.match(/  push:\r?\n([\s\S]*?)  workflow_dispatch:/)
  assert.ok(match, 'deploy.yml must define push then workflow_dispatch')
  return match[1]
}

function listedPaths(section) {
  return [...section.matchAll(/^\s+-\s+'([^']+)'/gm)].map((m) => m[1])
}

test('push trigger is main-only with an explicit website allowlist', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8')
  const section = pushSection(workflow)

  assert.ok(section.includes('branches: [main]'))
  assert.ok(section.includes('paths:'), 'must use paths allowlist, not paths-ignore')
  assert.ok(!section.includes('paths-ignore'), 'must not use broad paths-ignore')

  const paths = listedPaths(section)
  const required = [
    'src/**',
    'public/**',
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.js',
  ]
  for (const path of required) {
    assert.ok(paths.includes(path), `missing allowlisted path: ${path}`)
  }

  assert.deepEqual(paths, required, 'allowlist must stay exactly the reviewed website build inputs')
})

test('docs, tests, scripts, workflows and legacy root HTML are not deployment triggers', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8')
  const section = pushSection(workflow)
  const paths = listedPaths(section)
  const joined = paths.join('\n')

  for (const forbidden of [
    'docs/**',
    'tests/**',
    'scripts/**',
    '.github/**',
    '.github/workflows/**',
    '**.md',
    '*.html',
    'assets/**',
    'css/**',
    'js/**',
    'eslint.config.js',
  ]) {
    assert.ok(!paths.includes(forbidden), `must not allowlist ${forbidden}`)
    assert.ok(!joined.includes(forbidden), `must not mention ${forbidden} in push paths`)
  }

  assert.ok(workflow.includes('workflow_dispatch:'), 'manual dispatch must remain')
  assert.ok(workflow.includes("vars.QVM_PRODUCTION_CUTOVER_ENABLED == 'true'"))
  assert.ok(workflow.includes("vars.GRAPH_NOTIFY_ENABLED == 'true'"))
  assert.ok(workflow.includes('group: deploy-qvm-production'))
  assert.ok(workflow.includes('cancel-in-progress: false'))
  assert.ok(workflow.includes("quantumvisamanager.com/public_html"))
  assert.ok(workflow.includes('quantumledgerline.com'))
})

test('cutover gate and exact-commit checks remain intact', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8')
  assert.ok(workflow.includes('Confirm checked-out commit'))
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"'))
  assert.ok(workflow.includes('sha256sum --check'))
  assert.ok(workflow.includes('deployment_backups/qvm-production'))
  assert.ok(workflow.includes('Restore pre-deployment snapshot after a release failure'))
  assert.ok(workflow.includes('StrictHostKeyChecking=yes'))
  assert.ok(workflow.includes('scripts/send-deployment-notification.py'))
})

test('pages are revalidated so returning visitors receive each release', async () => {
  const htaccess = await readFile(new URL('../public/.htaccess', import.meta.url), 'utf8')
  const block = htaccess.match(/<FilesMatch "\\\.html\$">([\s\S]*?)<\/FilesMatch>/)
  assert.ok(block, 'public/.htaccess must set a cache policy for HTML pages')
  assert.match(block[1], /Header set Cache-Control "no-cache"/)
  assert.ok(htaccess.indexOf('<FilesMatch') < htaccess.indexOf('RewriteRule ^ index.html'), 'policy must sit before the SPA fallback')
  assert.equal((htaccess.match(/no-cache|no-store|max-age/g) || []).length, 1, 'versioned /assets keep the host caching policy')
  for (const rule of ['Options -MultiViews', 'DirectoryIndex index.html', 'RewriteRule ^index\\.html$ - [L]', 'RewriteCond %{REQUEST_FILENAME} !-f', 'RewriteCond %{REQUEST_FILENAME} !-d', 'RewriteRule ^ index.html [L]']) {
    assert.ok(htaccess.includes(rule), `SPA routing rule preserved: ${rule}`)
  }
})
