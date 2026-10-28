// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { NotADirectoryError, validateMod } from '../src/index.js';
import { codes, FIXTURES, makeMod, VALID_MOD_JSON, VALID_MODINFO } from './helpers.js';

describe('validateMod: fixtures', () => {
  test('demo_minimal passes', async () => {
    const result = await validateMod(join(FIXTURES, 'demo_minimal'));
    assert.equal(result.modId, 'demo_minimal');
    assert.deepEqual(result.findings, []);
  });

  test('demo_full passes', async () => {
    const result = await validateMod(join(FIXTURES, 'demo_full'));
    assert.equal(result.modId, 'demo_full');
    assert.deepEqual(result.findings, []);
  });

  test('demo_broken reports every planted problem, in file order', async () => {
    const result = await validateMod(join(FIXTURES, 'demo_broken'));
    assert.equal(result.modId, null);
    assert.deepEqual(codes(result.findings), [
      'MODJSON_UNKNOWN_FIELD',
      'MODJSON_MODID_FORMAT',
      'MODJSON_REVISION_TYPE',
      'MODJSON_SEVERITY_VALUE',
      'MODJSON_DEP_MODINFO_MISSING',
      'MODJSON_DEP_REVISION_RANGE',
      'MODJSON_PARAM_UITYPE_VALUE',
      'MODJSON_PARAM_DEFAULTINDEX',
      'MODJSON_SCRIPT_FILENAME_FORMAT',
      'MODINFO_NAME_LENGTH',
      'MODINFO_SUMMARY_LINEBREAK',
      'MODINFO_AUTHORS_MISSING',
      'MODINFO_TAGS_MISSING',
      'MODINFO_DEPENDENCY_FORMAT',
      'MODINFO_URL_FORMAT',
    ]);
  });

  test('demo_bad_json reports the syntax error and still checks modinfo.json', async () => {
    const result = await validateMod(join(FIXTURES, 'demo_bad_json'));
    assert.deepEqual(codes(result.findings), ['MODJSON_INVALID_JSON']);
    assert.match(result.findings[0].message, /line 4/);
  });

  test('the same input always gives the same output', async () => {
    const dir = join(FIXTURES, 'demo_broken');
    assert.deepEqual(await validateMod(dir), await validateMod(dir));
  });
});

describe('validateMod: files', () => {
  test('rejects with NotADirectoryError when the folder does not exist', async () => {
    await assert.rejects(validateMod(join(FIXTURES, 'does_not_exist')), NotADirectoryError);
  });

  test('rejects with NotADirectoryError when given a file', async () => {
    await assert.rejects(validateMod(join(FIXTURES, 'demo_minimal', 'mod.json')), NotADirectoryError);
  });

  test('an empty folder is MODJSON_MISSING and MODINFO_MISSING', async () => {
    const dir = await makeMod('demo_mod', {});
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODJSON_MISSING', 'MODINFO_MISSING']);
  });

  test('a folder where mod.json should be counts as missing', async () => {
    const dir = await makeMod('demo_mod', { 'mod.json/placeholder.txt': '', '_metadata/modinfo.json': VALID_MODINFO });
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODJSON_MISSING']);
  });

  test('invalid JSON in modinfo.json is MODINFO_INVALID_JSON', async () => {
    const dir = await makeMod('demo_mod', { 'mod.json': VALID_MOD_JSON, '_metadata/modinfo.json': '{ name: "x" }' });
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODINFO_INVALID_JSON']);
  });

  test('a byte order mark is a warning and the file is still checked', async () => {
    const dir = await makeMod('demo_mod', {
      'mod.json': '﻿' + JSON.stringify({ modId: 'demo_mod', revision: 'x' }),
      '_metadata/modinfo.json': '﻿' + JSON.stringify(VALID_MODINFO),
    });
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODJSON_BOM', 'MODJSON_REVISION_TYPE', 'MODINFO_BOM']);
  });

  test('compares the folder name with modId', async () => {
    const dir = await makeMod('Demo Mod v2', { 'mod.json': VALID_MOD_JSON, '_metadata/modinfo.json': VALID_MODINFO });
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODJSON_MODID_FOLDER_MISMATCH']);
  });

  test('a trailing slash does not hide the folder name', async () => {
    const dir = await makeMod('demo_mod', { 'mod.json': VALID_MOD_JSON, '_metadata/modinfo.json': VALID_MODINFO });
    assert.deepEqual((await validateMod(dir + '/')).findings, []);
  });

  test('detects _metadata/description.html', async () => {
    const dir = await makeMod('demo_mod', {
      'mod.json': VALID_MOD_JSON,
      '_metadata/modinfo.json': { ...VALID_MODINFO, description: 'Text' },
      '_metadata/description.html': '<p>Text</p>',
    });
    assert.deepEqual(codes((await validateMod(dir)).findings), ['MODINFO_DESCRIPTION_IGNORED']);
  });
});
