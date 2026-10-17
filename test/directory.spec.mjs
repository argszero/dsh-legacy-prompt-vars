/**
 * Which directory `{{cwd}}` renders.
 *
 * The clause a profile carries is `Your working directory is {{cwd}}.` — a
 * sentence about *where I am*, written when the two candidate values were the
 * same thing. After `79bd3d8da7` they can differ: the session header keeps the
 * project it started in, while the effective directory can be moved. So the
 * interesting arms are the ones where both are readable and disagree, and the
 * one where neither is readable at all.
 *
 * @module test/directory.spec
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveDirectory } from '../lib/index.js'

/** Shorthand for the inputs of one arm. */
function inputs(source, current, original, fallback = '/fallback') {
  return { source, current, original, fallback }
}

describe('the preferred source wins when both are readable', () => {
  it('renders the effective directory for source: current', () => {
    assert.deepEqual(
      resolveDirectory(inputs('current', '/moved', '/project')),
      { value: '/moved', origin: 'current' },
    )
  })

  it('renders the original project for source: original', () => {
    assert.deepEqual(
      resolveDirectory(inputs('original', '/moved', '/project')),
      { value: '/project', origin: 'original' },
    )
  })
})

describe('the other half is used before the fallback', () => {
  it('falls back to the original project when the effective directory is unreadable', () => {
    assert.deepEqual(
      resolveDirectory(inputs('current', undefined, '/project')),
      { value: '/project', origin: 'original' },
    )
  })

  it('falls back to the effective directory when the header recorded none', () => {
    assert.deepEqual(
      resolveDirectory(inputs('original', '/moved', undefined)),
      { value: '/moved', origin: 'current' },
    )
  })
})

describe('an empty string is not a directory', () => {
  it('skips an empty effective directory', () => {
    assert.deepEqual(
      resolveDirectory(inputs('current', '', '/project')),
      { value: '/project', origin: 'original' },
    )
  })

  it('skips a whitespace-only header value', () => {
    assert.deepEqual(
      resolveDirectory(inputs('original', '/moved', '   ')),
      { value: '/moved', origin: 'current' },
    )
  })

  it('still skips empties when it is the preferred source', () => {
    assert.deepEqual(
      resolveDirectory(inputs('original', '  ', '')),
      { value: '/fallback', origin: 'fallback' },
    )
  })
})

describe('nothing readable still renders a directory', () => {
  it('has no path that answers undefined — an undefined value is fatal at render time', () => {
    for (const source of ['current', 'original']) {
      const resolved = resolveDirectory(inputs(source, undefined, undefined, '/launch'))
      assert.equal(resolved.value, '/launch')
      assert.equal(resolved.origin, 'fallback')
      assert.equal(typeof resolved.value, 'string')
    }
  })
})
