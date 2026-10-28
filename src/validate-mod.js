// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { checkModJson, MODID_PATTERN, MODJSON_FILE } from './checks/mod-json.js';
import { checkModInfo, MODINFO_FILE } from './checks/modinfo-json.js';
import { createReporter } from './report.js';

const DESCRIPTION_HTML_FILE = '_metadata/description.html';

/**
 * @typedef {object} ModResult
 * @property {string} dir  The folder as given by the caller.
 * @property {string | null} modId  The modId when mod.json declares a valid one.
 * @property {import('./report.js').Finding[]} findings
 */

/**
 * Validates one mod folder: its `mod.json` and `_metadata/modinfo.json`.
 * Rejects when `dir` is not a directory; every other problem is a finding.
 * @param {string} dir
 * @returns {Promise<ModResult>}
 */
export async function validateMod(dir) {
  const root = resolve(dir);
  if (!(await isDirectory(root))) {
    throw new NotADirectoryError(dir);
  }

  const findings = [];
  let modId = null;

  const modJson = await readJson(root, MODJSON_FILE, 'MODJSON');
  findings.push(...modJson.findings);
  if (modJson.ok) {
    findings.push(...checkModJson(modJson.data, { folderName: basename(root) }));
    const declared = modJson.data?.modId;
    if (typeof declared === 'string' && MODID_PATTERN.test(declared)) modId = declared;
  }

  const modInfo = await readJson(root, MODINFO_FILE, 'MODINFO');
  findings.push(...modInfo.findings);
  if (modInfo.ok) {
    const hasDescriptionHtml = await isFile(join(root, DESCRIPTION_HTML_FILE));
    findings.push(...checkModInfo(modInfo.data, { hasDescriptionHtml }));
  }

  return { dir, modId, findings };
}

export class NotADirectoryError extends Error {
  constructor(dir) {
    super(`Not a directory: ${dir}`);
    this.name = 'NotADirectoryError';
    this.dir = dir;
  }
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
