// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Text scan of Lua and Teal scripts for the two script patterns that make
// mods clash (see "Combinability" in docs/mod-format.md):
//
// - GUI saved-data keys passed as string literals to `setGuiSaveData`.
// - Fields assigned on a module loaded with `ug_require`, which patches the
//   shared module for every mod.
//
// This is not a parser. Comments are blanked first, so commented-out code is
// ignored, but keys built at run time, aliases of aliases and table-style
// access (`m["field"] = …`) are not seen. Findings from here are warnings.

import { createReporter } from './report.js';

/** Script files are `.lua` and `.tl`; `.d.tl` files only declare types. */
export function isScriptFile(path) {
  return (path.endsWith('.lua') || path.endsWith('.tl')) && !path.endsWith('.d.tl');
}

// Only a whole literal argument: `"a" .. b` is computed and skipped.
const SAVE_DATA_CALL = /\bsetGuiSaveData\s*\(\s*(["'])([^"'\n]*)\1\s*[,)]/g;
// `local name = ug_require("path")`, also `ug_require "path"` and a Teal type annotation.
const UG_REQUIRE = /\blocal\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*ug_require\s*\(?\s*(["'])([^"'\n]+)\2/g;

/**
 * @typedef {object} ScriptScan
 * @property {{ key: string, line: number }[]} saveDataKeys
 * @property {{ module: string, field: string, line: number }[]} moduleFields  First assignment of each field.
 */

/**
 * Scans one script's source text.
 * @param {string} source
 * @returns {ScriptScan}
 */
export function scanScript(source) {
  const code = blankComments(source);
  const lineOf = lineFinder(code);

  const saveDataKeys = [...code.matchAll(SAVE_DATA_CALL)].map((match) => ({ key: match[2], line: lineOf(match.index) }));

  const moduleFields = [];
  const seen = new Set();
  for (const [, alias, , module] of code.matchAll(UG_REQUIRE)) {
    const assignment = new RegExp(`(?<![\\w.:])${alias}\\s*\\.\\s*([A-Za-z_]\\w*)\\s*=(?!=)`, 'g');
    const definition = new RegExp(`\\bfunction\\s+${alias}\\s*[.:]\\s*([A-Za-z_]\\w*)`, 'g');
    const matches = [...code.matchAll(assignment), ...code.matchAll(definition)].sort((a, b) => a.index - b.index);
    for (const match of matches) {
      const id = `${module}\0${match[1]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      moduleFields.push({ module, field: match[1], line: lineOf(match.index) });
    }
  }
  moduleFields.sort((a, b) => a.line - b.line);

  return { saveDataKeys, moduleFields };
}

/**
 * Single-mod script checks: a literal saved-data key should equal the modId.
 * @param {{ file: string, scan: ScriptScan }[]} scripts
 * @param {string | null} modId  Skipped when the mod has no valid modId.
 */
export function checkScripts(scripts, modId) {
  if (!modId) return [];
  const findings = [];
  for (const { file, scan } of scripts) {
    const { findings: fileFindings, report } = createReporter(file);
    for (const { key, line } of scan.saveDataKeys) {
      if (key !== modId) {
        report('SCRIPT_SAVEDATA_KEY', '', `setGuiSaveData uses key "${key}"; use the modId "${modId}" so saved data never mixes with other mods.`, line);
      }
    }
    findings.push(...fileFindings);
  }
  return findings;
}

/**
 * Replaces Lua comments (`-- …` and `--[[ … ]]`, any `=` level) with spaces,
 * keeping line breaks so positions and line numbers stay the same. String
 * literals are kept, so `"--"` inside a string is not a comment.
 */
export function blankComments(source) {
  const chunks = [];
  let start = 0;
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '-' && source[i + 1] === '-') {
      const long = longBracketAt(source, i + 2);
      const end = long ? closeOf(source, long) : endOfLine(source, i);
      chunks.push(source.slice(start, i), source.slice(i, end).replace(/[^\n]/g, ' '));
      start = i = end;
    } else if (char === '"' || char === "'") {
      i = endOfQuoted(source, i);
    } else if (char === '[') {
      const long = longBracketAt(source, i);
      i = long ? closeOf(source, long) : i + 1;
    } else {
      i += 1;
    }
  }
  chunks.push(source.slice(start));
  return chunks.join('');
}

/** Detects `[[` or `[==[` at `i`. */
function longBracketAt(source, i) {
  if (source[i] !== '[') return null;
  let j = i + 1;
  while (source[j] === '=') j += 1;
  if (source[j] !== '[') return null;
  return { bodyStart: j + 1, close: `]${'='.repeat(j - i - 1)}]` };
}

function closeOf(source, long) {
  const index = source.indexOf(long.close, long.bodyStart);
  return index === -1 ? source.length : index + long.close.length;
}

function endOfLine(source, i) {
  const index = source.indexOf('\n', i);
  return index === -1 ? source.length : index;
}

function endOfQuoted(source, i) {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length && source[j] !== quote && source[j] !== '\n') {
    j += source[j] === '\\' ? 2 : 1;
  }
  return Math.min(j + 1, source.length);
}

function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return (index) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}
