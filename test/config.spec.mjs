/**
 * What a mount accepts.
 *
 * Every arm here is a mistake an operator can actually make in a
 * `cordis.patch.yml` roster, and the plugin's answer to each is the same: fail
 * the mount, at mount time. A shim that mounts silently and restores nothing is
 * indistinguishable from one that was never listed — and the session keeps
 * dying with a message that says `cwd` is unknown, which is exactly the
 * question the operator was trying to answer.
 *
 * @module test/config.spec
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DIRECTORY_SOURCES,
  LEGACY_VARIABLE,
  LOG_LEVELS,
  resolveConfig,
} from '../lib/index.js'

const ENV = { cwd: '/launch/dir' }

describe('what the plugin restores', () => {
  it('restores the one name the previous release provided', () => {
    assert.equal(LEGACY_VARIABLE, 'cwd')
  })

  it('offers exactly the two directory sources and three log levels', () => {
    assert.deepEqual([...DIRECTORY_SOURCES], ['current', 'original'])
    assert.deepEqual([...LOG_LEVELS], ['silent', 'warn', 'debug'])
  })
})

describe('resolveConfig defaults', () => {
  it('is enabled, follows the effective directory, and falls back to the launch directory', () => {
    const config = resolveConfig(undefined, ENV)
    assert.equal(config.enabled, true)
    assert.equal(config.source, 'current')
    assert.equal(config.fallback, '/launch/dir')
    assert.equal(config.log, 'warn')
  })

  it('treats an empty object as a bare mount', () => {
    assert.deepEqual(resolveConfig({}, ENV), resolveConfig(undefined, ENV))
  })

  it('is quiet about success: the default level is warn, not debug', () => {
    assert.equal(resolveConfig({}, ENV).log, 'warn')
  })
})

describe('resolveConfig rejections', () => {
  it('rejects a non-object configuration', () => {
    for (const raw of [null, 'enabled', 7, ['enabled']]) {
      assert.throws(() => resolveConfig(raw, ENV), /configuration must be an object/, String(raw))
    }
  })

  it('rejects a misspelled knob rather than mounting a plugin that does nothing', () => {
    assert.throws(
      () => resolveConfig({ enable: true }, ENV),
      /unknown configuration key "enable".*enabled, source, fallback, log/s,
    )
  })

  it('rejects a non-boolean enabled', () => {
    assert.throws(() => resolveConfig({ enabled: 'yes' }, ENV), /"enabled" was string rather than a boolean/)
  })

  it('rejects an unknown directory source', () => {
    assert.throws(() => resolveConfig({ source: 'header' }, ENV), /"source" was "header".*current, original/s)
    assert.throws(() => resolveConfig({ source: 3 }, ENV), /"source" was 3/)
  })

  it('rejects an empty fallback, because undefined is itself fatal at render time', () => {
    for (const fallback of ['', '   ']) {
      assert.throws(() => resolveConfig({ fallback }, ENV), /must be a non-empty directory/)
    }
    assert.throws(() => resolveConfig({ fallback: 42 }, ENV), /must be a non-empty directory/)
  })

  it('rejects an unknown log level', () => {
    assert.throws(() => resolveConfig({ log: 'info' }, ENV), /"log" was "info".*silent, warn, debug/s)
    assert.throws(() => resolveConfig({ log: false }, ENV), /"log" was false/)
  })

  it('accepts every declared value of every enum', () => {
    for (const source of DIRECTORY_SOURCES) {
      for (const log of LOG_LEVELS) {
        const config = resolveConfig({ enabled: false, source, fallback: '/x', log }, ENV)
        assert.deepEqual(config, { enabled: false, source, fallback: '/x', log })
      }
    }
  })
})
