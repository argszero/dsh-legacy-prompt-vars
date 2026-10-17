/**
 * The integration harness: a REAL cordis context carrying the REAL
 * `@deepseek-ai/dsh-system-prompt` service and its REAL renderer.
 *
 * Nothing about the seam is simulated. The plugin's whole claim is that a
 * profile whose persona suffix still says `Your working directory is {{cwd}}`
 * assembles again once a provider for that name exists — and the only honest way
 * to measure it is to register that section on the real service and render it
 * with `renderPrompt`, the same function the harness uses before a model call.
 * The failure this plugin exists for is reproduced here verbatim, in the test's
 * own first assumption, so a change in the service's wording cannot pass
 * unnoticed.
 *
 * `workingDirectory` is *not* simulated either: the tree's service is a separate
 * package, and what this plugin depends on is only that `ctx.get(name)` returns
 * something with `get(session)`. The harness provides exactly that shape, which
 * is what makes the "service absent" arm a real composition rather than a mock
 * with a flag.
 *
 * @module test/harness
 */

import { Context } from '@deepseek-ai/cordis'
import systemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../lib/index.js'

/** Let a mount's effects settle. Cordis applies effects asynchronously. */
export async function settle(milliseconds = 25) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * A logger that keeps every line, with the level it was written at.
 *
 * The plugin reaches the log through `ctx.logger`, which is cordis's own — so
 * the harness captures cordis's export stream rather than handing the plugin a
 * fake logger. What the plugin says is then measured where an operator would
 * read it.
 */
export function recordingLogger(ctx) {
  const lines = []
  ctx.logger.exporter({
    // DEBUG is the highest numeric level (error 0 … debug 3), so 3 exports all.
    levels: { default: 3 },
    export: (message) => {
      lines.push({
        type: message.type,
        level: message.level,
        text: message.args.map(argument => (typeof argument === 'string' ? argument : String(argument))).join(' '),
      })
    },
  })
  return {
    lines,
    /** Every line whose text contains `needle`. */
    matching(needle) { return lines.filter(line => line.text.includes(needle)) },
    /** The joined text of every line. */
    text() { return lines.map(line => line.text).join('\n') },
    /** The severity names the lines were written at. */
    types() { return lines.map(line => line.type) },
  }
}

/** The persona suffix a profile written against 0.2.0-rc.2 still carries. */
export const LEGACY_SUFFIX = 'Your working directory is {{cwd}}.'

/** The name of the section that suffix lives in. */
export const SUFFIX_SECTION = 'deployment:persona-suffix'

/**
 * A cordis context with the real prompt service, an optional directory service,
 * and an optional mount of this plugin.
 * @param spec - `config`, `mount` (false to mount later), and `currentDirectory`
 * (`undefined` leaves the working-directory service out of the composition).
 * @returns the context, the captured log, and the mount/dispose/render trio.
 */
export async function world(spec = {}) {
  const ctx = new Context()
  const log = recordingLogger(ctx)
  await ctx.plugin(systemPrompt, { personaSuffix: LEGACY_SUFFIX })
  if (spec.currentDirectory !== undefined) {
    const current = spec.currentDirectory
    await ctx.plugin({
      name: 'fake-working-directory',
      apply(scope) {
        scope.provide('workingDirectory', {
          get: (session) => (typeof current === 'function' ? current(session) : current),
        })
      },
    })
  }
  await settle()
  const harness = {
    ctx,
    log,
    /** The mounted fork, once `mount()` has run. */
    fork: undefined,
    mount: async (config = spec.config ?? {}) => {
      harness.fork = await ctx.plugin(plugin, config)
      await settle()
      return harness.fork
    },
    dispose: async () => {
      await harness.fork?.dispose()
      harness.fork = undefined
      await settle()
    },
    /**
     * Assemble and render, exactly as the request path does.
     * @param context - the per-assembly context, e.g. `{ agent }`.
     * @returns the rendered system prompt.
     */
    render: async (context = {}) => renderPrompt(await ctx.systemPrompt.assemble(context)),
  }
  if (spec.mount !== false) await harness.mount()
  return harness
}

/**
 * A session-shaped object whose header carries `cwd`, when one is given.
 * @param cwd - the original project directory, or `undefined` for a header without one.
 * @returns the session shape the plugin's types describe.
 */
export function sessionWith(cwd) {
  return cwd === undefined ? { header: {} } : { header: { cwd } }
}

/**
 * An agent carrying the given session.
 * @param session - the session shape, or `undefined` for an agent without one.
 * @returns an agent-shaped object with only the fields this plugin reads.
 */
export function agentWithSession(session) {
  return session === undefined ? {} : { session }
}
