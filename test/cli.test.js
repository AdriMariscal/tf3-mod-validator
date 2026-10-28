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
import { escapeData, escapeProperty, EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, JSON_SCHEMA_VERSION, run } from '../src/cli.js';
import { FIXTURES, makeMod, VALID_MOD_JSON, VALID_MODINFO } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/tf3-mod-validator.js', import.meta.url));
const minimal = join(FIXTURES, 'demo_minimal');
const broken = join(FIXTURES, 'demo_broken');

/** Runs the CLI in process and captures its output. */
function cli(...argv) {
  return cliIn(process.cwd(), ...argv);
}

/** Like `cli`, with `cwd` as the folder that GitHub annotation paths are relative to. */
async function cliIn(cwd, ...argv) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
    cwd,
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
    assert.equal(report.set, null);
    assert.deepEqual(report.mods[0].findings[0], {
      code: 'MODJSON_UNKNOWN_FIELD',
      severity: 'warning',
      file: 'mod.json',
      pointer: '/visibel',
      line: null,
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

describe('cli: --set', () => {
  const setDirs = ['demo_roads', 'demo_signals', 'demo_trams'].map((name) => join(FIXTURES, 'set_clash', name));

  test('prints the set block, counts its findings and exits 1', async () => {
    const { code, stdout } = await cli('--set', ...setDirs);
    assert.equal(code, EXIT_FINDINGS);
    assert.match(stdout, /\nMod set\n {2}error {4}MODSET_INCOMPAT_ASYMMETRIC\n/);
    assert.match(stdout, /- .*demo_trams: res\/scripts\/ui\.lua:3\n/);
    assert.match(stdout, /3 mods checked as a set: 3 errors, 2 warnings\./);
  });

  test('a clean set prints "ok" and exits 0', async () => {
    const { code, stdout } = await cli('--set', minimal);
    assert.equal(code, EXIT_OK);
    assert.match(stdout, /\nMod set\n {2}ok\n/);
  });

  test('--json adds the set findings with their locations', async () => {
    const { stdout } = await cli('--set', '--json', ...setDirs);
    const report = JSON.parse(stdout);
    assert.deepEqual(report.summary, { mods: 3, errors: 3, warnings: 2 });
    assert.deepEqual(report.set.findings[0].locations[0], {
      dir: setDirs[1],
      modId: 'demo_signals',
      file: 'mod.json',
      pointer: '/incompatibilities/0',
      line: null,
    });
  });

  test('without --set the same folders are only checked one by one', async () => {
    const { code, stdout } = await cli(...setDirs);
    assert.equal(code, EXIT_OK);
    assert.doesNotMatch(stdout, /Mod set/);
  });
});

describe('cli: --format', () => {
  test('--format json is the same as --json', async () => {
    const a = await cli('--format', 'json', broken);
    const b = await cli('--json', broken);
    assert.equal(a.code, EXIT_FINDINGS);
    assert.equal(a.stdout, b.stdout);
  });

  test('--format text is the default', async () => {
    assert.equal((await cli('--format', 'text', broken)).stdout, (await cli(broken)).stdout);
  });

  test('an unknown format is a usage error', async () => {
    const { code, stdout, stderr } = await cli('--format', 'xml', minimal);
    assert.equal(code, EXIT_USAGE);
    assert.equal(stdout, '');
    assert.match(stderr, /Unknown format "xml"/);
  });

  test('--json with another format is a usage error', async () => {
    const { code, stderr } = await cli('--json', '--format', 'github', minimal);
    assert.equal(code, EXIT_USAGE);
    assert.match(stderr, /--json cannot be combined with --format github/);
  });
});

describe('cli: --format github', () => {
  test('prints one annotation per finding, then the summary', async () => {
    const { code, stdout } = await cliIn(FIXTURES, '--format', 'github', broken);
    assert.equal(code, EXIT_FINDINGS);
    const lines = stdout.trimEnd().split('\n');
    assert.equal(
      lines[0],
      '::warning file=demo_broken/mod.json,title=MODJSON_UNKNOWN_FIELD::Unknown field "visibel". Check the spelling; field names are case-sensitive. (at /visibel)',
    );
    assert.equal(lines.filter((line) => line.startsWith('::error ')).length, 12);
    assert.equal(lines.filter((line) => line.startsWith('::warning ')).length, 3);
    assert.equal(lines.at(-1), '1 mod checked: 12 errors, 3 warnings.');
  });

  test('a clean mod prints only the summary', async () => {
    const { code, stdout } = await cliIn(FIXTURES, '--format', 'github', minimal);
    assert.equal(code, EXIT_OK);
    assert.equal(stdout, '1 mod checked: 0 errors, 0 warnings.\n');
  });

  test('script findings carry their line and no pointer', async () => {
    const dirs = ['demo_roads', 'demo_signals', 'demo_trams'].map((name) => join(FIXTURES, 'set_clash', name));
    const { stdout } = await cliIn(FIXTURES, '--set', '--format', 'github', ...dirs);
    assert.match(
      stdout,
      /^::warning file=set_clash\/demo_trams\/res\/scripts\/ui\.lua,line=3,title=SCRIPT_SAVEDATA_KEY::[^\n]*mixes with other mods\.\n/m,
    );
  });

  test('a set finding is annotated once per location', async () => {
    const dirs = ['demo_roads', 'demo_signals', 'demo_trams'].map((name) => join(FIXTURES, 'set_clash', name));
    const { stdout } = await cliIn(FIXTURES, '--set', '--format', 'github', ...dirs);
    const cycle = stdout.split('\n').filter((line) => line.includes('title=MODSET_DEPENDENCY_CYCLE'));
    assert.deepEqual(
      cycle.map((line) => line.slice(0, line.indexOf(',title='))),
      ['::error file=set_clash/demo_roads/mod.json', '::error file=set_clash/demo_signals/mod.json'],
    );
    assert.match(stdout, /\n3 mods checked as a set: 3 errors, 2 warnings\.\n$/);
  });

  test('escapes workflow command values', () => {
    assert.equal(escapeData('100% done\r\nnext: a, b'), '100%25 done%0D%0Anext: a, b');
    assert.equal(escapeProperty('dir,with:odd%name'), 'dir%2Cwith%3Aodd%25name');
  });
});
