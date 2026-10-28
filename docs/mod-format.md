# TF3 mod format — working notes

Our own notes on the Transport Fever 3 mod format, written in our own words. They come from reading
the official modding wiki and script reference in October 2026, and from open community research.
Official modding documentation is still incomplete, so treat anything marked **(unverified)** as a
hypothesis until it is tested in the game.

## Folder layout

```
<modId>/
  mod.json
  _content.json          (unverified: seen in community mods, not explained officially)
  strings.json           (optional, translations: { "<lang>": { "<key>": "<text>" } })
  _metadata/
    modinfo.json
    description.html     (optional, replaces modinfo.description)
    0.png ...            (previews; 0.png is the grid image, 1920x1080)
  content/               (game resources, mirroring the base game's layout)
```

The folder name has no functional role, but it should equal the `modId`.

## mod.json

| Field | Type | Rules |
|---|---|---|
| `modId` | string | Required. Only `a-z`, `0-9` and `_`. Convention: `<author>_<name>`. Identifies the mod regardless of folder. |
| `revision` | integer | Required. Increases with every published update. |
| `severityAdd` | string | `None`, `Warning` or `Critical`. Defaults to `None`. |
| `severityRemove` | string | Same values. Defaults to `Warning`. |
| `visible` | boolean | Defaults to `true`. |
| `cosmetic` | boolean | Defaults to `false`. When `true`, achievements stay enabled. |
| `dependencies` | array | Optional. See below. |
| `incompatibilities` | array | Optional. Entries have a `mod` object, shaped as in dependencies. |
| `params` | array | Optional. See below. |
| `preRunScript`, `runScript`, `postRunScript` | object | Optional. `{ "fileName": "<modId>::<file>@<function>" }`. |

Dependency entry:

- `mod`: `{ modId, revisionMin?, revisionMax? }`. `-1` or a missing value means no limit.
- `modInfo`: `{ displayName, url? }`.
- `loadBefore`: boolean, defaults to `true`.
- `optional`: boolean, defaults to `false`.

Param entry:

- `key`: used by scripts. `name`: label shown in the UI. `tooltip`: optional.
- `uiType`: `Button`, `Slider`, `ComboBox`, `IconButton` or `CheckBox`.
- `values`: strings, or file paths for `IconButton`.
- `numbers`: optional. The values handed to scripts, defaulting to 1, 2, 3, … When present, its
  length must equal `values.length`.
- `defaultIndex`: optional. **0-based** in JSON (scripts index from 1). Must be within `values`.

Load-time scripts receive the parameters of every active mod, keyed by `modId` and then by `key`.

## _metadata/modinfo.json

- `name`: at most 32 characters, no line breaks.
- `summary`: at most 100 characters, no line breaks.
- `description`: may contain line breaks. Ignored if `description.html` exists.
- `localization`: per-language overrides of `name`, `summary` and `description`.
- `authors`: array of `{ name, role }`.
- `tags`: one or more tags from the official list.
- `dependencies`: mod.io ids as strings. These are separate from the ones in `mod.json`.
- `url`: optional. Not reachable from consoles.

## Load order

The base game runs first, then mods in activation order. With `loadBefore`, a dependency loads
before the mod that needs it. When two installed copies share a `modId`, the game prefers the
staging area, then the manual install folder, then subscribed mods.

## Combinability (what makes two mods clash)

- **Same file path under `content/`**: the file loaded later silently replaces the other one. This
  is the most dangerous case and must be an error in a mod set.
- **Absolute values on base resources** in load scripts: the last mod wins. Multiplying a value
  composes instead (×2 then ×1.5 = ×3).
- **Replacing base UI recipes** (`react-replacement-config`): replaces them for everyone, and two
  mods replacing the same recipe conflict. Adding to an extension point
  (`react-plugin ::<ExtensionPoint>`) does not. (unverified)
- **Assigning fields of shared base modules** loaded with `ug_require` patches them globally.
  (unverified)
- **Saved-data keys** (`api.gui.game.setGuiSaveData(key, …)`) should equal the mod's `modId` so data
  never mixes. (unverified)
