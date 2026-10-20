import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const read = async (name) => parse(await readFile(new URL(`../../../.github/workflows/${name}`, import.meta.url), 'utf8'))

describe('booking-api workflow', async () => {
  const wf = await read('booking-api.yml')

  it('defaults to read-only token permissions', () => {
    assert.deepEqual(wf.permissions, { contents: 'read' })
    assert.equal(wf.jobs.test.permissions, undefined)
  })

  it('deploys only by manual dispatch from main with explicit confirmation', () => {
    const deploy = wf.jobs.deploy
    assert.equal(deploy.environment, 'BookDemo-Production')
    assert.match(deploy.if, /github\.event_name == 'workflow_dispatch'/)
    assert.match(deploy.if, /github\.ref == 'refs\/heads\/main'/)
    assert.match(deploy.if, /inputs\.confirm_deploy == 'DEPLOY'/)
    assert.deepEqual(deploy.permissions, { contents: 'read', 'id-token': 'write' })
    assert.deepEqual(deploy.needs, ['test'])
  })

  it('never changes app settings or touches the website pipeline', async () => {
    const raw = await readFile(new URL('../../../.github/workflows/booking-api.yml', import.meta.url), 'utf8')
    for (const forbidden of ['appsettings set', 'BOOKING_ENABLED=true', 'HOSTINGER', 'QVM_PRODUCTION_CUTOVER_ENABLED', 'GRAPH_NOTIFY_ENABLED', 'secrets.']) {
      assert.ok(!raw.includes(forbidden), `workflow must not reference ${forbidden}`)
    }
  })

  it('only triggers on booking-api changes', () => {
    for (const trigger of ['push', 'pull_request']) {
      assert.deepEqual(wf.on[trigger].paths, ['booking-api/**', '.github/workflows/booking-api.yml'])
    }
  })
})

describe('website deployment isolation', async () => {
  const deploy = await read('deploy.yml')

  it('booking-api changes cannot trigger the Hostinger deployment', () => {
    const paths = deploy.on.push.paths
    assert.ok(paths.every((p) => !p.startsWith('booking-api') && !p.includes('.github')))
    assert.deepEqual(paths, ['src/**', 'public/**', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js'])
  })
})
