// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { CODES } from './codes.js';

/**
 * @typedef {object} Finding
 * @property {string} code      Stable code from the catalogue, e.g. `MODJSON_MODID_FORMAT`.
 * @property {'error' | 'warning'} severity
 * @property {string} file      Path relative to the mod folder, with `/` separators.
 * @property {string} pointer   JSON Pointer (RFC 6901) into the file; `''` means the whole file.
 * @property {number | null} line  1-based line for text files such as scripts; `null` otherwise.
 * @property {string} message
 */

/**
 * Creates a collector of findings for one file. The severity always comes
 * from the catalogue, never from the caller.
 * @param {string} file
 */
export function createReporter(file) {
  /** @type {Finding[]} */
  const findings = [];
  return {
    findings,
    /**
     * @param {keyof typeof CODES} code
     * @param {string} pointer
     * @param {string} message
     * @param {number | null} [line]
     */
    report(code, pointer, message, line = null) {
      findings.push({ code, severity: severityOf(code), file, pointer, line, message });
    },
  };
}

/** The catalogue severity of a code; throws on an unknown code. */
export function severityOf(code) {
  const entry = CODES[code];
  if (!entry) throw new Error(`Unknown finding code: ${code}`);
  return entry.severity;
}

/** Builds a JSON Pointer from path segments. */
export function pointer(...segments) {
  return segments
    .map((segment) => '/' + String(segment).replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('');
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Describes the JSON type of a value for messages. */
export function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/** Counts characters as Unicode code points, so an emoji counts as one. */
export function charLength(text) {
  return [...text].length;
}
