/**
 * `@argszero/dsh-legacy-prompt-vars` — keep a profile written against an older
 * release from failing every turn with `unknown prompt variable "{{cwd}}"`.
 *
 * **This is a compatibility shim, not the fix.** Discussions #9962 and #9948
 * report that after upgrading, every run dies before any model request:
 * `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix";
 * registered variables: provider, model`. The interpolation in
 * `packages/core/system-prompt/src/index.ts` is strict by design — an
 * unregistered name is never left as literal text — and `0.2.0-rc.2` was the
 * last release that registered `cwd`
 * (`packages/core/agent-loop/src/index.ts:372`,
 * `ctx.systemPrompt.variable('cwd', context => context.agent?.session.header.cwd)`).
 * Commit `79bd3d8da7` (first tagged `dsh-v0.2.1-alpha.2`, not an ancestor of
 * `dsh-v0.2.0-rc.2`) removed that registration and the factory
 * `personaSuffix: Your working directory is {{cwd}}.` together, and gave the
 * duty to the required runtime context `working-directory:current`.
 *
 * So a surviving `{{cwd}}` can only come from a layer an upgrade does not
 * rewrite — the profile's own `cordis.patch.yml`, the home patch, or a preset
 * row — where it stays forever, because the config editor writes a whole
 * `config` object back instead of the one field that was edited. The real
 * repair is to delete that line from the file
 * `dsh --profile <name> --dump-config` names; the upstream fix is to clean dead
 * references at load time, or to stop materializing defaults into the user
 * layer. Either way it is not a line a plugin can write.
 *
 * What a plugin can do is register the missing name, because
 * `ctx.systemPrompt.variable(name, provider)` is a public API and nothing in
 * the current tree registers `cwd`. This plugin registers exactly that one name
 * — of the three `0.2.0-rc.2` registered (`provider`, `model`, `cwd`, verified
 * by a full grep of that tag) it is the only one the commit took away — and
 * reads its value from the `workingDirectory`
 * service, then the session header, then a launch-directory fallback. It never
 * returns `undefined` and never throws: the renderer fails on an undefined value
 * too (`prompt variable "{{cwd}}" has no value for this assembly`), so a sloppy
 * shim would only trade one dead session for another.
 *
 * @module @argszero/dsh-legacy-prompt-vars
 */
import { LEGACY_VARIABLE, resolveConfig } from "./config.js";
import { buildProvider, registerLegacyVariable } from "./register.js";
export { DIRECTORY_SOURCES, LEGACY_VARIABLE, LOG_LEVELS, resolveConfig, } from "./config.js";
export { resolveDirectory, } from "./directory.js";
export { WORKING_DIRECTORY_SERVICE, buildProvider, readCurrentDirectory, registerLegacyVariable, } from "./register.js";
/** The name cordis mounts this plugin under. */
export const name = 'legacy-prompt-vars';
/**
 * The services this plugin waits for.
 *
 * `systemPrompt` is the whole plugin. `workingDirectory` is deliberately *not*
 * here: it is a separate package, so a composition without it is supported, and
 * the value is read at call time — an injected dependency would turn this shim
 * into something that never activates in exactly the profiles that need it.
 */
export const inject = ['systemPrompt'];
/** The prefix every line this plugin writes carries. */
export const LOG_PREFIX = 'legacy-prompt-vars:';
/**
 * Restore the prompt variables a previous release provided.
 * @param ctx - the plugin context; the registration is handed back on disposal.
 * @param raw - the mounted configuration.
 * @throws when the configuration itself is unusable, which is a mount-time
 * mistake rather than an assembly-time one.
 */
export function apply(ctx, raw = {}) {
    const settings = resolveConfig(raw);
    /**
     * Write one line, at a severity this plugin chooses rather than one the
     * logger filters later: `debug` chatter is suppressed unless the operator
     * asked for it, while an operator-facing line survives at the default level.
     * A knob whose only effect were a message the logger hides anyway would be a
     * knob with no observable behaviour.
     */
    const say = (message, kind) => {
        if (settings.log === 'silent')
            return;
        if (kind === 'warn')
            ctx.logger.warn(message);
        else if (settings.log === 'debug')
            ctx.logger.debug(message);
    };
    if (!settings.enabled) {
        say(`${LOG_PREFIX} disabled by configuration, so a profile that still references {{${LEGACY_VARIABLE}}} keeps failing`, 'debug');
        return;
    }
    const { provider } = buildProvider(settings, serviceName => ctx.get(serviceName), (error) => {
        say(`${LOG_PREFIX} could not read the working directory (${error instanceof Error ? error.message : String(error)}); `
            + `references render the fallback ${settings.fallback}`, 'warn');
    });
    const handle = registerLegacyVariable(ctx.systemPrompt, provider);
    switch (handle.outcome) {
        case 'registered':
            say(`${LOG_PREFIX} restored the prompt variable "${LEGACY_VARIABLE}" (source: ${settings.source}); `
                + 'a profile that still references it assembles again', 'debug');
            break;
        case 'already-registered':
            say(`${LOG_PREFIX} did not register "${LEGACY_VARIABLE}" because it is already registered `
                + `(${handle.reason ?? 'no reason given'}) — the name resolves either way, so this plugin stays out of the way`, 'warn');
            break;
    }
    // No disposer is registered here on purpose: `ctx.systemPrompt.variable()`
    // returns `the exact Cordis effect disposer`, and a cordis effect binds to the
    // fiber that ran it — this one. The registration therefore goes away with the
    // mount, which `test/lifecycle.spec.mjs` measures rather than assumes; adding
    // a second disposer here would be a line no test could tell apart from its
    // absence (mutation arm M30, measured and then deleted).
}
export default { name, inject, apply };
