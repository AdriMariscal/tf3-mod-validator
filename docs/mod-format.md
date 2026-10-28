# TF3 mod format — working notes

Our own notes on the Transport Fever 3 mod format, written in our own words. They come from reading
the official modding wiki, the script reference and the modding guides at tf3-docs.transportfever.net
in October 2026, and from open community research. Official modding documentation is still
incomplete, so treat anything marked **(unverified)** as a hypothesis until it is tested in the game.

## Folder layout

```
<modId>/
  mod.json
  _content.json          (lists loose files and zip archives; see below)
  strings.json           (optional, translations: { "<lang>": { "<key>": "<text>" } })
  _metadata/
    modinfo.json
    description.html     (optional, replaces modinfo.description)
    0.png ...            (previews; 0.png is the grid image, 1920x1080)
  content/               (game resources, mirroring the base game's layout)
```

The folder name has no functional role, but it should equal the `modId`.

`_content.json` has two lists: `files`, plain file names relative to `content/`, and `archives`,
objects with a `fileName` and the `entries` inside it. Mods shipped by the game list their loose
files there. Whether a hand-made mod needs the file at all is not documented. (unverified)

Names inside `content/` use lowercase `a-z`, `0-9`, `_` and `-`. The game recognises a resource by
its file ending (`.mdl`, `.con`, `.res.lua`, …), not by the folder it sits in.

## mod.json

| Field | Type | Rules |
|---|---|---|
| `modId` | string | Required. Only `a-z`, `0-9` and `_`. Convention: `<author>_<name>`. Identifies the mod regardless of folder. |
| `revision` | integer | Required. Increases with every published update. |
| `severityAdd` | string | `None`, `Warning` or `Critical`. Defaults to `None`. |
| `severityRemove` | string | Same values. Defaults to `Warning`. |
| `visible` | boolean | Defaults to `true`. |
| `cosmetic` | boolean | Defaults to `false`. When `true`, achievements stay enabled. |
| `autoActivate` | boolean | Listed among the mod.json keys; its effect is not documented. (unverified) |
| `url` | string | Listed among the mod.json keys. |
| `dependencies` | array or `null` | Optional. See below. |
| `incompatibilities` | array or `null` | Optional. Entries have a `mod` object, shaped as in dependencies. |
| `params` | array or `null` | Optional. See below. |
| `options` | `null` | Always `null` in the mods shipped with the game; its purpose is unknown. |
| `preRunScript`, `runScript`, `postRunScript` | object or `""` | Optional. `{ "fileName": "<modId>::/<file>@<function>" }`. See "Script hooks". |

The mods shipped with the game write `null`, not an empty array, for `dependencies`,
`incompatibilities` and `params` when they have none, and they always include `options: null`.

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

## Paths

Inside a mod, a path that starts with `/` is absolute within that mod's `content/`; one without a
leading `/` is relative to the file that names it. `::/` points into the base game and
`<modId>::/` into the named mod. `../` is not allowed.

## Script hooks

The three hooks in `mod.json` name a function in a script. Mods shipped with the game write
`<modId>::/<file>@<function>`, with the slash and without the file extension; the wiki writes it
without the slash, and both forms are accepted. A hook whose `fileName` is the empty string `""` is
not used: mods shipped with the game and community mods write it that way. (unverified, but the
game loads such mods)

| Hook | Runs | Receives | Used for |
|---|---|---|---|
| `preRunScript` | before resources load | `captureParams, configDict, allModParams, baseConfig` | Writing to the base config: global costs, economy and gameplay settings. |
| `runScript` | while resources load | `captureParams, configDict, allModParams` | Registering resource modifiers and file filters. |
| `postRunScript` | once, after all resources load | `captureParams, configDict, allModParams` | Reading, changing, adding or hiding loaded resources through `api.res`. |

`allModParams` holds the parameter values of every active mod, keyed by `modId`; a mod finds its own
entry with `getCurrentModId()`. The wiki advises doing changes in `postRunScript` where possible and
keeping modifiers for what cannot be done there.

Each hook phase runs for the base game first and then for every active mod in activation order.

## Load order

The base game runs first, then mods in activation order. With `loadBefore`, a dependency loads
before the mod that needs it. When two installed copies share a `modId`, the game prefers the
staging area, then the manual install folder, then subscribed mods.

## Changing base resources

There are three ways, one per hook. All of them run in activation order, one mod after the other,
so they share one rule: **a mod that writes a fixed value replaces whatever earlier mods wrote; a
mod that derives the new value from the current one builds on top of them.**

- **Base config** (`preRunScript`). The fourth argument is the base config table, and a mod writes
  fields on it directly, e.g. `baseConfig.<field> = true`. The base game fills most fields in its
  own `preRunScript`, before any mod.
- **Modifiers** (`runScript`). `addModifier(category, fn)` registers `fn(fileName, data)`, which
  receives every resource of that category as it loads and returns its data, changed or not. Modifiers
  of one category are chained in registration order, each one receiving what the previous one
  returned. There are 46 categories, such as `loadModel`, `loadConstruction`, `loadStreet`,
  `loadTrack`, `loadBridge` or `loadCargoType`; an unknown one is an error. A modifier sees every
  resource of its category, so a mod that wants one resource compares `fileName` itself. The exact
  shape of `fileName` is not documented: base models are named like
  `::/vehicle/<type>/<name>/<name>.mdl`. (unverified)
- **Repositories** (`postRunScript`). `api.res.<kind>Rep` (models, constructions, cargo types, …)
  offers `find(name)` for an id, `getAsTable(id)` for a copy as a table, `setAsTable(id, data)` to
  write it back, `addAsTable(name, data)` for a new resource and `setVisible(id, false)` to hide one.

`addFileFilter(category, fn)`, also registered in `runScript`, drops a resource when `fn` returns
`false`; every filter on a category must keep a file for it to load.

## UI recipes

The game's interface is made of React-style *recipes*. Mods change it with two kinds of `.res.lua`
resource. A `.res.lua` file defines `data()`, which returns `{ type = "<type>", data = { … } }`.

**Replacing a recipe** (`type = "react-replacement-config"`). `data` has `filePath`, the script
qualified with the mod id (`<modId>::/<path>/<name>.script`), `doReplaceFn`, the name of a function
in that script, and `order`. The resource does not name the recipe it replaces. The function receives
a replacement API and calls `ReplaceRecipe(original, replacement)` on it. The original recipe is a
base GUI module loaded with `ug_require "::/gui/<folder>/<file>.tl"`, so that path identifies it.
The replacement must offer the same API as the original, and replacing is only allowed while the
game starts. Inside a replacement, `react.CallOriginalRecipe` renders the original, except for
builtins.

**Extending an extension point** (`type = "react-plugin ::<ExtensionPointId>"`). `data` has
`filePath` (`<script>@<recipe>`), an optional `condition` and `order`. Base extension point ids start
with `::`, a mod's own ones with its mod id. Every resource of the matching type is loaded, so several
mods can add to the same point.

Configs and plugins are sorted by `order`; the direction and the default are not documented.
(unverified)

## Combinability (what makes two mods clash)

- **Same file path under `content/`**: the file loaded later silently replaces the other one. This
  is the most dangerous case and must be an error in a mod set.
- **Fixed values on base resources**: see "Changing base resources". Two mods that write a fixed
  value to the same field of the same resource, or of the base config, do not combine: the one
  activated last wins. Deriving the value from the current one composes (×2 then ×1.5 = ×3). Two
  mods writing the *same* fixed value do not clash, whatever their order.
- **Replacing base UI recipes**: two mods that replace the same recipe (the same `ug_require` path
  passed to `ReplaceRecipe`) conflict. What the game does then is not documented: it may keep one by
  `order` or fail. (unverified) Adding to an extension point (`react-plugin ::<ExtensionPoint>`)
  never conflicts.
- **Assigning fields of shared base modules** loaded with `ug_require` patches them globally.
  (unverified)
- **Saved-data keys** (`api.gui.game.setGuiSaveData(key, …)`) should equal the mod's `modId` so data
  never mixes. (unverified)
