# tf3-mod-validator

[![CI](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml)

*Leer en [español](README.es.md).*

Checks Transport Fever 3 mods **without opening the game**.

- **Today:** one mod at a time. `mod.json` and `_metadata/modinfo.json` must be well formed.
- **Next:** mod sets. A group of mods must work in any combination: unique `modId`s, no two mods
  shipping the same file under `content/`, no dependency cycles, symmetric incompatibilities.

Every check is a fixed rule or a numeric limit, so the same mod always gives the same result. The
rules are written down in [docs/mod-format.md](docs/mod-format.md).

> This is an unofficial community project. Transport Fever is a trademark of Urban Games, which
> neither made nor endorses this tool.

## Requirements

Node.js 24 or later. No runtime dependencies.

## Usage

Not on npm yet. From a clone of this repository:

```bash
pnpm install
node bin/tf3-mod-validator.js path/to/my_mod
```

Several folders can be checked in one run; each one is checked on its own:

```bash
node bin/tf3-mod-validator.js mods/author_first mods/author_second
```

Example output:

```text
mods/author_first (author_first)
  error    MODJSON_PARAM_DEFAULTINDEX  mod.json#/params/0/defaultIndex
           "defaultIndex" must be an integer from 0 to 1, got 2. It is 0-based in JSON: the first value is 0.
  warning  MODINFO_AUTHORS_MISSING  _metadata/modinfo.json
           "authors" is missing or empty.

1 mod checked: 1 error, 1 warning.
```

Each finding gives its severity, a stable code, the file and a
[JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) to the exact field.

### Options

| Option | Effect |
|---|---|
| `--json` | Print the report as JSON (see below). |
| `-h`, `--help` | Show the help. |
| `-v`, `--version` | Print the version. |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No errors. Warnings may exist. |
| `1` | At least one error. |
| `2` | Usage error (bad option, missing folder) or internal failure. |

### JSON output

```json
{
  "schemaVersion": 1,
  "mods": [
    {
      "dir": "mods/author_first",
      "modId": "author_first",
      "findings": [
        {
          "code": "MODINFO_AUTHORS_MISSING",
          "severity": "warning",
          "file": "_metadata/modinfo.json",
          "pointer": "",
          "message": "\"authors\" is missing or empty."
        }
      ]
    }
  ],
  "summary": { "mods": 1, "errors": 0, "warnings": 1 }
}
```

`modId` is `null` when `mod.json` has no valid one. `pointer` is `""` when the finding is about the
whole file. `schemaVersion` changes only when this shape changes in an incompatible way.

## Library

```js
import { validateMod, checkModJson, checkModInfo, CODES } from 'tf3-mod-validator';

const { modId, findings } = await validateMod('path/to/my_mod');

// The checks also work on already-parsed JSON:
checkModJson({ modId: 'author_name', revision: 1 }, { folderName: 'author_name' });
checkModInfo({ name: 'My mod', tags: ['Misc'] }, { hasDescriptionHtml: false });
```

`validateMod` rejects with `NotADirectoryError` when the path is not a folder. Every other problem,
including a missing or unparseable file, is a finding.

## Finding codes

A code never changes meaning or severity once released; new checks get new codes. Errors are
things the format forbids. Warnings are things that are allowed but are probably a mistake, or rules
we have not confirmed in the game yet.

### mod.json

| Code | Severity | Meaning |
|---|---|---|
| `MODJSON_MISSING` | error | mod.json does not exist. |
| `MODJSON_INVALID_JSON` | error | mod.json is not valid JSON. |
| `MODJSON_BOM` | warning | mod.json starts with a UTF-8 byte order mark. |
| `MODJSON_NOT_OBJECT` | error | mod.json does not contain a JSON object. |
| `MODJSON_UNKNOWN_FIELD` | warning | mod.json has a top-level field that is not in the documented format. |
| `MODJSON_FIELD_TYPE` | error | A mod.json field has the wrong JSON type. |
| `MODJSON_MODID_MISSING` | error | `modId` is missing. |
| `MODJSON_MODID_FORMAT` | error | `modId` is not a non-empty string of `a-z`, `0-9` and `_`. |
| `MODJSON_MODID_CONVENTION` | warning | `modId` does not follow the `<author>_<name>` convention. |
| `MODJSON_MODID_FOLDER_MISMATCH` | warning | The mod folder name is not equal to `modId`. |
| `MODJSON_REVISION_MISSING` | error | `revision` is missing. |
| `MODJSON_REVISION_TYPE` | error | `revision` is not an integer. |
| `MODJSON_REVISION_RANGE` | error | `revision` is negative. |
| `MODJSON_SEVERITY_VALUE` | error | `severityAdd` or `severityRemove` is not `None`, `Warning` or `Critical`. |
| `MODJSON_DEP_MOD_MISSING` | error | A dependency has no `mod` object. |
| `MODJSON_DEP_MODID_MISSING` | error | A dependency has no `mod.modId`. |
| `MODJSON_DEP_MODID_FORMAT` | error | A dependency `mod.modId` is not a valid modId. |
| `MODJSON_DEP_REVISION_INVALID` | error | A dependency `revisionMin` or `revisionMax` is not `-1` or a non-negative integer. |
| `MODJSON_DEP_REVISION_RANGE` | error | A dependency has `revisionMin` greater than `revisionMax`. |
| `MODJSON_DEP_SELF` | error | The mod lists itself as a dependency. |
| `MODJSON_DEP_DUPLICATE` | error | The same modId appears twice in `dependencies`. |
| `MODJSON_DEP_MODINFO_MISSING` | warning | A dependency has no `modInfo` object. |
| `MODJSON_DEP_DISPLAYNAME_MISSING` | warning | A dependency `modInfo` has no non-empty `displayName`. |
| `MODJSON_INCOMPAT_MOD_MISSING` | error | An incompatibility has no `mod` object. |
| `MODJSON_INCOMPAT_MODID_MISSING` | error | An incompatibility has no `mod.modId`. |
| `MODJSON_INCOMPAT_MODID_FORMAT` | error | An incompatibility `mod.modId` is not a valid modId. |
| `MODJSON_INCOMPAT_REVISION_INVALID` | error | An incompatibility `revisionMin` or `revisionMax` is not `-1` or a non-negative integer. |
| `MODJSON_INCOMPAT_REVISION_RANGE` | error | An incompatibility has `revisionMin` greater than `revisionMax`. |
| `MODJSON_INCOMPAT_SELF` | error | The mod lists itself as incompatible. |
| `MODJSON_INCOMPAT_DUPLICATE` | error | The same modId appears twice in `incompatibilities`. |
| `MODJSON_DEP_INCOMPAT_CONFLICT` | error | A modId is both a dependency and an incompatibility. |
| `MODJSON_PARAM_KEY_MISSING` | error | A param has no non-empty `key`. |
| `MODJSON_PARAM_KEY_DUPLICATE` | error | Two params share the same `key`. |
| `MODJSON_PARAM_NAME_MISSING` | error | A param has no non-empty `name`. |
| `MODJSON_PARAM_UITYPE_MISSING` | warning | A param has no `uiType`. |
| `MODJSON_PARAM_UITYPE_VALUE` | error | A param `uiType` is not `Button`, `Slider`, `ComboBox`, `IconButton` or `CheckBox`. |
| `MODJSON_PARAM_VALUES_INVALID` | error | A param `values` is missing or is not an array of strings. |
| `MODJSON_PARAM_VALUES_EMPTY` | error | A param `values` is an empty array. |
| `MODJSON_PARAM_NUMBERS_INVALID` | error | A param `numbers` is not an array of finite numbers. |
| `MODJSON_PARAM_NUMBERS_LENGTH` | error | A param `numbers` does not have the same length as `values`. |
| `MODJSON_PARAM_DEFAULTINDEX` | error | A param `defaultIndex` is not a 0-based integer index into `values`. |
| `MODJSON_SCRIPT_FILENAME_FORMAT` | error | A script `fileName` is missing or does not match `<modId>::<file>@<function>`. |
| `MODJSON_SCRIPT_FOREIGN_MOD` | warning | A script `fileName` points at a modId other than this mod. |

### modinfo.json

| Code | Severity | Meaning |
|---|---|---|
| `MODINFO_MISSING` | error | _metadata/modinfo.json does not exist. |
| `MODINFO_INVALID_JSON` | error | modinfo.json is not valid JSON. |
| `MODINFO_BOM` | warning | modinfo.json starts with a UTF-8 byte order mark. |
| `MODINFO_NOT_OBJECT` | error | modinfo.json does not contain a JSON object. |
| `MODINFO_UNKNOWN_FIELD` | warning | modinfo.json has a top-level field that is not in the documented format. |
| `MODINFO_FIELD_TYPE` | error | A modinfo.json field has the wrong JSON type. |
| `MODINFO_NAME_MISSING` | error | `name` is missing or empty. |
| `MODINFO_NAME_LENGTH` | error | `name` is longer than 32 characters. |
| `MODINFO_NAME_LINEBREAK` | error | `name` contains a line break. |
| `MODINFO_SUMMARY_MISSING` | warning | `summary` is missing or empty. |
| `MODINFO_SUMMARY_LENGTH` | error | `summary` is longer than 100 characters. |
| `MODINFO_SUMMARY_LINEBREAK` | error | `summary` contains a line break. |
| `MODINFO_DESCRIPTION_IGNORED` | warning | `description` is set but `_metadata/description.html` exists, so the game ignores it. |
| `MODINFO_LOCALIZATION_UNKNOWN_FIELD` | warning | A `localization` entry has a field other than `name`, `summary` and `description`. |
| `MODINFO_AUTHORS_MISSING` | warning | `authors` is missing or empty. |
| `MODINFO_AUTHOR_NAME_MISSING` | error | An author has no non-empty `name`. |
| `MODINFO_TAGS_MISSING` | error | `tags` is missing or empty; at least one tag is required. |
| `MODINFO_TAG_DUPLICATE` | warning | The same tag appears twice in `tags`. |
| `MODINFO_DEPENDENCY_FORMAT` | error | A `dependencies` entry is not a mod.io id written as a string of digits. |
| `MODINFO_DEPENDENCY_DUPLICATE` | warning | The same mod.io id appears twice in `dependencies`. |
| `MODINFO_URL_FORMAT` | error | `url` is not an absolute http or https URL. |

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
```

Tests use `node:test`. The fixtures in `test/fixtures/` are tiny mods written from scratch for this
repository; no game files or third-party mods are included. A test fails if a code is missing from
the tests or from either README.

## License

Code: [MPL-2.0](LICENSE). Non-code assets, if any: CC BY-SA 4.0.
