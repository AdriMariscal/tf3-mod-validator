// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Lists the regular files under `root/sub`, recursively, as paths relative
 * to `root` with `/` separators, sorted. Any path segment starting with a
 * dot (`.DS_Store`, `.git/`) is skipped. A missing folder gives `[]`.
 * @param {string} root
 * @param {string} [sub]
 * @returns {Promise<string[]>}
 */
export async function listFiles(root, sub = '') {
  let entries;
  try {
    entries = await readdir(join(root, sub), { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (path.split('/').some((segment) => segment.startsWith('.'))) continue;
    files.push(path);
  }
  return files.sort();
}

/** SHA-256 of a file's bytes, as hex. */
export async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
