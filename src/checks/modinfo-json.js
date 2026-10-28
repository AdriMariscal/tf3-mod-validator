// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Checks for the parsed content of `_metadata/modinfo.json`. The rules come
// from docs/mod-format.md.

import { charLength, createReporter, isNonEmptyString, isPlainObject, jsonType, pointer } from '../report.js';

export const MODINFO_FILE = '_metadata/modinfo.json';

const KNOWN_FIELDS = new Set(['name', 'summary', 'description', 'localization', 'authors', 'tags', 'dependencies', 'url']);
const LOCALIZED_FIELDS = new Set(['name', 'summary', 'description']);

const NAME_MAX = 32;
const SUMMARY_MAX = 100;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const MODIO_ID = /^[1-9][0-9]*$/;

/**
 * Checks the parsed content of a `_metadata/modinfo.json` file.
 * @param {unknown} data  Result of `JSON.parse`.
 * @param {{ hasDescriptionHtml?: boolean }} [context]
 * @returns {import('../report.js').Finding[]}
 */
export function checkModInfo(data, context = {}) {
  const { findings, report } = createReporter(MODINFO_FILE);

  if (!isPlainObject(data)) {
    report('MODINFO_NOT_OBJECT', '', `modinfo.json must contain a JSON object, got ${jsonType(data)}.`);
    return findings;
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) {
      report('MODINFO_UNKNOWN_FIELD', pointer(key), `Unknown field "${key}". Check the spelling; field names are case-sensitive.`);
    }
  }

  checkTexts(data, [], true, report);
  if ('description' in data && context.hasDescriptionHtml) {
    report('MODINFO_DESCRIPTION_IGNORED', pointer('description'), '"description" is ignored because _metadata/description.html exists.');
  }
  checkLocalization(data, report);
  checkAuthors(data, report);
  checkTags(data, report);
  checkDependencies(data, report);

  if ('url' in data) {
    const { url } = data;
    if (typeof url !== 'string') {
      reportType('url', 'a string', url, pointer('url'), report);
    } else if (!isHttpUrl(url)) {
      report('MODINFO_URL_FORMAT', pointer('url'), `"url" must be an absolute http or https URL, got ${JSON.stringify(url)}.`);
    }
  }

  return findings;
}

/**
 * Checks `name`, `summary` and `description` of the root object or of one
 * `localization` entry. Only the root object must have them.
 */
function checkTexts(object, path, isRoot, report) {
  checkLine(object, path, 'name', NAME_MAX, isRoot, report);
  checkLine(object, path, 'summary', SUMMARY_MAX, isRoot, report);
  if ('description' in object && typeof object.description !== 'string') {
    reportType([...path, 'description'].join('.'), 'a string', object.description, pointer(...path, 'description'), report);
  }
}

/** Checks a single-line text field: `name` or `summary`. */
function checkLine(object, path, field, max, isRoot, report) {
  const prefix = `MODINFO_${field.toUpperCase()}`;
  const label = [...path, field].join('.');
  const at = pointer(...path, field);
  const text = object[field];

  if (text !== undefined && typeof text !== 'string') {
    reportType(label, 'a string', text, at, report);
    return;
  }
  if (!isNonEmptyString(text)) {
    if (isRoot) report(`${prefix}_MISSING`, text === undefined ? '' : at, `"${label}" is missing or empty.`);
    return;
  }
  const length = charLength(text);
  if (length > max) {
    report(`${prefix}_LENGTH`, at, `"${label}" has ${length} characters; the limit is ${max}.`);
  }
  if (LINE_BREAK.test(text)) {
    report(`${prefix}_LINEBREAK`, at, `"${label}" must be a single line.`);
  }
}

function checkLocalization(data, report) {
  if (!('localization' in data)) return;
  const { localization } = data;
  if (!isPlainObject(localization)) {
    reportType('localization', 'an object', localization, pointer('localization'), report);
    return;
  }
  for (const [language, entry] of Object.entries(localization)) {
    if (!isPlainObject(entry)) {
      reportType(`localization.${language}`, 'an object', entry, pointer('localization', language), report);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!LOCALIZED_FIELDS.has(key)) {
        report('MODINFO_LOCALIZATION_UNKNOWN_FIELD', pointer('localization', language, key), `"localization.${language}" has unknown field "${key}"; only name, summary and description can be localized.`);
      }
    }
    checkTexts(entry, ['localization', language], false, report);
  }
}

function checkAuthors(data, report) {
  const { authors } = data;
  if (authors === undefined || (Array.isArray(authors) && authors.length === 0)) {
    report('MODINFO_AUTHORS_MISSING', authors === undefined ? '' : pointer('authors'), '"authors" is missing or empty.');
    return;
  }
  if (!Array.isArray(authors)) {
    reportType('authors', 'an array', authors, pointer('authors'), report);
    return;
  }
  authors.forEach((author, index) => {
    if (!isPlainObject(author)) {
      reportType(`authors[${index}]`, 'an object', author, pointer('authors', index), report);
      return;
    }
    if (!isNonEmptyString(author.name)) {
      report('MODINFO_AUTHOR_NAME_MISSING', pointer('authors', index), `The author at index ${index} has no non-empty "name".`);
    }
    if ('role' in author && typeof author.role !== 'string') {
      reportType(`authors[${index}].role`, 'a string', author.role, pointer('authors', index, 'role'), report);
    }
  });
}

function checkTags(data, report) {
  const { tags } = data;
  if (tags === undefined || (Array.isArray(tags) && tags.length === 0)) {
    report('MODINFO_TAGS_MISSING', tags === undefined ? '' : pointer('tags'), '"tags" must list at least one tag.');
    return;
  }
  if (!Array.isArray(tags)) {
    reportType('tags', 'an array', tags, pointer('tags'), report);
    return;
  }
  const seen = new Set();
  tags.forEach((tag, index) => {
    if (!isNonEmptyString(tag)) {
      reportType(`tags[${index}]`, 'a non-empty string', tag, pointer('tags', index), report);
    } else if (seen.has(tag)) {
      report('MODINFO_TAG_DUPLICATE', pointer('tags', index), `Tag "${tag}" appears more than once.`);
    } else {
      seen.add(tag);
    }
  });
}

function checkDependencies(data, report) {
  if (!('dependencies' in data)) return;
  const { dependencies } = data;
  if (!Array.isArray(dependencies)) {
    reportType('dependencies', 'an array', dependencies, pointer('dependencies'), report);
    return;
  }
  const seen = new Set();
  dependencies.forEach((id, index) => {
    if (typeof id !== 'string' || !MODIO_ID.test(id)) {
      const hint = typeof id === 'number' ? ` Write it as a string: "${id}".` : '';
      report('MODINFO_DEPENDENCY_FORMAT', pointer('dependencies', index), `"dependencies" entries must be mod.io ids as strings of digits, got ${JSON.stringify(id)}.${hint}`);
    } else if (seen.has(id)) {
      report('MODINFO_DEPENDENCY_DUPLICATE', pointer('dependencies', index), `mod.io id "${id}" appears more than once.`);
    } else {
      seen.add(id);
    }
  });
}

function isHttpUrl(text) {
  if (!URL.canParse(text)) return false;
  const { protocol } = new URL(text);
  return protocol === 'http:' || protocol === 'https:';
}

function reportType(label, expected, value, at, report) {
  report('MODINFO_FIELD_TYPE', at, `"${label}" must be ${expected}, got ${jsonType(value)}.`);
}
