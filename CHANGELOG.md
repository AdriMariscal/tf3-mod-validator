# Changelog

All notable changes to this project are listed here. Versions follow
[Semantic Versioning](https://semver.org/). Before 1.0.0, a minor version may change finding codes
or the JSON output in incompatible ways; the changelog says so when it happens.

## 0.2.1

- Accept `mod.json` files written the way the mods shipped with the game write them: `null` for
  `dependencies`, `incompatibilities` and `params`, an `options` field, and `""` as a script hook or
  its `fileName` for no script. 0.2.0 reported errors for all of them.
- `autoActivate` (boolean) and `url` (string) are known `mod.json` fields now.
- A script `fileName` may have a slash after `::`, as in `<modId>::/mod.script@preRunFn`.

## 0.2.0

- `--format github` prints GitHub Actions annotations, one per finding (one per location for set
  findings). `--format text` and `--format json` are accepted too; `--json` stays as a shorthand.

## 0.1.0

First release.

- Single-mod checks for `mod.json` and `_metadata/modinfo.json`.
- Mod-set checks with `--set` / `validateModSet`: duplicate modIds, dependencies, cycles,
  incompatibilities, `content/` collisions, saved-data keys and `ug_require` module fields.
- Text and `--json` output; exit codes 0, 1 and 2.

The 0.1.0 package on npm was published by hand from a later commit, so it already includes
`--format github`. The `v0.1.0` tag marks the commit that was meant to ship.
