#!/usr/bin/env node
/**
 * Mutation harness: inject one defect at a time into `src/`, rebuild, and
 * require the suite to notice.
 *
 * A defect the suite does **not** notice is a line of this plugin nobody is
 * measuring, so it is reported as `SILENT` and the run fails. A defect that does
 * not compile proves nothing at all — `tsc` refuses the tree and the suite never
 * runs — so it is reported as `TYPEFAIL` and the run fails too; `noEmitOnError`
 * in `tsconfig.json` is what makes that state impossible to mistake for a caught
 * one.
 *
 * A defect whose behaviour is indistinguishable from the original is declared
 * `equivalent` and **not run**: running it would print `SILENT` for a mutation
 * that changed nothing, and a harness that cannot tell those two apart is a
 * harness whose green means nothing. Each declared arm carries the reason it
 * cannot be observed, which is the claim a later reader gets to check.
 *
 * Usage: `npm run test:inject` (the pre-publish gate: `npm run build` first).
 *
 * @module scripts/inject-defects
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')

/** Every defect this harness knows, in the order it reports them. */
const DEFECTS = [
  // ---- what the plugin restores ----------------------------------------------
  {
    id: 'M01-restores-the-wrong-name',
    file: 'src/config.ts',
    find: "export const LEGACY_VARIABLE = 'cwd'",
    replace: "export const LEGACY_VARIABLE = 'cwd2'",
    what: 'the one name the previous release provided is not the name restored',
  },
  // ---- configuration: defaults ------------------------------------------------
  {
    id: 'M02-default-source-is-original',
    file: 'src/config.ts',
    find: "const source = (raw as LegacyPromptVarsConfig).source ?? 'current'",
    replace: "const source = (raw as LegacyPromptVarsConfig).source ?? 'original'",
    what: 'a bare mount renders the original project instead of the effective directory',
  },
  {
    id: 'M03-enabled-defaults-off',
    file: 'src/config.ts',
    find: '    ? true\n    : (raw as LegacyPromptVarsConfig).enabled',
    replace: '    ? false\n    : (raw as LegacyPromptVarsConfig).enabled',
    what: 'a mount with no configuration restores nothing',
  },
  {
    id: 'M04-fallback-defaults-to-empty',
    file: 'src/config.ts',
    find: '    ? environment.cwd\n',
    replace: "    ? ''\n",
    what: 'the default fallback is empty, so a bare mount cannot answer',
  },
  {
    id: 'M05-default-log-is-debug',
    file: 'src/config.ts',
    find: "const log = (raw as LegacyPromptVarsConfig).log ?? 'warn'",
    replace: "const log = (raw as LegacyPromptVarsConfig).log ?? 'debug'",
    what: 'a working mount talks at the default level',
  },
  {
    id: 'M06-source-precedence-flipped',
    file: 'src/config.ts',
    find: "export const DIRECTORY_SOURCES = ['current', 'original'] as const",
    replace: "export const DIRECTORY_SOURCES = ['original', 'current'] as const",
    what: 'the exported order no longer names the default first, so a reader picking DIRECTORY_SOURCES[0] gets the other one',
  },
  // ---- configuration: rejections ---------------------------------------------
  {
    id: 'M07-unknown-key-ignored',
    file: 'src/config.ts',
    find: '    if (!KNOWN_KEYS.includes(key)) {',
    replace: '    if (false) {',
    what: 'a misspelled knob mounts cleanly and restores nothing',
  },
  {
    id: 'M08-non-object-config-accepted',
    file: 'src/config.ts',
    find: "  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {",
    replace: '  if (false as boolean) {',
    what: 'a scalar or array configuration is read as a bare mount',
  },
  {
    id: 'M09-enabled-type-unchecked',
    file: 'src/config.ts',
    find: "if (typeof enabled !== 'boolean') fail(`\"enabled\" was ${typeof enabled} rather than a boolean`)",
    replace: 'if (false as boolean) fail(\'unreachable\')',
    what: 'a non-boolean enabled is taken as truthy',
  },
  {
    id: 'M10-source-value-unchecked',
    file: 'src/config.ts',
    find: "  if (typeof source !== 'string' || !DIRECTORY_SOURCES.includes(source as DirectorySource)) {",
    replace: '  if (false as boolean) {',
    what: 'an unknown directory source is accepted and silently treated as current',
  },
  {
    id: 'M11-whitespace-fallback-accepted',
    file: 'src/config.ts',
    find: "  if (typeof fallback !== 'string' || fallback.trim() === '') {",
    replace: "  if (typeof fallback !== 'string' || fallback === '') {",
    what: 'a whitespace-only fallback passes the check and renders a blank directory',
  },
  {
    id: 'M12-log-value-unchecked',
    file: 'src/config.ts',
    find: "  if (typeof log !== 'string' || !LOG_LEVELS.includes(log as LogLevel)) {",
    replace: '  if (false as boolean) {',
    what: 'an unknown log level is accepted',
  },
  // ---- the decision -----------------------------------------------------------
  {
    id: 'M13-empty-string-is-a-directory',
    file: 'src/directory.ts',
    find: "  return candidate !== undefined && candidate.trim() !== ''",
    replace: '  return candidate !== undefined',
    what: 'an empty remembered directory renders as a blank path',
  },
  {
    id: 'M14-source-original-ignored',
    file: 'src/directory.ts',
    find: "  const ordered: readonly (readonly [DirectoryOrigin, string | undefined])[] = inputs.source === 'original'\n    ? [['original', inputs.original], ['current', inputs.current]]\n    : [['current', inputs.current], ['original', inputs.original]]",
    replace: "  const ordered: readonly (readonly [DirectoryOrigin, string | undefined])[] = inputs.source === 'original'\n    ? [['current', inputs.current], ['original', inputs.original]]\n    : [['current', inputs.current], ['original', inputs.original]]",
    what: 'source: original quietly renders the effective directory instead',
  },
  {
    id: 'M15-origin-misreported',
    file: 'src/directory.ts',
    find: "    if (usable(candidate)) return { value: candidate, origin }",
    replace: "    if (usable(candidate)) return { value: candidate, origin: 'fallback' }",
    what: 'the log can no longer say which fact supplied the value',
  },
  {
    id: 'M16-no-fallback-value',
    file: 'src/directory.ts',
    find: "  return { value: inputs.fallback, origin: 'fallback' }",
    replace: "  return { value: '', origin: 'fallback' }",
    what: 'nothing readable renders an empty directory instead of the configured one',
  },
  // ---- reading the facts ------------------------------------------------------
  // The `agent?.session === undefined` guard has no arm: `SessionLike | undefined`
  // is what the field is, so removing the guard does not compile (measured as
  // TYPEFAIL twice before this note), and the compiler is the pin. What is
  // pinned below is the line the guard protects — the argument the service is
  // asked about.
  {
    id: 'M17-wrong-argument-to-the-service',
    file: 'src/register.ts',
    find: '    const value = service.get(agent.session)',
    replace: '    const value = service.get(agent.session.header as never)',
    what: 'the service is asked about the header rather than the session',
  },
  {
    id: 'M18-non-string-service-value-trusted',
    file: 'src/register.ts',
    find: "    return typeof value === 'string' ? value : undefined",
    replace: '    return value as string | undefined',
    what: 'a service answering a non-string puts that value into the prompt',
  },
  {
    id: 'M19-service-throw-propagates',
    file: 'src/register.ts',
    find: '  } catch {\n    // A service that cannot answer is a missing fact, not a fatal assembly.\n    return undefined\n  }',
    replace: '  } catch (error) {\n    throw error\n  }',
    what: 'a service that throws takes the whole assembly down',
  },
  {
    id: 'M20-provider-guard-removed',
    file: 'src/register.ts',
    find: '    } catch (error) {\n      // Unreachable by construction; kept because "by construction" is what a\n      // later edit quietly breaks, and the cost of being wrong here is a dead\n      // session rather than a wrong sentence.\n      onFault(error)\n      return config.fallback\n    }',
    replace: '    } catch (error) {\n      throw error\n    }',
    what: 'the provider throws, so a shim becomes the reason a turn dies',
  },
  {
    id: 'M21-fault-not-reported',
    file: 'src/register.ts',
    find: '      onFault(error)\n',
    replace: '      void onFault\n',
    what: 'a fault is absorbed silently, so the operator never learns the value is a guess',
  },
  {
    id: 'M22-fault-answers-empty',
    file: 'src/register.ts',
    find: '      return config.fallback\n    }\n  }',
    replace: "      return ''\n    }\n  }",
    what: 'an unreadable directory renders a blank path instead of the fallback',
  },
  {
    id: 'M23-last-decision-not-recorded',
    file: 'src/register.ts',
    find: '      last = resolved\n',
    replace: '',
    what: 'the origin of the rendered value cannot be reported',
  },
  {
    id: 'M24-dispose-not-idempotent',
    file: 'src/register.ts',
    find: '        if (!live) return\n',
    replace: '',
    what: 'a second disposal unregisters somebody else\'s provider',
  },
  {
    id: 'M25-refusal-propagates',
    file: 'src/register.ts',
    find: '  } catch (error) {\n    return {\n      outcome: \'already-registered\',',
    replace: '  } catch (error) {\n    if (error instanceof Error) throw error\n    return {\n      outcome: \'already-registered\',',
    what: 'a name somebody else registered fails the mount instead of being tolerated',
  },
  {
    id: 'M26-refusal-reported-as-registered',
    file: 'src/register.ts',
    find: "      outcome: 'already-registered',",
    replace: "      outcome: 'registered',",
    what: 'the plugin claims a registration it does not own',
  },
  // ---- the mount --------------------------------------------------------------
  {
    id: 'M27-inject-forgotten',
    file: 'src/index.ts',
    find: "export const inject = ['systemPrompt']",
    replace: 'export const inject: string[] = []',
    what: 'the plugin activates before the prompt service exists and cannot mount at all',
  },
  {
    id: 'M28-default-export-drops-inject',
    file: 'src/index.ts',
    find: 'export default { name, inject, apply }',
    replace: 'export default { name, apply }',
    what: 'a loader that mounts the default export hits `without inject`',
  },
  {
    id: 'M29-disabled-mounts-anyway',
    file: 'src/index.ts',
    find: '  if (!settings.enabled) {',
    replace: '  if (false as boolean) {',
    what: 'the off switch registers the variable anyway',
  },
  {
    id: 'M31-silent-still-talks',
    file: 'src/index.ts',
    find: "    if (settings.log === 'silent') return",
    replace: '    if (false as boolean) return',
    what: 'log: silent writes lines',
  },
  {
    id: 'M32-debug-chatter-at-default',
    file: 'src/index.ts',
    find: '    else if (settings.log === \'debug\') ctx.logger.debug(message)',
    replace: '    else ctx.logger.debug(message)',
    what: 'the success line is written even when the operator asked for warn only',
  },
  {
    id: 'M33-mount-config-ignored',
    file: 'src/index.ts',
    find: '  const settings: ResolvedConfig = resolveConfig(raw)',
    replace: '  const settings: ResolvedConfig = resolveConfig({})',
    what: 'the mounted configuration is discarded and every knob is defaults',
  },
  {
    id: 'M34-provider-not-wired',
    file: 'src/index.ts',
    find: '  const handle: RegisterHandle = registerLegacyVariable(ctx.systemPrompt, provider)',
    replace: '  const handle: RegisterHandle = registerLegacyVariable(ctx.systemPrompt, () => settings.fallback)',
    what: 'the restored variable always renders the fallback, whatever the session says',
  },
]

/** Arms whose behaviour cannot be told apart from the original, and why. */
const EQUIVALENT = [
  {
    id: 'E00-M30-disposal-forgotten (line deleted)',
    why: 'measured, then deleted rather than declared: `ctx.systemPrompt.variable()` returns the exact cordis '
      + 'effect disposer and an effect binds to the fiber that ran it, so an extra `ctx.effect(...)` in the plugin '
      + 'was a line no arm could distinguish from its absence — `test/lifecycle.spec.mjs` now measures the '
      + 'disposal instead, through the service',
  },
  {
    id: 'E01-warn-routed-to-debug',
    why: 'this suite asserts the text a line carries, not its severity, and cordis\'s default exporter '
      + 'threshold hides debug lines from an operator either way — the arm would print SILENT for a '
      + 'mutation whose only difference is which severity a filtered line was written at',
  },
  {
    id: 'E02-service-get-presence-check-removed',
    why: 'a service without `get` then throws inside the same try, so the surrounding catch answers the '
      + 'same `undefined`; the presence check turns a throw into a branch, not a different value',
  },
  {
    id: 'E03-refusal-reason-stringified',
    why: '`String(error)` on an Error prefixes the type but keeps the message, and the only assertion on '
      + 'the reason is a substring match, so no arm distinguishes the two spellings',
  },
]

const read = file => readFileSync(join(ROOT, file), 'utf8')

/** Compile; the first error line, or undefined when the tree compiles. */
function build() {
  try {
    execFileSync(process.execPath, [TSC], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' })
    return undefined
  } catch (error) {
    const output = String(error.stdout ?? '') + String(error.stderr ?? '')
    return output.trim().split('\n')[0] ?? 'tsc failed'
  }
}

/** Run the suite; true when it noticed something. */
function suiteNotices() {
  try {
    execFileSync(process.execPath, ['--test', 'test/*.spec.mjs'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' })
    return false
  } catch {
    return true
  }
}

const results = []
let failures = 0

for (const defect of DEFECTS) {
  const original = read(defect.file)
  const occurrences = original.split(defect.find).length - 1
  if (occurrences !== 1) {
    results.push([defect.id, `ANCHOR(${String(occurrences)})`, defect.what])
    failures += 1
    continue
  }
  writeFileSync(join(ROOT, defect.file), original.replace(defect.find, defect.replace))
  const compileError = build()
  let outcome
  if (compileError !== undefined) {
    outcome = 'TYPEFAIL'
    results.push([defect.id, outcome, `${defect.what} — ${compileError}`])
    failures += 1
  } else {
    outcome = suiteNotices() ? 'CAUGHT' : 'SILENT'
    if (outcome !== 'CAUGHT') failures += 1
    results.push([defect.id, outcome, defect.what])
  }
  writeFileSync(join(ROOT, defect.file), original)
  build()
}

const rebuilt = build()

for (const [id, outcome, what] of results) {
  console.log(`${outcome.padEnd(9)} ${id.padEnd(36)} ${what}`)
}
for (const entry of EQUIVALENT) {
  console.log(`${'EQUIVALENT'.padEnd(9)} ${entry.id.padEnd(36)} ${entry.why}`)
}
const caught = results.filter(([, outcome]) => outcome === 'CAUGHT').length
console.log('')
console.log(`arms: ${String(DEFECTS.length)} run, ${String(caught)} CAUGHT, `
  + `${String(results.filter(([, o]) => o === 'SILENT').length)} SILENT, `
  + `${String(results.filter(([, o]) => o === 'TYPEFAIL').length)} TYPEFAIL, `
  + `${String(results.filter(([, o]) => o.startsWith('ANCHOR'))).length} ANCHOR-MISS, `
  + `${String(EQUIVALENT.length)} declared EQUIVALENT`)
console.log(`restored tree: ${rebuilt === undefined ? 'compiles' : `FAILED — ${rebuilt}`}`)

if (failures > 0 || rebuilt !== undefined) {
  console.error('inject-defects: the suite does not pin every line this plugin promises')
  process.exitCode = 1
}
