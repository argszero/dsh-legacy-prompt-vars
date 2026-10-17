/**
 * Registration, and the two ways a shim can be worse than the bug.
 *
 * A prompt-variable provider runs inside request assembly. If it throws, the
 * turn dies with a stack trace from the shim; if it answers `undefined`, the
 * renderer throws `prompt variable "{{cwd}}" has no value for this assembly`.
 * Both are the same dead session the plugin was mounted to prevent, arriving
 * with a stranger message — so both are asserted against here, on every shape a
 * context can arrive in, including the ones the service itself never produces.
 *
 * @module test/register.spec
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WORKING_DIRECTORY_SERVICE,
  buildProvider,
  readCurrentDirectory,
  registerLegacyVariable,
} from '../lib/index.js'
import { agentWithSession, sessionWith } from './harness.mjs'

const CONFIG = { enabled: true, source: 'current', fallback: '/launch', log: 'warn' }

/** A registry that records what was registered and can refuse. */
function registry(refuse) {
  const calls = []
  return {
    calls,
    variable(name, provider) {
      if (refuse !== undefined) throw refuse
      calls.push({ name, provider })
      return () => { calls.splice(0, calls.length) }
    },
  }
}

/** Read a service out of a fixed table, the way `ctx.get` does. */
function services(table) {
  return name => table[name]
}

describe('readCurrentDirectory', () => {
  it('asks the service for this agent\'s session', () => {
    const seen = []
    const read = readCurrentDirectory(services({
      [WORKING_DIRECTORY_SERVICE]: { get: (session) => { seen.push(session); return '/moved' } },
    }), agentWithSession(sessionWith('/project')))
    assert.equal(read, '/moved')
    assert.deepEqual(seen, [sessionWith('/project')])
  })

  it('answers undefined when there is no agent, and never touches the service', () => {
    let asked = 0
    const read = readCurrentDirectory(() => { asked += 1; return { get: () => '/moved' } }, undefined)
    assert.equal(read, undefined)
    assert.equal(asked, 0)
  })

  it('answers undefined when the agent carries no session', () => {
    assert.equal(readCurrentDirectory(() => ({ get: () => '/moved' }), agentWithSession(undefined)), undefined)
  })

  it('answers undefined when the composition does not include the service', () => {
    assert.equal(readCurrentDirectory(() => undefined, agentWithSession(sessionWith('/project'))), undefined)
  })

  it('answers undefined when the service exposes no get', () => {
    assert.equal(readCurrentDirectory(() => ({}), agentWithSession(sessionWith('/project'))), undefined)
  })

  it('answers undefined when get answers something that is not a string', () => {
    for (const value of [undefined, null, 42, { toString: () => '/moved' }]) {
      assert.equal(readCurrentDirectory(() => ({ get: () => value }), agentWithSession(sessionWith('/project'))), undefined)
    }
  })

  it('answers undefined instead of propagating a service that throws', () => {
    const read = readCurrentDirectory(() => ({ get: () => { throw new Error('fs unavailable') } }), agentWithSession(sessionWith('/project')))
    assert.equal(read, undefined)
  })
})

describe('buildProvider', () => {
  it('renders the effective directory when both are readable', () => {
    const { provider } = buildProvider(CONFIG, services({ workingDirectory: { get: () => '/moved' } }))
    assert.equal(provider({ agent: agentWithSession(sessionWith('/project')) }), '/moved')
  })

  it('honours source: original', () => {
    const { provider } = buildProvider({ ...CONFIG, source: 'original' }, services({ workingDirectory: { get: () => '/moved' } }))
    assert.equal(provider({ agent: agentWithSession(sessionWith('/project')) }), '/project')
  })

  it('never answers undefined, whatever the context is', () => {
    const contexts = [
      {},
      { agent: undefined },
      { agent: {} },
      { agent: { session: undefined } },
      { agent: { session: {} } },
      { agent: { session: { header: {} } } },
      { agent: { session: { header: { cwd: '' } } } },
    ]
    for (const config of [CONFIG, { ...CONFIG, source: 'original' }]) {
      for (const context of contexts) {
        const { provider } = buildProvider(config, () => undefined)
        const value = provider(context)
        assert.equal(typeof value, 'string', JSON.stringify(context))
        assert.equal(value, '/launch')
      }
    }
  })

  it('needs no fault reporter: the default is silence, not a throw', () => {
    const hostile = { session: { get header() { throw new Error('torn session') } } }
    const { provider } = buildProvider(CONFIG, () => undefined)
    assert.equal(provider({ agent: hostile }), '/launch')
  })

  it('records how the last call decided, so a log line can name the origin', () => {
    const { provider, last } = buildProvider(CONFIG, services({ workingDirectory: { get: () => '/moved' } }))
    assert.equal(last(), undefined)
    provider({ agent: agentWithSession(sessionWith('/project')) })
    assert.deepEqual(last(), { value: '/moved', origin: 'current' })
  })

  it('answers the fallback instead of throwing when reading blows up', () => {
    const faults = []
    // A session whose header getter throws is the one shape `readCurrentDirectory`
    // cannot absorb — its own try/catch covers the service, not the session — so
    // it is the arm that proves the outer guard is real rather than decorative.
    const hostile = { session: { get header() { throw new Error('torn session') } } }
    const { provider, last } = buildProvider(CONFIG, () => undefined, error => faults.push(error))
    assert.equal(provider({ agent: hostile }), '/launch')
    assert.equal(faults.length, 1)
    assert.match(faults[0].message, /torn session/)
    assert.equal(last(), undefined, 'a fault leaves no decision to report')
  })
})

describe('registerLegacyVariable', () => {
  it('registers the one name and reports that it did', () => {
    const target = registry()
    const handle = registerLegacyVariable(target, () => '/moved')
    assert.equal(handle.outcome, 'registered')
    assert.equal(target.calls.length, 1)
    assert.equal(target.calls[0].name, 'cwd')
    assert.equal(target.calls[0].provider({}), '/moved')
  })

  it('hands the registration back on dispose, once', () => {
    let disposed = 0
    const target = { variable: () => () => { disposed += 1 } }
    const handle = registerLegacyVariable(target, () => '/moved')
    handle.dispose()
    handle.dispose()
    assert.equal(disposed, 1)
  })

  it('treats a refused registration as "somebody else provides the name"', () => {
    const handle = registerLegacyVariable(registry(new Error('prompt variable "cwd" is already registered')), () => '/moved')
    assert.equal(handle.outcome, 'already-registered')
    assert.match(handle.reason, /already registered/)
    // Disposal must not throw for a registration that never happened.
    handle.dispose()
  })

  it('records a non-Error refusal too, because the message is the only diagnostic', () => {
    const handle = registerLegacyVariable(registry('nope'), () => '/moved')
    assert.equal(handle.outcome, 'already-registered')
    assert.equal(handle.reason, 'nope')
  })

  it('registers a name other than the default when asked, without changing the default', () => {
    const target = registry()
    registerLegacyVariable(target, () => '/x', 'other')
    assert.equal(target.calls[0].name, 'other')
  })
})
