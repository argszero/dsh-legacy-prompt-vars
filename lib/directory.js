/**
 * Which directory `{{cwd}}` renders, decided without touching a service.
 *
 * This module is deliberately free of cordis: the resolution order is the one
 * part of the plugin whose *policy* can be wrong — the question "when both
 * directories are readable, which one did the profile author mean?" — and a
 * pure function lets the suite answer that question directly instead of through
 * a mounted harness.
 *
 * Two rules are load-bearing:
 *
 * - an empty string is not a directory, so it is skipped rather than rendered
 *   as `Your working directory is .` — a session header can carry one, and a
 *   config editor can write one;
 * - there is no path through this function that returns `undefined`. The
 *   renderer treats an undefined value as fatal
 *   (`prompt variable "{{cwd}}" has no value for this assembly`, verified
 *   against `renderPrompt` in this package's witness), so "no directory
 *   available" must resolve to the configured fallback, not to absence.
 *
 * @module src/directory
 */
/** Whether a candidate is usable as a directory. */
function usable(candidate) {
    return candidate !== undefined && candidate.trim() !== '';
}
/**
 * Resolve the directory to render.
 *
 * The preferred source is tried first, then the other one, then the fallback:
 * a real directory from the wrong half of the pair still beats the launch
 * directory, because both halves describe the same session and the profile
 * author's clause is about "where I am", not about which field carried it.
 * @param inputs - the facts available to this assembly.
 * @returns the value to render and the fact it came from.
 */
export function resolveDirectory(inputs) {
    const ordered = inputs.source === 'original'
        ? [['original', inputs.original], ['current', inputs.current]]
        : [['current', inputs.current], ['original', inputs.original]];
    for (const [origin, candidate] of ordered) {
        if (usable(candidate))
            return { value: candidate, origin };
    }
    return { value: inputs.fallback, origin: 'fallback' };
}
