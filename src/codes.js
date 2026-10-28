// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Catalogue of every finding code. A code's severity is fixed here, so the
// same problem always has the same severity. Codes are part of the public
// interface: never rename one, add a new code instead.

export const CODES = Object.freeze({
  // --- mod.json: file ---
  MODJSON_MISSING: { severity: 'error', description: 'mod.json does not exist.' },
  MODJSON_INVALID_JSON: { severity: 'error', description: 'mod.json is not valid JSON.' },
  MODJSON_BOM: { severity: 'warning', description: 'mod.json starts with a UTF-8 byte order mark.' },
  MODJSON_NOT_OBJECT: { severity: 'error', description: 'mod.json does not contain a JSON object.' },
  MODJSON_UNKNOWN_FIELD: { severity: 'warning', description: 'mod.json has a top-level field that is not in the documented format.' },
  MODJSON_FIELD_TYPE: { severity: 'error', description: 'A mod.json field has the wrong JSON type.' },

  // --- mod.json: identity ---
  MODJSON_MODID_MISSING: { severity: 'error', description: '`modId` is missing.' },
  MODJSON_MODID_FORMAT: { severity: 'error', description: '`modId` is not a non-empty string of `a-z`, `0-9` and `_`.' },
  MODJSON_MODID_CONVENTION: { severity: 'warning', description: '`modId` does not follow the `<author>_<name>` convention.' },
  MODJSON_MODID_FOLDER_MISMATCH: { severity: 'warning', description: 'The mod folder name is not equal to `modId`.' },
  MODJSON_REVISION_MISSING: { severity: 'error', description: '`revision` is missing.' },
  MODJSON_REVISION_TYPE: { severity: 'error', description: '`revision` is not an integer.' },
  MODJSON_REVISION_RANGE: { severity: 'error', description: '`revision` is negative.' },
  MODJSON_SEVERITY_VALUE: { severity: 'error', description: '`severityAdd` or `severityRemove` is not `None`, `Warning` or `Critical`.' },

  // --- mod.json: dependencies ---
  MODJSON_DEP_MOD_MISSING: { severity: 'error', description: 'A dependency has no `mod` object.' },
  MODJSON_DEP_MODID_MISSING: { severity: 'error', description: 'A dependency has no `mod.modId`.' },
  MODJSON_DEP_MODID_FORMAT: { severity: 'error', description: 'A dependency `mod.modId` is not a valid modId.' },
  MODJSON_DEP_REVISION_INVALID: { severity: 'error', description: 'A dependency `revisionMin` or `revisionMax` is not `-1` or a non-negative integer.' },
  MODJSON_DEP_REVISION_RANGE: { severity: 'error', description: 'A dependency has `revisionMin` greater than `revisionMax`.' },
  MODJSON_DEP_SELF: { severity: 'error', description: 'The mod lists itself as a dependency.' },
  MODJSON_DEP_DUPLICATE: { severity: 'error', description: 'The same modId appears twice in `dependencies`.' },
  MODJSON_DEP_MODINFO_MISSING: { severity: 'warning', description: 'A dependency has no `modInfo` object.' },
  MODJSON_DEP_DISPLAYNAME_MISSING: { severity: 'warning', description: 'A dependency `modInfo` has no non-empty `displayName`.' },

  // --- mod.json: incompatibilities ---
  MODJSON_INCOMPAT_MOD_MISSING: { severity: 'error', description: 'An incompatibility has no `mod` object.' },
  MODJSON_INCOMPAT_MODID_MISSING: { severity: 'error', description: 'An incompatibility has no `mod.modId`.' },
  MODJSON_INCOMPAT_MODID_FORMAT: { severity: 'error', description: 'An incompatibility `mod.modId` is not a valid modId.' },
  MODJSON_INCOMPAT_REVISION_INVALID: { severity: 'error', description: 'An incompatibility `revisionMin` or `revisionMax` is not `-1` or a non-negative integer.' },
  MODJSON_INCOMPAT_REVISION_RANGE: { severity: 'error', description: 'An incompatibility has `revisionMin` greater than `revisionMax`.' },
  MODJSON_INCOMPAT_SELF: { severity: 'error', description: 'The mod lists itself as incompatible.' },
  MODJSON_INCOMPAT_DUPLICATE: { severity: 'error', description: 'The same modId appears twice in `incompatibilities`.' },
  MODJSON_DEP_INCOMPAT_CONFLICT: { severity: 'error', description: 'A modId is both a dependency and an incompatibility.' },

  // --- mod.json: params ---
  MODJSON_PARAM_KEY_MISSING: { severity: 'error', description: 'A param has no non-empty `key`.' },
  MODJSON_PARAM_KEY_DUPLICATE: { severity: 'error', description: 'Two params share the same `key`.' },
  MODJSON_PARAM_NAME_MISSING: { severity: 'error', description: 'A param has no non-empty `name`.' },
  MODJSON_PARAM_UITYPE_MISSING: { severity: 'warning', description: 'A param has no `uiType`.' },
  MODJSON_PARAM_UITYPE_VALUE: { severity: 'error', description: 'A param `uiType` is not `Button`, `Slider`, `ComboBox`, `IconButton` or `CheckBox`.' },
  MODJSON_PARAM_VALUES_INVALID: { severity: 'error', description: 'A param `values` is missing or is not an array of strings.' },
  MODJSON_PARAM_VALUES_EMPTY: { severity: 'error', description: 'A param `values` is an empty array.' },
  MODJSON_PARAM_NUMBERS_INVALID: { severity: 'error', description: 'A param `numbers` is not an array of finite numbers.' },
  MODJSON_PARAM_NUMBERS_LENGTH: { severity: 'error', description: 'A param `numbers` does not have the same length as `values`.' },
  MODJSON_PARAM_DEFAULTINDEX: { severity: 'error', description: 'A param `defaultIndex` is not a 0-based integer index into `values`.' },

  // --- mod.json: scripts ---
  MODJSON_SCRIPT_FILENAME_FORMAT: { severity: 'error', description: 'A script `fileName` is missing or does not match `<modId>::<file>@<function>`.' },
  MODJSON_SCRIPT_FOREIGN_MOD: { severity: 'warning', description: 'A script `fileName` points at a modId other than this mod.' },

  // --- _metadata/modinfo.json: file ---
  MODINFO_MISSING: { severity: 'error', description: '_metadata/modinfo.json does not exist.' },
  MODINFO_INVALID_JSON: { severity: 'error', description: 'modinfo.json is not valid JSON.' },
  MODINFO_BOM: { severity: 'warning', description: 'modinfo.json starts with a UTF-8 byte order mark.' },
  MODINFO_NOT_OBJECT: { severity: 'error', description: 'modinfo.json does not contain a JSON object.' },
  MODINFO_UNKNOWN_FIELD: { severity: 'warning', description: 'modinfo.json has a top-level field that is not in the documented format.' },
  MODINFO_FIELD_TYPE: { severity: 'error', description: 'A modinfo.json field has the wrong JSON type.' },

  // --- _metadata/modinfo.json: texts ---
  MODINFO_NAME_MISSING: { severity: 'error', description: '`name` is missing or empty.' },
  MODINFO_NAME_LENGTH: { severity: 'error', description: '`name` is longer than 32 characters.' },
  MODINFO_NAME_LINEBREAK: { severity: 'error', description: '`name` contains a line break.' },
  MODINFO_SUMMARY_MISSING: { severity: 'warning', description: '`summary` is missing or empty.' },
  MODINFO_SUMMARY_LENGTH: { severity: 'error', description: '`summary` is longer than 100 characters.' },
  MODINFO_SUMMARY_LINEBREAK: { severity: 'error', description: '`summary` contains a line break.' },
  MODINFO_DESCRIPTION_IGNORED: { severity: 'warning', description: '`description` is set but `_metadata/description.html` exists, so the game ignores it.' },
  MODINFO_LOCALIZATION_UNKNOWN_FIELD: { severity: 'warning', description: 'A `localization` entry has a field other than `name`, `summary` and `description`.' },

  // --- _metadata/modinfo.json: lists ---
  MODINFO_AUTHORS_MISSING: { severity: 'warning', description: '`authors` is missing or empty.' },
  MODINFO_AUTHOR_NAME_MISSING: { severity: 'error', description: 'An author has no non-empty `name`.' },
  MODINFO_TAGS_MISSING: { severity: 'error', description: '`tags` is missing or empty; at least one tag is required.' },
  MODINFO_TAG_DUPLICATE: { severity: 'warning', description: 'The same tag appears twice in `tags`.' },
  MODINFO_DEPENDENCY_FORMAT: { severity: 'error', description: 'A `dependencies` entry is not a mod.io id written as a string of digits.' },
  MODINFO_DEPENDENCY_DUPLICATE: { severity: 'warning', description: 'The same mod.io id appears twice in `dependencies`.' },
  MODINFO_URL_FORMAT: { severity: 'error', description: '`url` is not an absolute http or https URL.' },

  // --- scripts (single mod) ---
  SCRIPT_SAVEDATA_KEY: { severity: 'warning', description: 'A script calls `setGuiSaveData` with a literal key other than the modId.' },

  // --- mod set ---
  MODSET_MODID_DUPLICATE: { severity: 'error', description: 'Two or more mods in the set share a modId, so the game keeps only one of them.' },
  MODSET_DEPENDENCY_NOT_IN_SET: { severity: 'warning', description: 'A required dependency is not part of the set.' },
  MODSET_DEPENDENCY_REVISION: { severity: 'error', description: 'A required dependency is in the set, but its `revision` is outside `revisionMin`..`revisionMax`.' },
  MODSET_DEPENDENCY_CYCLE: { severity: 'error', description: 'Dependencies between mods of the set form a cycle.' },
  MODSET_INCOMPAT_ASYMMETRIC: { severity: 'error', description: 'A mod declares another mod of the set incompatible, but not the other way round.' },
  MODSET_DEP_INCOMPAT_CONFLICT: { severity: 'error', description: 'A mod requires another mod of the set that declares it incompatible.' },
  MODSET_CONTENT_COLLISION: { severity: 'error', description: 'Mods that can be active together ship different files at the same path under `content/`.' },
  MODSET_CONTENT_IDENTICAL: { severity: 'warning', description: 'Mods that can be active together ship byte-identical files at the same path under `content/`.' },
  MODSET_CONTENT_CASE_COLLISION: { severity: 'warning', description: 'Mods that can be active together ship paths under `content/` that differ only in letter case.' },
  MODSET_SAVEDATA_KEY_CONFLICT: { severity: 'warning', description: 'Mods that can be active together call `setGuiSaveData` with the same literal key.' },
  MODSET_MODULE_FIELD_CONFLICT: { severity: 'warning', description: 'Mods that can be active together assign the same field of the same `ug_require` module.' },
});
