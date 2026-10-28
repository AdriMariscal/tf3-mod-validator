// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** The codes of a list of findings, in order. */
export function codes(findings) {
  return findings.map((finding) => finding.code);
}

/** Finds the single finding with `code`, failing loudly when there is not exactly one. */
export function only(findings, code) {
  const matches = findings.filter((finding) => finding.code === code);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${code}, got ${matches.length}: ${JSON.stringify(findings, null, 2)}`);
  }
  return matches[0];
}

/**
 * Creates a mod folder named `folderName` in a fresh temporary directory.
 * `files` maps relative paths to contents; objects are written as JSON.
 */
export async function makeMod(folderName, files) {
  const root = join(await mkdtemp(join(tmpdir(), 'tf3-mod-validator-')), folderName);
  await mkdir(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

export const VALID_MOD_JSON = Object.freeze({ modId: 'demo_mod', revision: 1 });

export const VALID_MODINFO = Object.freeze({
  name: 'Demo mod',
  summary: 'A demo mod.',
  authors: [{ name: 'Demo Author', role: 'Creator' }],
  tags: ['Misc'],
});
