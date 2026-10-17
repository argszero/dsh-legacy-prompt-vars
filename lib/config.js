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
export const LEGACY_VARIABLE = 'cwd';
/** Where the restored value comes from. */
export const DIRECTORY_SOURCES = ['current', 'original'];
/** How much this plugin may say in the log. */
export const LOG_LEVELS = ['silent', 'warn', 'debug'];
/** The keys this plugin understands. */
const KNOWN_KEYS = ['enabled', 'source', 'fallback', 'log'];
/**
 * Decide every field of the mounted configuration.
 * @param raw - the mounted `config:` block, or `undefined` for a bare mount.
 * @param environment - the process facts defaults are derived from.
 * @returns the configuration the rest of the plugin uses.
 * @throws when the configuration itself is unusable — never at assembly time.
 */
export function resolveConfig(raw = {}, environment = { cwd: process.cwd() }) {
    const fail = (message) => {
        throw new TypeError(`legacy-prompt-vars: ${message}`);
    };
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        fail(`configuration must be an object, received ${Array.isArray(raw) ? 'an array' : typeof raw}`);
    }
    for (const key of Object.keys(raw)) {
        if (!KNOWN_KEYS.includes(key)) {
            fail(`unknown configuration key "${key}" (this plugin understands ${KNOWN_KEYS.join(', ')})`);
        }
    }
    const enabled = raw.enabled === undefined
        ? true
        : raw.enabled;
    if (typeof enabled !== 'boolean')
        fail(`"enabled" was ${typeof enabled} rather than a boolean`);
    const source = raw.source ?? 'current';
    if (typeof source !== 'string' || !DIRECTORY_SOURCES.includes(source)) {
        fail(`"source" was ${JSON.stringify(source)}; it must be one of ${DIRECTORY_SOURCES.join(', ')}`);
    }
    const fallback = raw.fallback === undefined
        ? environment.cwd
        : raw.fallback;
    if (typeof fallback !== 'string' || fallback.trim() === '') {
        fail('"fallback" must be a non-empty directory — a provider that answers undefined only replaces one fatal assembly error with another');
    }
    const log = raw.log ?? 'warn';
    if (typeof log !== 'string' || !LOG_LEVELS.includes(log)) {
        fail(`"log" was ${JSON.stringify(log)}; it must be one of ${LOG_LEVELS.join(', ')}`);
    }
    return {
        enabled: enabled,
        source: source,
        fallback: fallback,
        log: log,
    };
}
