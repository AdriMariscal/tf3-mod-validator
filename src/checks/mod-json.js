// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Checks for the parsed content of `mod.json`. The rules come from
// docs/mod-format.md.

import { createReporter, isNonEmptyString, isPlainObject, jsonType, pointer } from '../report.js';

export const MODJSON_FILE = 'mod.json';

const KNOWN_FIELDS = new Set([
  'modId',
  'revision',
  'severityAdd',
  'severityRemove',
  'visible',
  'cosmetic',
  'autoActivate',
  'url',
  'dependencies',
  'incompatibilities',
  'params',
  // Always null in the mods shipped with the game; its purpose is unknown, so its value is not checked.
  'options',
  'preRunScript',
  'runScript',
  'postRunScript',
]);

const SEVERITIES = ['None', 'Warning', 'Critical'];
const UI_TYPES = ['Button', 'Slider', 'ComboBox', 'IconButton', 'CheckBox'];
const SCRIPT_FIELDS = ['preRunScript', 'runScript', 'postRunScript'];

export const MODID_PATTERN = /^[a-z0-9_]+$/;
// `<author>_<name>`: both parts non-empty, author without underscores.
const MODID_CONVENTION = /^[a-z0-9]+_[a-z0-9_]*[a-z0-9]$/;
// `<modId>::/<file>@<function>`; the slash after `::` is optional.
export const SCRIPT_REFERENCE = /^([a-z0-9_]+)::([^@\s]+)@([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * Checks the parsed content of a `mod.json` file.
 * @param {unknown} data  Result of `JSON.parse`.
 * @param {{ folderName?: string }} [context]  `folderName` enables the folder/modId comparison.
 * @returns {import('../report.js').Finding[]}
 */
export function checkModJson(data, context = {}) {
  const { findings, report } = createReporter(MODJSON_FILE);

  if (!isPlainObject(data)) {
    report('MODJSON_NOT_OBJECT', '', `mod.json must contain a JSON object, got ${jsonType(data)}.`);
    return findings;
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) {
      report('MODJSON_UNKNOWN_FIELD', pointer(key), `Unknown field "${key}". Check the spelling; field names are case-sensitive.`);
    }
  }

  const modId = checkModId(data, context.folderName, report);
  checkRevision(data, report);
  for (const field of ['severityAdd', 'severityRemove']) {
    if (field in data && !SEVERITIES.includes(data[field])) {
      report('MODJSON_SEVERITY_VALUE', pointer(field), `"${field}" must be one of ${SEVERITIES.join(', ')}, got ${JSON.stringify(data[field])}.`);
    }
  }
  for (const field of ['visible', 'cosmetic', 'autoActivate']) {
    expectType(data, field, 'boolean', pointer(field), report);
  }
  expectType(data, 'url', 'string', pointer('url'), report);

  const dependencyIds = checkModReferences(data, 'dependencies', modId, report);
  const incompatibilityIds = checkModReferences(data, 'incompatibilities', modId, report);
  for (const [id, index] of incompatibilityIds) {
    if (dependencyIds.has(id)) {
      report('MODJSON_DEP_INCOMPAT_CONFLICT', pointer('incompatibilities', index, 'mod', 'modId'), `"${id}" is listed both as a dependency and as an incompatibility.`);
    }
  }

  checkParams(data, report);
  for (const field of SCRIPT_FIELDS) {
    checkScript(data, field, modId, report);
  }

  return findings;
}

/** Returns the modId when it is valid, `undefined` otherwise. */
function checkModId(data, folderName, report) {
  if (!('modId' in data)) {
    report('MODJSON_MODID_MISSING', '', '"modId" is required.');
    return undefined;
  }
  const { modId } = data;
  if (typeof modId !== 'string' || !MODID_PATTERN.test(modId)) {
    report('MODJSON_MODID_FORMAT', pointer('modId'), `"modId" must be a non-empty string of a-z, 0-9 and _, got ${JSON.stringify(modId)}.`);
    return undefined;
  }
  if (!MODID_CONVENTION.test(modId)) {
    report('MODJSON_MODID_CONVENTION', pointer('modId'), `"modId" "${modId}" does not follow the <author>_<name> convention.`);
  }
  if (folderName !== undefined && folderName !== modId) {
    report('MODJSON_MODID_FOLDER_MISMATCH', pointer('modId'), `The mod folder is named "${folderName}" but "modId" is "${modId}".`);
  }
  return modId;
}

function checkRevision(data, report) {
  if (!('revision' in data)) {
    report('MODJSON_REVISION_MISSING', '', '"revision" is required.');
    return;
  }
  const { revision } = data;
  if (!Number.isInteger(revision)) {
    report('MODJSON_REVISION_TYPE', pointer('revision'), `"revision" must be an integer, got ${jsonType(revision)} ${JSON.stringify(revision)}.`);
  } else if (revision < 0) {
    report('MODJSON_REVISION_RANGE', pointer('revision'), `"revision" must not be negative, got ${revision}.`);
  }
}

/**
 * Checks `dependencies` or `incompatibilities`.
 * @returns {Map<string, number>} Valid modIds referenced, with the index of their first entry.
 */
function checkModReferences(data, field, ownModId, report) {
  const ids = new Map();
  // Mods shipped with the game write null when they have none.
  if (!(field in data) || data[field] === null) return ids;
  const list = data[field];
  if (!Array.isArray(list)) {
    reportType(field, 'an array', list, pointer(field), report);
    return ids;
  }

  const isDependency = field === 'dependencies';
  const prefix = isDependency ? 'MODJSON_DEP' : 'MODJSON_INCOMPAT';
  const noun = isDependency ? 'dependency' : 'incompatibility';

  list.forEach((entry, index) => {
    const at = (...rest) => pointer(field, index, ...rest);
    if (!isPlainObject(entry)) {
      reportType(`${field}[${index}]`, 'an object', entry, at(), report);
      return;
    }

    if (isDependency) {
      checkDependencyExtras(entry, at, report);
    }

    if (!('mod' in entry)) {
      report(`${prefix}_MOD_MISSING`, at(), `The ${noun} at index ${index} has no "mod" object.`);
      return;
    }
    const { mod } = entry;
    if (!isPlainObject(mod)) {
      reportType(`${field}[${index}].mod`, 'an object', mod, at('mod'), report);
      return;
    }

    checkRevisionLimits(mod, prefix, noun, at, report);

    if (!('modId' in mod)) {
      report(`${prefix}_MODID_MISSING`, at('mod'), `The ${noun} at index ${index} has no "mod.modId".`);
      return;
    }
    const id = mod.modId;
    if (typeof id !== 'string' || !MODID_PATTERN.test(id)) {
      report(`${prefix}_MODID_FORMAT`, at('mod', 'modId'), `The ${noun} modId must be a non-empty string of a-z, 0-9 and _, got ${JSON.stringify(id)}.`);
      return;
    }
    if (id === ownModId) {
      report(`${prefix}_SELF`, at('mod', 'modId'), `The mod lists itself ("${id}") as ${isDependency ? 'a dependency' : 'incompatible'}.`);
    }
    if (ids.has(id)) {
      report(`${prefix}_DUPLICATE`, at('mod', 'modId'), `"${id}" already appears at index ${ids.get(id)} of "${field}".`);
    } else {
      ids.set(id, index);
    }
  });

  return ids;
}

function checkRevisionLimits(mod, prefix, noun, at, report) {
  const limits = {};
  for (const limit of ['revisionMin', 'revisionMax']) {
    if (!(limit in mod)) continue;
    const value = mod[limit];
    if (!Number.isInteger(value) || value < -1) {
      report(`${prefix}_REVISION_INVALID`, at('mod', limit), `"${limit}" must be -1 (no limit) or a non-negative integer, got ${JSON.stringify(value)}.`);
    } else if (value !== -1) {
      limits[limit] = value;
    }
  }
  if (limits.revisionMin !== undefined && limits.revisionMax !== undefined && limits.revisionMin > limits.revisionMax) {
    report(`${prefix}_REVISION_RANGE`, at('mod'), `The ${noun} has revisionMin ${limits.revisionMin} greater than revisionMax ${limits.revisionMax}.`);
  }
}

function checkDependencyExtras(entry, at, report) {
  if (!('modInfo' in entry)) {
    report('MODJSON_DEP_MODINFO_MISSING', at(), 'The dependency has no "modInfo" object, so players get no name to look for.');
  } else if (!isPlainObject(entry.modInfo)) {
    reportType('modInfo', 'an object', entry.modInfo, at('modInfo'), report);
  } else {
    if (!isNonEmptyString(entry.modInfo.displayName)) {
      report('MODJSON_DEP_DISPLAYNAME_MISSING', at('modInfo'), 'The dependency "modInfo" has no non-empty "displayName".');
    }
    expectType(entry.modInfo, 'url', 'string', at('modInfo', 'url'), report);
  }
  expectType(entry, 'loadBefore', 'boolean', at('loadBefore'), report);
  expectType(entry, 'optional', 'boolean', at('optional'), report);
}

function checkParams(data, report) {
  if (!('params' in data) || data.params === null) return;
  const { params } = data;
  if (!Array.isArray(params)) {
    reportType('params', 'an array', params, pointer('params'), report);
    return;
  }

  const keys = new Map();
  params.forEach((param, index) => {
    const at = (...rest) => pointer('params', index, ...rest);
    if (!isPlainObject(param)) {
      reportType(`params[${index}]`, 'an object', param, at(), report);
      return;
    }

    if (!isNonEmptyString(param.key)) {
      report('MODJSON_PARAM_KEY_MISSING', at(), `The param at index ${index} has no non-empty "key".`);
    } else if (keys.has(param.key)) {
      report('MODJSON_PARAM_KEY_DUPLICATE', at('key'), `Param key "${param.key}" is already used at index ${keys.get(param.key)}.`);
    } else {
      keys.set(param.key, index);
    }

    if (!isNonEmptyString(param.name)) {
      report('MODJSON_PARAM_NAME_MISSING', at(), `The param at index ${index} has no non-empty "name".`);
    }
    expectType(param, 'tooltip', 'string', at('tooltip'), report);

    if (!('uiType' in param)) {
      report('MODJSON_PARAM_UITYPE_MISSING', at(), `The param at index ${index} has no "uiType".`);
    } else if (!UI_TYPES.includes(param.uiType)) {
      report('MODJSON_PARAM_UITYPE_VALUE', at('uiType'), `"uiType" must be one of ${UI_TYPES.join(', ')}, got ${JSON.stringify(param.uiType)}.`);
    }

    const values = checkParamValues(param, index, at, report);

    if ('numbers' in param) {
      const { numbers } = param;
      if (!Array.isArray(numbers) || !numbers.every(Number.isFinite)) {
        report('MODJSON_PARAM_NUMBERS_INVALID', at('numbers'), '"numbers" must be an array of finite numbers.');
      } else if (values && numbers.length !== values.length) {
        report('MODJSON_PARAM_NUMBERS_LENGTH', at('numbers'), `"numbers" has ${numbers.length} entries but "values" has ${values.length}.`);
      }
    }

    if ('defaultIndex' in param && values) {
      const { defaultIndex } = param;
      if (!Number.isInteger(defaultIndex) || defaultIndex < 0 || defaultIndex >= values.length) {
        const hint = defaultIndex === values.length ? ' It is 0-based in JSON: the first value is 0.' : '';
        report('MODJSON_PARAM_DEFAULTINDEX', at('defaultIndex'), `"defaultIndex" must be an integer from 0 to ${values.length - 1}, got ${JSON.stringify(defaultIndex)}.${hint}`);
      }
    }
  });
}

/** Returns `values` when it is a non-empty array of strings, `undefined` otherwise. */
function checkParamValues(param, index, at, report) {
  const { values } = param;
  if (!Array.isArray(values)) {
    report('MODJSON_PARAM_VALUES_INVALID', 'values' in param ? at('values') : at(), `The param at index ${index} needs "values" as an array of strings.`);
    return undefined;
  }
  if (values.length === 0) {
    report('MODJSON_PARAM_VALUES_EMPTY', at('values'), `The param at index ${index} has an empty "values" array.`);
    return undefined;
  }
  const badIndex = values.findIndex((value) => typeof value !== 'string');
  if (badIndex !== -1) {
    report('MODJSON_PARAM_VALUES_INVALID', at('values', badIndex), `"values" entries must be strings, got ${jsonType(values[badIndex])} at index ${badIndex}.`);
    return undefined;
  }
  return values;
}

function checkScript(data, field, ownModId, report) {
  if (!(field in data)) return;
  const script = data[field];
  // An empty string, as the hook or as its fileName, means the hook is not used.
  if (script === '') return;
  if (!isPlainObject(script)) {
    reportType(field, 'an object', script, pointer(field), report);
    return;
  }
  const { fileName } = script;
  if (fileName === '') return;
  const match = typeof fileName === 'string' ? SCRIPT_REFERENCE.exec(fileName) : null;
  if (!match) {
    report('MODJSON_SCRIPT_FILENAME_FORMAT', 'fileName' in script ? pointer(field, 'fileName') : pointer(field), `"${field}.fileName" must look like "<modId>::/<file>@<function>", or be "" for no script, got ${JSON.stringify(fileName)}.`);
    return;
  }
  if (ownModId !== undefined && match[1] !== ownModId) {
    report('MODJSON_SCRIPT_FOREIGN_MOD', pointer(field, 'fileName'), `"${field}.fileName" points at mod "${match[1]}", not at this mod ("${ownModId}").`);
  }
}

/** Reports MODJSON_FIELD_TYPE when `object[field]` exists and is not of `type`. */
function expectType(object, field, type, at, report) {
  if (field in object && typeof object[field] !== type) {
    reportType(field, `a ${type}`, object[field], at, report);
  }
}

function reportType(label, expected, value, at, report) {
  report('MODJSON_FIELD_TYPE', at, `"${label}" must be ${expected}, got ${jsonType(value)}.`);
}
