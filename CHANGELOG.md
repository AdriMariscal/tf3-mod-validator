# Changelog

All notable changes to this project are listed here. Versions follow
[Semantic Versioning](https://semver.org/). Before 1.0.0, a minor version may change finding codes
or the JSON output in incompatible ways; the changelog says so when it happens.

## 0.1.0

First release.

- Single-mod checks for `mod.json` and `_metadata/modinfo.json`.
- Mod-set checks with `--set` / `validateModSet`: duplicate modIds, dependencies, cycles,
  incompatibilities, `content/` collisions, saved-data keys and `ug_require` module fields.
- Text and `--json` output; exit codes 0, 1 and 2.
