# @argszero/dsh-legacy-prompt-vars

Keep an upgraded profile working: restore the prompt variable a previous dsh
release provided, so a persona suffix that still says
`Your working directory is {{cwd}}.` assembles again instead of failing every
turn before the model is called.

- Discussions: [#9962](https://github.com/deepseek-ai/deepseek-harness/discussions/9962), [#9948](https://github.com/deepseek-ai/deepseek-harness/discussions/9948)
- Zero runtime dependencies; one registration; removed again on disposal.

## The symptom

```
this round failed: unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix";
registered variables: provider, model
```

Every run fails, from the first one after the upgrade, with no model request
made. It is not a parse problem in the model call and not a configuration
typo you can debug from the message: the text is interpolated while the request
is assembled (`packages/core/system-prompt/src/index.ts`), and an unregistered
name is a hard error there by design — nothing is left as literal text.

## Why it happens

- `0.2.0-rc.2` registered `cwd`
  (`packages/core/agent-loop/src/index.ts:372`,
  `ctx.systemPrompt.variable('cwd', context => context.agent?.session.header.cwd)`)
  and shipped a default persona suffix that used it
  (`packages/bundle/web-app/cordis.patch.yml` and its siblings:
  `personaSuffix: Your working directory is {{cwd}}.`).
- Commit `79bd3d8da7` (*feat(session): centralize working directories and
  directory context*, first tagged `dsh-v0.2.1-alpha.2`, **not** an ancestor of
  `dsh-v0.2.0-rc.2`) removed both, and gave the duty to the required runtime
  context `working-directory:current`.
- The current tree therefore registers exactly two prompt variables —
  `provider` and `model` — which is the list the error prints.

So the surviving `{{cwd}}` is in a layer an upgrade does not rewrite: your
profile's `cordis.patch.yml`, your home patch, or a preset row. It stays there
because the config editor writes a whole `config` object back rather than the
one field that was edited, so a value the old release materialized is frozen
permanently — deleting the default upstream cannot reach it.

## This is a shim, not the fix

**Do this instead, when you can.** Ask the harness which file it is reading:

```sh
dsh --profile <your profile> --dump-config          # each layer, with the file it came from
dsh --profile <your profile> --dump-default-config  # same, without your layers
```

Find the `personaSuffix` line that mentions `{{cwd}}` and delete it (or just the
clause). Nothing is lost: the current working directory is already delivered to
the model as a required runtime context, `working-directory:current`.

This plugin exists for the cases where that edit is not available yet — a
managed deployment, a shared profile, a machine you cannot reach today. It
registers `cwd` and resolves it from, in order:

1. the effective working directory, from the `workingDirectory` service
   (what the tree means by "current directory" after `79bd3d8da7`);
2. the session header's original project directory — what the removed
   registration actually returned in `0.2.0-rc.2`;
3. a configured fallback, the launch directory by default.

`source: original` swaps 1 and 2, if the sentence in your profile is meant to
name the project the session started in.

## Install

```sh
npm install @argszero/dsh-legacy-prompt-vars
```

Then mount it from your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: legacy-prompt-vars
      name: '@argszero/dsh-legacy-prompt-vars'
```

The package also ships a bundle patch (`cordis.patch.yml`) declaring the same
row, so a profile that lists this package as a bundle gets it without the
snippet above.

## Configuration

Every knob is optional; the defaults are the recommended mount.

| key | values | default | meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Mount without registering anything, to turn the shim off without editing the roster. |
| `source` | `current` \| `original` | `current` | Whether `{{cwd}}` renders the effective directory or the session's original project. |
| `fallback` | non-empty string | the launch directory | Used when no directory can be read at all, e.g. a diagnostics assembly with no agent. |
| `log` | `silent` \| `warn` \| `debug` | `warn` | `debug` adds the success line; `warn` keeps only what an operator must see; `silent` says nothing. |

An unknown key **fails the mount**. A shim that mounts silently and restores
nothing is indistinguishable from one that was never listed.

## What it will not do

- **It does not hide other unknown variables.** Only `cwd` is registered — of
  the three names `0.2.0-rc.2` registered (`provider`, `model`, `cwd`) it is the
  only one that release-to-release change took away — so a typo like `{{cwdd}}`
  still fails loudly, which is what the strict interpolator is for.
- **It never answers `undefined`.** A provider that returns nothing is fatal in
  its own right — the renderer then throws
  `prompt variable "{{cwd}}" has no value for this assembly` — so an unreadable
  directory resolves to the fallback.
- **It never throws.** The provider runs inside request assembly; an exception
  here would replace one dead session with another, with a stranger message.
- **It does not fight the tree.** If a future release registers `cwd` again, the
  registration is refused, and the plugin reports that and stays out of the way.

## Verifying it worked

A run that used to die now starts. To see the registration itself:

```sh
log level debug   # the plugin's own line names the mount and the source
```

The test suite does not restate any of this: it mounts the real
`@deepseek-ai/dsh-system-prompt` service, reproduces the reported message
character for character, and renders the same profile again after the mount —
63 tests, 100% line, branch and function coverage on all four source modules,
plus a mutation harness (`npm run test:inject`, 33 arms, all caught) that
requires the suite to notice every injected defect.

## License

MIT
