// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { checkModJson, MODID_PATTERN, MODJSON_FILE } from './checks/mod-json.js';
import { checkModInfo, MODINFO_FILE } from './checks/modinfo-json.js';
import { listFiles } from './files.js';
import { createReporter, isPlainObject } from './report.js';
import { checkScripts, isScriptFile, scanScript } from './scripts.js';

const DESCRIPTION_HTML_FILE = '_metadata/description.html';
const CONTENT_DIR = 'content';

/**
 * @typedef {object} ModResult
 * @property {string} dir  The folder as given by the caller.
 * @property {string | null} modId  The modId when mod.json declares a valid one.
 * @property {import('./report.js').Finding[]} findings
 */

/**
 * @typedef {object} ModReference  A valid entry of `dependencies` or `incompatibilities`.
 * @property {string} modId
 * @property {number} index  Position in the mod.json array.
 * @property {boolean} optional
 * @property {number | undefined} revisionMin  `undefined` means no limit.
 * @property {number | undefined} revisionMax
 */

/**
 * @typedef {object} ModFacts  What the mod-set checks need to know about one mod.
 * @property {string} dir
 * @property {string} root  Absolute path of the folder.
 * @property {string | null} modId
 * @property {number | undefined} revision
 * @property {ModReference[]} dependencies
 * @property {ModReference[]} incompatibilities
 * @property {boolean} declaresIncompatibilities  mod.json has an `incompatibilities` array.
 * @property {string[]} contentFiles  Paths under `content/`, relative to the mod folder.
 * @property {{ file: string, scan: import('./scripts.js').ScriptScan }[]} scripts
 */

/**
 * Validates one mod folder: its `mod.json`, `_metadata/modinfo.json` and
 * the saved-data keys of its scripts.
 * Rejects when `dir` is not a directory; every other problem is a finding.
 * @param {string} dir
 * @returns {Promise<ModResult>}
 */
export async function validateMod(dir) {
  return (await loadMod(dir)).result;
}

/**
 * Validates one mod and collects the facts the mod-set checks need.
 * @param {string} dir
 * @returns {Promise<{ result: ModResult, facts: ModFacts }>}
 */
export async function loadMod(dir) {
  const root = resolve(dir);
  if (!(await isDirectory(root))) {
    throw new NotADirectoryError(dir);
  }

  const findings = [];

  const modJson = await readJson(root, MODJSON_FILE, 'MODJSON');
  findings.push(...modJson.findings);
  const data = modJson.ok ? modJson.data : undefined;
  if (modJson.ok) {
    findings.push(...checkModJson(data, { folderName: basename(root) }));
  }
  const modId = isPlainObject(data) && typeof data.modId === 'string' && MODID_PATTERN.test(data.modId) ? data.modId : null;

  const modInfo = await readJson(root, MODINFO_FILE, 'MODINFO');
  findings.push(...modInfo.findings);
  if (modInfo.ok) {
    const hasDescriptionHtml = await isFile(join(root, DESCRIPTION_HTML_FILE));
    findings.push(...checkModInfo(modInfo.data, { hasDescriptionHtml }));
  }

  const files = await listFiles(root);
  const scripts = [];
  for (const file of files.filter(isScriptFile)) {
    scripts.push({ file, scan: scanScript(await readFile(join(root, file), 'utf8')) });
  }
  findings.push(...checkScripts(scripts, modId));

  const facts = {
    dir,
    root,
    modId,
    revision: isPlainObject(data) && Number.isInteger(data.revision) ? data.revision : undefined,
    dependencies: readReferences(data, 'dependencies'),
    incompatibilities: readReferences(data, 'incompatibilities'),
    declaresIncompatibilities: isPlainObject(data) && Array.isArray(data.incompatibilities),
    contentFiles: files.filter((file) => file.startsWith(`${CONTENT_DIR}/`)),
    scripts,
  };

  return { result: { dir, modId, findings }, facts };
}

export class NotADirectoryError extends Error {
  constructor(dir) {
    super(`Not a directory: ${dir}`);
    this.name = 'NotADirectoryError';
    this.dir = dir;
  }
}

/**
 * Keeps the well-formed entries of `dependencies` or `incompatibilities`.
 * Malformed ones are already reported by checkModJson.
 * @returns {ModReference[]}
 */
function readReferences(data, field) {
  const list = isPlainObject(data) && Array.isArray(data[field]) ? data[field] : [];
  const references = [];
  list.forEach((entry, index) => {
    const mod = isPlainObject(entry) ? entry.mod : undefined;
    if (!isPlainObject(mod) || typeof mod.modId !== 'string' || !MODID_PATTERN.test(mod.modId)) return;
    references.push({
      modId: mod.modId,
      index,
      optional: entry.optional === true,
      revisionMin: revisionLimit(mod.revisionMin),
      revisionMax: revisionLimit(mod.revisionMax),
    });
  });
  return references;
}

/** `-1`, a missing value and an invalid value all mean no limit. */
function revisionLimit(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Reads and parses a JSON file of the mod. A missing file, a BOM and a
 * syntax error become findings with the given code prefix.
 */
async function readJson(root, file, prefix) {
  const { findings, report } = createReporter(file);
  if (!(await isFile(join(root, file)))) {
    report(`${prefix}_MISSING`, '', `${file} does not exist.`);
    return { ok: false, findings };
  }

  let text = await readFile(join(root, file), 'utf8');
  if (text.startsWith('﻿')) {
    report(`${prefix}_BOM`, '', `${file} starts with a UTF-8 byte order mark; save it as UTF-8 without BOM.`);
    text = text.slice(1);
  }

  try {
    return { ok: true, data: JSON.parse(text), findings };
  } catch (error) {
    report(`${prefix}_INVALID_JSON`, '', `${file} is not valid JSON: ${error.message}`);
    return { ok: false, findings };
  }
}

async function isDirectory(path) {
  return (await statOrNull(path))?.isDirectory() ?? false;
}

async function isFile(path) {
  return (await statOrNull(path))?.isFile() ?? false;
}

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}
