// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Keeps the code catalogue, the tests and the READMEs in sync.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import { CODES } from '../src/index.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

describe('finding codes', () => {
  test('have an UPPER_SNAKE name, a severity and a description', () => {
    for (const [code, entry] of Object.entries(CODES)) {
      assert.match(code, /^(MODJSON|MODINFO|SCRIPT|MODSET)_[A-Z0-9_]+$/, code);
      assert.ok(['error', 'warning'].includes(entry.severity), code);
      assert.ok(entry.description.length > 0, code);
    }
  });

  test('every code is exercised by at least one test', async () => {
    const files = (await readdir(new URL('test/', root))).filter((name) => name.endsWith('.test.js') && name !== 'codes.test.js');
    const sources = (await Promise.all(files.map((name) => read(`test/${name}`)))).join('\n');
    const untested = Object.keys(CODES).filter((code) => !sources.includes(code));
    assert.deepEqual(untested, []);
  });

  for (const readme of ['README.md', 'README.es.md']) {
    test(`every code is listed in ${readme} with its severity`, async () => {
      const text = await read(readme);
      const missing = Object.entries(CODES)
        .filter(([code, { severity }]) => !text.includes(`| \`${code}\` | ${severity} |`))
        .map(([code]) => code);
      assert.deepEqual(missing, []);
    });
  }
});
