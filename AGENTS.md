# AGENTS.md — tf3-mod-validator

Repository-specific instructions for any AI agent. Personal and global rules live in the author's
global `AGENTS.md`; this file only adds what is specific to this repo.

## What this is

A command-line tool, plus a library, that checks Transport Fever 3 mods **without opening the game**:

1. **Single mod:** `mod.json` and `_metadata/modinfo.json` are well formed.
2. **Mod set:** a group of mods can be activated in any combination without stepping on each other.

It is the first piece of a larger public collection of TF3 mods by the same author. That collection
is built on top of this validator.

## Language (exception to the global rule, for this repo only)

- `README.md`, code, **comments** and **commit messages** are in **English**.
- `README.es.md` is a Spanish translation of the README, kept in sync.
- Conversation with the author stays in Spanish.

## Stack and conventions

- **Node.js 24**, ESM (`"type": "module"`), **no runtime dependencies**. Every dev dependency needs a
  stated reason.
- Tests run with `node:test` through `node --test`. No Jest, Mocha or Vitest.
- Package manager: pnpm. Commit the lockfile and use `--frozen-lockfile` in CI.
- CI: GitHub Actions on Node 24, running the tests on every push and pull request.
- Checks are **deterministic**: explicit rules and numeric limits. Each finding has a stable code
  (e.g. `MODJSON_MODID_FORMAT`), a severity (`error` or `warning`), a file path and a message.
- CLI exit code: `0` when there are no errors (warnings allowed), `1` when there are errors, and
  `2` for usage errors. A `--json` flag prints machine-readable output.

## Adding a check

1. Add the code to `src/codes.js`. Its severity lives there, not at the call site. Never rename or
   repurpose a released code; add a new one.
2. Report it from the check in `src/checks/` with a JSON Pointer to the exact field.
3. Test it in `test/`, and add a row to the codes tables of **both** READMEs.
   `test/codes.test.js` fails until all three are done.

## Intellectual property (hard rules)

This repo is public, and its development sessions are recorded and licensed as AI training data.
Therefore:

- **Never** add files from the game (`.tl` / `.d.tl` sources, models, textures or any other Urban
  Games asset), code from other people's mods, or text copied from the official wiki or script-doc.
- Test fixtures are small mods **written from scratch** for this repo.
- The format facts in `docs/mod-format.md` are the author's own notes, in our own words. Extend them
  the same way.
- Transport Fever is a trademark of Urban Games. This project is unofficial; the README says so.
- No third-party pull requests until `CONTRIBUTING.md` exists. It must state that contributions are
  accepted under MPL-2.0 and that repo content may be used in AI training datasets.

## License

- Code: **MPL-2.0** (`LICENSE`).
- Non-code assets (images, icons, long-form docs, if any): **CC BY-SA 4.0**.
- New source files start with the short MPL-2.0 header.

## Roadmap

1. Single-mod checks: `mod.json` and `modinfo.json` (see `docs/mod-format.md`), with fixtures,
   tests, CI and a README with a CI badge.
2. Mod-set checks: unique `modId`s, no two mods shipping the same path under `content/`, an acyclic
   dependency graph, symmetric incompatibilities, and the warnings listed under "Combinability" in
   `docs/mod-format.md`.
   Not covered yet, because `docs/mod-format.md` has no format facts to base a deterministic rule
   on: absolute values on base resources in load scripts, and `react-replacement-config` recipes.
3. Publish to npm.
