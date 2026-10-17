/**
 * The mount: what it registers, what it gives back, and what it leaves alone.
 *
 * Mounting is the whole surface a profile sees, so every arm here is a
 * composition an operator can actually reach: a plain row, a row with the
 * plugin's own knobs, a composition without the `workingDirectory` package, and
 * — the one that decides whether this plugin is safe to recommend at all — a
 * tree that has restored `cwd` itself, where the registration is refused.
 *
 * @module test/lifecycle.spec
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settle, sessionWith, agentWithSession, world } from './harness.mjs'

/** The registered names in one assembly, as the service itself reports them. */
async function registered(ctx) {
  return Object.keys((await ctx.systemPrompt.assemble()).variables).sort()
}

describe('mounting', () => {
  it('registers exactly the one name the previous release provided', async () => {
    const harness = await world()
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
  })

  it('hands the registration back when the fiber is disposed', async () => {
    const harness = await world()
    await harness.dispose()
    assert.deepEqual(await registered(harness.ctx), [])
  })

  it('survives being mounted twice, which is one row too many in a roster', async () => {
    const harness = await world()
    const second = await harness.ctx.plugin(await import('../lib/index.js').then(module => module.default), {})
    await settle()
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
    await second.dispose()
    await settle()
    // The first mount is still the one in force, and it owns the name.
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
  })

  it('stays out of the way when the tree restores cwd itself', async () => {
    const harness = await world({ mount: false })
    harness.ctx.systemPrompt.variable('cwd', () => '/from-core')
    await settle()
    await harness.mount()
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
    assert.match(harness.log.text(), /already registered/)
    assert.equal((await harness.ctx.systemPrompt.assemble()).variables.cwd, '/from-core')
  })

  it('does not throw on a refused registration, because a refused name still resolves', async () => {
    const harness = await world({ mount: false })
    harness.ctx.systemPrompt.variable('cwd', () => '/from-core')
    await settle()
    await assert.doesNotReject(() => harness.mount())
  })
})

describe('the directory service is optional', () => {
  it('renders the session header value when the composition has no workingDirectory', async () => {
    const harness = await world()
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
    assert.equal(
      (await harness.ctx.systemPrompt.assemble({ agent: agentWithSession(sessionWith('/project')) })).variables.cwd,
      '/project',
    )
  })

  it('prefers the effective directory when the service is present', async () => {
    const harness = await world({ currentDirectory: '/moved' })
    assert.equal(
      (await harness.ctx.systemPrompt.assemble({ agent: agentWithSession(sessionWith('/project')) })).variables.cwd,
      '/moved',
    )
  })

  it('honours source: original even when the service is present', async () => {
    const harness = await world({ currentDirectory: '/moved', config: { source: 'original' } })
    assert.equal(
      (await harness.ctx.systemPrompt.assemble({ agent: agentWithSession(sessionWith('/project')) })).variables.cwd,
      '/project',
    )
  })
})

describe('configuration', () => {
  it('registers nothing when disabled, and says why', async () => {
    const harness = await world({ config: { enabled: false, log: 'debug' } })
    assert.deepEqual(await registered(harness.ctx), [])
    assert.match(harness.log.text(), /disabled by configuration/)
  })

  it('is silent at log: silent, including on the disabled path', async () => {
    const harness = await world({ config: { log: 'silent' } })
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
    assert.equal(harness.log.text(), '')
  })

  it('is silent at log: silent even for the line it would otherwise warn about', async () => {
    const harness = await world({ mount: false, config: { log: 'silent' } })
    harness.ctx.systemPrompt.variable('cwd', () => '/from-core')
    await settle()
    await harness.mount()
    assert.deepEqual(await registered(harness.ctx), ['cwd'])
    assert.equal(harness.log.text(), '')
  })

  it('reports the registration at log: debug', async () => {
    const harness = await world({ config: { log: 'debug' } })
    assert.match(harness.log.text(), /restored the prompt variable "cwd"/)
  })

  it('says nothing on success at the default level, because a working mount is not news', async () => {
    const harness = await world()
    assert.equal(harness.log.text(), '')
  })

  it('fails the mount, not the turn, when the configuration is unusable', async () => {
    const harness = await world({ mount: false })
    await assert.rejects(() => harness.mount({ fallback: '' }), /must be a non-empty directory/)
    assert.deepEqual(await registered(harness.ctx), [])
  })
})
