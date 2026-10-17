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
import { type ResolvedConfig } from './config.ts';
import { type DirectoryResolved } from './directory.ts';
/** The part of an assembly context this plugin reads. */
export interface AssembleContextLike {
    /**
     * The agent whose prompt is being assembled; absent on diagnostics.
     *
     * This field is not declared by `@deepseek-ai/dsh-system-prompt` itself — it
     * arrives through `@deepseek-ai/dsh-agent`'s declaration merging — which is
     * why this type is structural rather than imported: a composition without
     * that package is still one this shim must survive in.
     */
    readonly agent?: AgentLike | undefined;
    /** Declared so the real `AssembleContext` stays assignable here; this plugin ignores it. */
    readonly scope?: unknown;
    /** Declared for the same reason; this plugin ignores it. */
    readonly signal?: unknown;
}
/** The part of an agent this plugin reads. */
export interface AgentLike {
    /** The agent's session. */
    readonly session?: SessionLike | undefined;
}
/** The part of a session this plugin reads. */
export interface SessionLike {
    /** The session header, whose `cwd` is the project the session started in. */
    readonly header?: {
        readonly cwd?: string | undefined;
    } | undefined;
}
/** The working-directory service, as far as this plugin uses it. */
export interface WorkingDirectoryLike {
    /** The effective directory for a session. */
    get(session: SessionLike): string | undefined;
}
/** A registry shaped like `ctx.systemPrompt`, narrowed to the one method used. */
export interface VariableRegistry {
    /**
     * Register a prompt variable.
     * @param name - the reference name.
     * @param provider - evaluated for each assembly.
     * @returns the disposer.
     */
    variable(name: string, provider: (context: AssembleContextLike) => string | undefined): () => void;
}
/** Reads a service by name at call time, the way `ctx.get` does. */
export type ServiceReader = (name: string) => unknown;
/** What happened when the plugin tried to register. */
export type RegisterOutcome = 'registered' | 'already-registered';
/** The registration, and the ability to hand it back. */
export interface RegisterHandle {
    /** Whether this plugin's provider is the one in force. */
    readonly outcome: RegisterOutcome;
    /** Why a registration was refused, when it was. */
    readonly reason?: string;
    /** Remove the registration; idempotent. */
    dispose(): void;
}
/** The name of the service the effective directory comes from. */
export declare const WORKING_DIRECTORY_SERVICE = "workingDirectory";
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
export declare function readCurrentDirectory(readService: ServiceReader, agent: AgentLike | undefined): string | undefined;
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
export declare function buildProvider(config: ResolvedConfig, readService: ServiceReader, onFault?: (error: unknown) => void): {
    provider: (context: AssembleContextLike) => string;
    last: () => DirectoryResolved | undefined;
};
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
export declare function registerLegacyVariable(registry: VariableRegistry, provider: (context: AssembleContextLike) => string | undefined, name?: string): RegisterHandle;
//# sourceMappingURL=register.d.ts.map