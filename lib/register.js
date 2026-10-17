/**
 * Registering the name, and reading the facts it renders from — defensively.
 *
 * A prompt-variable provider runs *inside* request assembly, so an exception
 * thrown here is fatal in exactly the way this plugin exists to prevent: it
 * would replace `unknown prompt variable "{{cwd}}"` with a stack trace from the
 * shim itself. Everything in this module is therefore written so that no path
 * can throw and no path can answer `undefined` — see {@link buildProvider}.
 *
 * The two shapes the provider needs are narrowed to structural types here
 * rather than imported from the harness, so this module has no cordis import
 * and the suite can drive it directly. The names that matter are pinned by the
 * witness, which mounts the real service.
 *
 * @module src/register
 */
import { LEGACY_VARIABLE } from "./config.js";
import { resolveDirectory } from "./directory.js";
/** The name of the service the effective directory comes from. */
export const WORKING_DIRECTORY_SERVICE = 'workingDirectory';
/**
 * Read the effective directory from the `workingDirectory` service, if it is
 * there and answers.
 *
 * The service is optional in both directions: a composition without it is a
 * supported one (it is a separate package), and a service that throws must not
 * take the assembly down with it. Both cases answer `undefined`, which the
 * resolver treats as "this fact is not available" rather than as a value.
 * @param readService - reads a service by name at call time.
 * @param agent - the agent whose directory is wanted, when there is one.
 * @returns the effective directory, or `undefined` when it cannot be read.
 */
export function readCurrentDirectory(readService, agent) {
    if (agent?.session === undefined)
        return undefined;
    try {
        const service = readService(WORKING_DIRECTORY_SERVICE);
        if (service === undefined || typeof service.get !== 'function')
            return undefined;
        const value = service.get(agent.session);
        return typeof value === 'string' ? value : undefined;
    }
    catch {
        // A service that cannot answer is a missing fact, not a fatal assembly.
        return undefined;
    }
}
/**
 * Build the provider that `{{cwd}}` resolves to.
 *
 * The returned function cannot throw and cannot answer `undefined`, whatever the
 * context or the services do — a guarantee the suite asserts directly, because
 * the two ways to break it are the two ways to turn this mitigation into a
 * second fatal error.
 * @param config - the resolved mount configuration.
 * @param readService - reads a service by name at call time (`ctx.get`).
 * @param onFault - told when reading had to be abandoned; used for the log only.
 * @returns the provider, plus how the last call decided (for tests and logs).
 */
export function buildProvider(config, readService, onFault = () => { }) {
    let last;
    const provider = (context) => {
        try {
            const agent = context.agent;
            const resolved = resolveDirectory({
                source: config.source,
                current: readCurrentDirectory(readService, agent),
                original: agent?.session?.header?.cwd,
                fallback: config.fallback,
            });
            last = resolved;
            return resolved.value;
        }
        catch (error) {
            // Unreachable by construction; kept because "by construction" is what a
            // later edit quietly breaks, and the cost of being wrong here is a dead
            // session rather than a wrong sentence.
            onFault(error);
            return config.fallback;
        }
    };
    return { provider, last: () => last };
}
/**
 * Register the restored variable.
 *
 * A refusal is not a failure of the mount: another provider already registers
 * this name — the current tree restoring `cwd` itself, or a second copy of this
 * plugin. In both cases the name *is* registered, which is the outcome this
 * plugin wants; it simply must not be the one answering.
 * @param registry - `ctx.systemPrompt` (or any object with `variable`).
 * @param provider - the provider from {@link buildProvider}.
 * @param name - the variable to restore.
 * @returns the registration handle; `dispose` is a no-op when refused.
 */
export function registerLegacyVariable(registry, provider, name = LEGACY_VARIABLE) {
    try {
        const off = registry.variable(name, provider);
        let live = true;
        return {
            outcome: 'registered',
            dispose() {
                if (!live)
                    return;
                live = false;
                off();
            },
        };
    }
    catch (error) {
        return {
            outcome: 'already-registered',
            reason: error instanceof Error ? error.message : String(error),
            dispose() { },
        };
    }
}
