/**
 * What this plugin accepts at mount, and why each knob exists.
 *
 * The mounted configuration is the profile's `config:` block for this row, so a
 * misspelled knob is a mount that silently does nothing — the same class of
 * failure this plugin exists to repair. Every unknown key therefore fails the
 * mount loudly, and every value is type-checked here rather than at the first
 * assembly that happens to reference `{{cwd}}`.
 *
 * @module src/config
 */
/** The prompt variable this plugin restores. */
export declare const LEGACY_VARIABLE = "cwd";
/** Where the restored value comes from. */
export declare const DIRECTORY_SOURCES: readonly ["current", "original"];
/** Which directory `{{cwd}}` should render. */
export type DirectorySource = (typeof DIRECTORY_SOURCES)[number];
/** How much this plugin may say in the log. */
export declare const LOG_LEVELS: readonly ["silent", "warn", "debug"];
/** One logging level. */
export type LogLevel = (typeof LOG_LEVELS)[number];
/** Mounted configuration for this plugin. */
export interface LegacyPromptVarsConfig {
    /** Whether to register the variable at all; defaults to `true`. */
    enabled?: boolean;
    /**
     * Which directory the restored `{{cwd}}` renders.
     *
     * `current` (the default) follows the tree's own meaning after commit
     * `79bd3d8da7`: the effective directory, which a session may change, as
     * `packages/session/working-directory` reports it. `original` is what the
     * removed registration actually returned in 0.2.0-rc.2 —
     * `session.header.cwd`, the project the session started in, which never
     * changes.
     */
    source?: DirectorySource;
    /**
     * The value used when no directory can be read at all — a diagnostics
     * assembly with no agent, or a session that recorded none.
     *
     * It must be a non-empty string, because a provider that answers `undefined`
     * is fatal in its own right: the renderer then throws
     * `prompt variable "{{cwd}}" has no value for this assembly` instead of the
     * `unknown prompt variable` this plugin is here to remove. Defaults to the
     * directory the harness was launched in.
     */
    fallback?: string;
    /** `silent` says nothing, `warn` (the default) only what an operator must see. */
    log?: LogLevel;
}
/** A configuration whose every field is decided and checked. */
export interface ResolvedConfig {
    readonly enabled: boolean;
    readonly source: DirectorySource;
    readonly fallback: string;
    readonly log: LogLevel;
}
/** The environment a resolve reads, injected so a spec can stand in for it. */
export interface ResolveEnvironment {
    /** The directory this process was launched in. */
    readonly cwd: string;
}
/**
 * Decide every field of the mounted configuration.
 * @param raw - the mounted `config:` block, or `undefined` for a bare mount.
 * @param environment - the process facts defaults are derived from.
 * @returns the configuration the rest of the plugin uses.
 * @throws when the configuration itself is unusable — never at assembly time.
 */
export declare function resolveConfig(raw?: LegacyPromptVarsConfig | undefined, environment?: ResolveEnvironment): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map