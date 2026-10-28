// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { scanScript, validateMod } from '../src/index.js';
import { blankComments, isScriptFile, scanBaseConfigWrites } from '../src/scripts.js';
import { codes, makeMod, only, VALID_MOD_JSON, VALID_MODINFO } from './helpers.js';

describe('scripts: comments', () => {
  test('line and block comments are blanked, line breaks kept', () => {
    const source = 'a = 1 -- note\n--[[ one\ntwo ]] b = 2\n--[==[ x ]] ]==] c = 3';
    const blanked = blankComments(source);
    assert.equal(blanked.length, source.length);
    assert.equal(blanked.split('\n').length, source.split('\n').length);
    assert.doesNotMatch(blanked, /note|one|two|x/);
    assert.match(blanked, /a = 1/);
    assert.match(blanked, /b = 2/);
    assert.match(blanked, /c = 3/);
  });

  test('"--" inside strings and long strings is not a comment', () => {
    const source = 's = "a -- b" t = \'--\' u = [[ -- ]] v = 1';
    assert.equal(blankComments(source), source);
  });

  test('escaped quotes do not end a string', () => {
    const source = 's = "say \\"--\\" twice" -- gone';
    assert.equal(blankComments(source), 's = "say \\"--\\" twice"        ');
  });

  test('only .lua and .tl files are scripts; .d.tl only declares types', () => {
    assert.deepEqual(['a.lua', 'a.tl', 'a.d.tl', 'a.json', 'lua'].map(isScriptFile), [true, true, false, false, false]);
  });
});

describe('scripts: saved-data keys', () => {
  test('finds literal keys with their line', () => {
    const scan = scanScript('local x = 1\napi.gui.game.setGuiSaveData("demo_mod", data)\nsetGuiSaveData( \'other\' , data)');
    assert.deepEqual(scan.saveDataKeys, [
      { key: 'demo_mod', line: 2 },
      { key: 'other', line: 3 },
    ]);
  });

  test('ignores computed keys and commented-out calls', () => {
    const scan = scanScript('setGuiSaveData(KEY, data)\n-- setGuiSaveData("old", data)\nsetGuiSaveData("a" .. b, data)');
    assert.deepEqual(scan.saveDataKeys, []);
  });

  test('a key other than the modId is SCRIPT_SAVEDATA_KEY', async () => {
    const dir = await makeMod('demo_mod', {
      'mod.json': VALID_MOD_JSON,
      '_metadata/modinfo.json': VALID_MODINFO,
      'res/scripts/ui.lua': '\n\napi.gui.game.setGuiSaveData("settings", data)\napi.gui.game.setGuiSaveData("demo_mod", data)',
    });
    const finding = only((await validateMod(dir)).findings, 'SCRIPT_SAVEDATA_KEY');
    assert.equal(finding.file, 'res/scripts/ui.lua');
    assert.equal(finding.pointer, '');
    assert.equal(finding.line, 3);
    assert.equal(finding.severity, 'warning');
  });

  test('scripts in dot folders are ignored', async () => {
    const dir = await makeMod('demo_mod', {
      'mod.json': VALID_MOD_JSON,
      '_metadata/modinfo.json': VALID_MODINFO,
      '.backup/ui.lua': 'setGuiSaveData("settings", data)',
    });
    assert.deepEqual(codes((await validateMod(dir)).findings), []);
  });
});

describe('scripts: ug_require module fields', () => {
  test('finds assignments and function definitions on the alias', () => {
    const scan = scanScript(
      [
        'local util = ug_require("base/util")',
        'util.speed = 2',
        'function util.helper() end',
        'function util:method() end',
        'if util.speed == 2 then end',
        'local copy = util.speed',
        'util.speed = 3',
      ].join('\n'),
    );
    assert.deepEqual(scan.moduleFields, [
      { module: 'base/util', field: 'speed', line: 2 },
      { module: 'base/util', field: 'helper', line: 3 },
      { module: 'base/util', field: 'method', line: 4 },
    ]);
  });

  test('accepts the call without parentheses and Teal annotations', () => {
    const scan = scanScript("local a = ug_require 'base/a'\nlocal b: B = ug_require('base/b')\na.x = 1\nb.y = 2");
    assert.deepEqual(
      scan.moduleFields.map(({ module, field }) => `${module}.${field}`),
      ['base/a.x', 'base/b.y'],
    );
  });

  test('does not confuse other names that end like the alias', () => {
    const scan = scanScript('local m = ug_require("base/m")\nother.m.x = 1\nmm.x = 1\nm.x == 1');
    assert.deepEqual(scan.moduleFields, []);
  });
});

describe('scripts: base config writes', () => {
  test('finds fixed values written through the fourth parameter', () => {
    const source = [
      'local script = {}',
      '-- baseConfig.ignored = true',
      'function script.preRunFn(captureParams, configDict, allModParams, baseConfig)',
      '  baseConfig.noCosts = true',
      '  baseConfig.costs . terrainRaise = 1.50;',
      '  baseConfig.costs.terrainLower = baseConfig.costs.terrainLower * 2',
      '  baseConfig.locations = 3 + 1',
      "  baseConfig.name = 'demo'",
      '  baseConfig.limit = 0x10',
      '  baseConfig.removed = nil',
      'end',
      'return script',
    ].join('\n');
    assert.deepEqual(scanBaseConfigWrites(source, 'preRunFn'), [
      { path: 'noCosts', value: 'true', line: 4 },
      { path: 'costs.terrainRaise', value: '1.5', line: 5 },
      { path: 'name', value: '"demo"', line: 8 },
      { path: 'limit', value: '16', line: 9 },
      { path: 'removed', value: 'nil', line: 10 },
    ]);
  });

  test('accepts an assigned function, Teal annotations and any parameter name', () => {
    const source = 'local m = {}\nm.preRunFn = function(a: any, b: any, c: any, cfg: BaseConfig)\n  cfg.noCosts = false\nend';
    assert.deepEqual(scanBaseConfigWrites(source, 'preRunFn'), [{ path: 'noCosts', value: 'false', line: 3 }]);
  });

  test('needs the named function and its fourth parameter', () => {
    assert.deepEqual(scanBaseConfigWrites('function preRunFnOld(a, b, c, d)\n  d.noCosts = true\nend', 'preRunFn'), []);
    assert.deepEqual(scanBaseConfigWrites('function preRunFn(a, b, c)\n  c.noCosts = true\nend', 'preRunFn'), []);
  });
});
