// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pkg from '../package.json' with { type: 'json' };
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, JSON_SCHEMA_VERSION, run } from '../src/cli.js';
import { FIXTURES, makeMod, VALID_MOD_JSON, VALID_MODINFO } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/tf3-mod-validator.js', import.meta.url));
const minimal = join(FIXTURES, 'demo_minimal');
const broken = join(FIXTURES, 'demo_broken');

/** Runs the CLI in process and captures its output. */
async function cli(...argv) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });
  return { code, stdout, stderr };
}

describe('cli: exit codes', () => {
  test('0 when there are no findings', async () => {
    const { code, stdout } = await cli(minimal);
    assert.equal(code, EXIT_OK);
    assert.match(stdout, /\(demo_minimal\)\n {2}ok\n/);
    assert.match(stdout, /1 mod checked: 0 errors, 0 warnings\./);
  });

  test('0 when there are only warnings', async () => {
    const dir = await makeMod('demo_mod_copy', { 'mod.json': VALID_MOD_JSON, '_metadata/modinfo.json': VALID_MODINFO });
    const { code, stdout } = await cli(dir, '--json');
    assert.equal(code, EXIT_OK);
    assert.deepEqual(JSON.parse(stdout).summary, { mods: 1, errors: 0, warnings: 1 });
  });

  test('1 when any mod has errors', async () => {
    const { code, stdout } = await cli(minimal, broken);
    assert.equal(code, EXIT_FINDINGS);
    assert.match(stdout, /2 mods checked: 12 errors, 3 warnings\./);
    assert.match(stdout, /error {4}MODJSON_MODID_FORMAT {2}mod\.json#\/modId\n/);
  });

  test('2 without a folder', async () => {
    const { code, stderr } = await cli();
    assert.equal(code, EXIT_USAGE);
    assert.match(stderr, /Missing mod folder/);
  });

  test('2 for an unknown option', async () => {
    const { code, stderr } = await cli('--strict', minimal);
    assert.equal(code, EXIT_USAGE);
    assert.match(stderr, /Usage:/);
  });

  test('2 when a folder does not exist, with no report printed', async () => {
    const { code, stdout, stderr } = await cli(minimal, join(FIXTURES, 'does_not_exist'));
    assert.equal(code, EXIT_USAGE);
    assert.equal(stdout, '');
    assert.match(stderr, /Not a directory/);
  });
});

describe('cli: options', () => {
  test('--help prints usage and exits 0', async () => {
    const { code, stdout } = await cli('--help');
    assert.equal(code, EXIT_OK);
    assert.match(stdout, /^Usage: tf3-mod-validator/);
  });

  test('--version prints the package version', async () => {
    const { code, stdout } = await cli('-v');
    assert.equal(code, EXIT_OK);
    assert.equal(stdout, `${pkg.version}\n`);
  });

  test('--json prints every finding with a stable shape', async () => {
    const { code, stdout } = await cli('--json', broken);
    assert.equal(code, EXIT_FINDINGS);
    const report = JSON.parse(stdout);
    assert.equal(report.schemaVersion, JSON_SCHEMA_VERSION);
    assert.deepEqual(report.summary, { mods: 1, errors: 12, warnings: 3 });
    assert.equal(report.mods[0].dir, broken);
    assert.equal(report.mods[0].modId, null);
    assert.deepEqual(report.mods[0].findings[0], {
      code: 'MODJSON_UNKNOWN_FIELD',
      severity: 'warning',
      file: 'mod.json',
      pointer: '/visibel',
      message: 'Unknown field "visibel". Check the spelling; field names are case-sensitive.',
    });
  });
});

describe('cli: executable', () => {
  const exec = promisify(execFile);

  test('the bin script sets the process exit code', async () => {
    const ok = await exec(process.execPath, [BIN, minimal]);
    assert.match(ok.stdout, /0 errors/);

    await assert.rejects(exec(process.execPath, [BIN, broken]), (error) => error.code === EXIT_FINDINGS);
    await assert.rejects(exec(process.execPath, [BIN]), (error) => error.code === EXIT_USAGE);
  });
});
