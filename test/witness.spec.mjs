/**
 * The end-to-end claim, measured on the real service and the real renderer.
 *
 * Everything here runs against `@deepseek-ai/dsh-system-prompt` as published —
 * the same `assemble()` the request path calls and the same `renderPrompt()` it
 * renders with — because the plugin's claim is not "it registers a function" but
 * "a profile that was dying before a model call renders again". The first arm
 * reproduces the reported failure character for character, including the
 * `registered variables:` tail a user pastes into a bug report; the rest are
 * what the plugin changes about it.
 *
 * The `undefined` arm is deliberately not a restatement: it is the renderer's
 * own second fatal message, and it is the reason this plugin has a fallback
 * instead of answering "I don't know".
 *
 * @module test/witness.spec
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import systemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../lib/index.js'
import {
  LEGACY_SUFFIX,
  SUFFIX_SECTION,
  agentWithSession,
  sessionWith,
  settle,
  world,
} from './harness.mjs'

/** The message the report quotes, with the variable list a 0.2.1 install prints. */
const REPORTED = `unknown prompt variable "{{cwd}}" in section "${SUFFIX_SECTION}"; registered variables: provider, model`

/**
 * A context with the real service and the two variables the current tree
 * registers, and nothing else — the composition a 0.2.1 profile boots into.
 */
async function shippedComposition() {
  const ctx = new Context()
  await ctx.plugin(systemPrompt, { personaSuffix: LEGACY_SUFFIX })
  ctx.systemPrompt.variable('provider', () => 'deepseek')
  ctx.systemPrompt.variable('model', () => 'deepseek-chat')
  await settle()
  return ctx
}

describe('the failure this plugin exists for', () => {
  it('reproduces the reported message character for character', async () => {
    const ctx = await shippedComposition()
    const assembly = await ctx.systemPrompt.assemble({ agent: agentWithSession(sessionWith('/project')) })
    assert.throws(() => renderPrompt(assembly), (error) => {
      assert.equal(error.message, REPORTED)
      return true
    })
  })

  it('fails before any model call, which is why every run dies rather than one sentence going missing', async () => {
    const ctx = await shippedComposition()
    // Assembly itself succeeds; the render is what the request path cannot get
    // past. Neither has reached a provider adapter.
    const assembly = await ctx.systemPrompt.assemble()
    assert.equal(assembly.sections.length > 0, true)
    assert.throws(() => renderPrompt(assembly), /unknown prompt variable/)
  })

  it('is fatal in a second way when a provider answers undefined, which is why this plugin never does', async () => {
    const ctx = await shippedComposition()
    ctx.systemPrompt.variable('cwd', () => undefined)
    await settle()
    const assembly = await ctx.systemPrompt.assemble()
    assert.throws(
      () => renderPrompt(assembly),
      { message: `prompt variable "{{cwd}}" has no value for this assembly (section "${SUFFIX_SECTION}")` },
    )
  })
})

describe('after mounting', () => {
  it('renders the profile sentence, on the same composition that just threw', async () => {
    const harness = await world({ currentDirectory: '/moved' })
    const rendered = await harness.render({ agent: agentWithSession(sessionWith('/project')) })
    assert.match(rendered, /Your working directory is \/moved\.$/)
  })

  it('renders the original project when the profile asked for it', async () => {
    const harness = await world({ currentDirectory: '/moved', config: { source: 'original' } })
    const rendered = await harness.render({ agent: agentWithSession(sessionWith('/project')) })
    assert.match(rendered, /Your working directory is \/project\.$/)
  })

  it('renders instead of throwing when no agent is in hand, which is the diagnostics path', async () => {
    const harness = await world({ config: { fallback: '/launch/dir' } })
    const rendered = await harness.render({})
    assert.match(rendered, /Your working directory is \/launch\/dir\.$/)
  })

  it('renders the fallback rather than dying when the directory service itself fails', async () => {
    const harness = await world({
      currentDirectory: () => { throw new Error('the directory disappeared mid-flight') },
      config: { fallback: '/launch/dir' },
    })
    const rendered = await harness.render({ agent: agentWithSession(sessionWith('/project')) })
    // The header still knows where the session started, so the sentence stays true.
    assert.match(rendered, /Your working directory is \/project\.$/)
  })

  it('says so and still renders when the session itself cannot be read', async () => {
    const harness = await world({ config: { fallback: '/launch/dir' } })
    const hostile = { session: { get header() { throw new Error('torn session') } } }
    const rendered = await harness.render({ agent: hostile })
    assert.match(rendered, /Your working directory is \/launch\/dir\.$/)
    assert.match(harness.log.text(), /could not read the working directory \(torn session\)/)
  })

  it('quotes a non-Error fault as it is, because the message is the only diagnostic', async () => {
    const harness = await world({ config: { fallback: '/launch/dir' } })
    const hostile = { session: { get header() { throw 'not-an-error' } } }
    assert.match(await harness.render({ agent: hostile }), /Your working directory is \/launch\/dir\.$/)
    assert.match(harness.log.text(), /could not read the working directory \(not-an-error\)/)
  })

  it('gives the failure back when the fiber is disposed, so nothing is left mutated', async () => {
    const harness = await world()
    assert.match(await harness.render({ agent: agentWithSession(sessionWith('/project')) }), /\/project\.$/)
    await harness.dispose()
    const assembly = await harness.ctx.systemPrompt.assemble({ agent: agentWithSession(sessionWith('/project')) })
    assert.throws(() => renderPrompt(assembly), /unknown prompt variable "\{\{cwd\}\}"/)
  })

  it('leaves a profile that never used the variable exactly as it was', async () => {
    const ctx = new Context()
    await ctx.plugin(systemPrompt, { personaSuffix: 'Be brief.' })
    await settle()
    const before = renderPrompt(await ctx.systemPrompt.assemble())
    const fork = await ctx.plugin(plugin, {})
    await settle()
    const after = renderPrompt(await ctx.systemPrompt.assemble())
    assert.equal(after, before)
    await fork.dispose()
    await settle()
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble()), before)
  })
})
