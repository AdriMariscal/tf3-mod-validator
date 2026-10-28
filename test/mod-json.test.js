// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkModJson } from '../src/index.js';
import { codes, only, VALID_MOD_JSON } from './helpers.js';

/** Checks VALID_MOD_JSON with some fields overridden. */
function check(overrides, context) {
  return checkModJson({ ...VALID_MOD_JSON, ...overrides }, context);
}

describe('mod.json: document', () => {
  test('a minimal valid object has no findings', () => {
    assert.deepEqual(check({}), []);
  });

  test('a non-object document is MODJSON_NOT_OBJECT and stops there', () => {
    for (const data of [[], 'x', 1, null]) {
      assert.deepEqual(codes(checkModJson(data)), ['MODJSON_NOT_OBJECT']);
    }
  });

  test('every finding carries file, pointer, severity and message', () => {
    const finding = only(check({ revision: 'x' }), 'MODJSON_REVISION_TYPE');
    assert.deepEqual(Object.keys(finding).sort(), ['code', 'file', 'message', 'pointer', 'severity']);
    assert.equal(finding.file, 'mod.json');
    assert.equal(finding.pointer, '/revision');
    assert.equal(finding.severity, 'error');
  });

  test('unknown top-level fields are MODJSON_UNKNOWN_FIELD warnings', () => {
    const finding = only(check({ ModId: 'x' }), 'MODJSON_UNKNOWN_FIELD');
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.pointer, '/ModId');
  });

  test('pointers escape "/" and "~"', () => {
    assert.equal(only(check({ 'a/b~c': 1 }), 'MODJSON_UNKNOWN_FIELD').pointer, '/a~1b~0c');
  });
});

describe('mod.json: modId', () => {
  test('missing modId is MODJSON_MODID_MISSING', () => {
    assert.deepEqual(codes(checkModJson({ revision: 1 })), ['MODJSON_MODID_MISSING']);
  });

  test('characters outside a-z, 0-9 and _ are MODJSON_MODID_FORMAT', () => {
    for (const modId of ['Demo_mod', 'demo-mod', 'demo mod', 'démo_mod', '', 42, null]) {
      assert.deepEqual(codes(check({ modId })), ['MODJSON_MODID_FORMAT'], `modId ${JSON.stringify(modId)}`);
    }
  });

  test('a modId without <author>_<name> shape is a MODJSON_MODID_CONVENTION warning', () => {
    for (const modId of ['demomod', '_demo', 'demo_', 'demo__']) {
      assert.deepEqual(codes(check({ modId })), ['MODJSON_MODID_CONVENTION'], `modId ${modId}`);
    }
    assert.deepEqual(check({ modId: 'demo_my_mod_2' }), []);
  });

  test('a folder name different from modId is MODJSON_MODID_FOLDER_MISMATCH', () => {
    assert.deepEqual(codes(check({}, { folderName: 'demo_mod_v2' })), ['MODJSON_MODID_FOLDER_MISMATCH']);
    assert.deepEqual(check({}, { folderName: 'demo_mod' }), []);
  });
});

describe('mod.json: revision, severities and flags', () => {
  test('missing revision is MODJSON_REVISION_MISSING', () => {
    assert.deepEqual(codes(checkModJson({ modId: 'demo_mod' })), ['MODJSON_REVISION_MISSING']);
  });

  test('a non-integer revision is MODJSON_REVISION_TYPE', () => {
    for (const revision of ['1', 1.5, null, true]) {
      assert.deepEqual(codes(check({ revision })), ['MODJSON_REVISION_TYPE']);
    }
  });

  test('a negative revision is MODJSON_REVISION_RANGE; zero is allowed', () => {
    assert.deepEqual(codes(check({ revision: -1 })), ['MODJSON_REVISION_RANGE']);
    assert.deepEqual(check({ revision: 0 }), []);
  });

  test('severities accept only None, Warning and Critical', () => {
    assert.deepEqual(check({ severityAdd: 'None', severityRemove: 'Critical' }), []);
    const findings = check({ severityAdd: 'none', severityRemove: 2 });
    assert.deepEqual(codes(findings), ['MODJSON_SEVERITY_VALUE', 'MODJSON_SEVERITY_VALUE']);
    assert.deepEqual(findings.map((f) => f.pointer), ['/severityAdd', '/severityRemove']);
  });

  test('visible and cosmetic must be booleans', () => {
    assert.deepEqual(check({ visible: false, cosmetic: true }), []);
    assert.deepEqual(codes(check({ visible: 'true', cosmetic: 0 })), ['MODJSON_FIELD_TYPE', 'MODJSON_FIELD_TYPE']);
  });
});

describe('mod.json: dependencies', () => {
  const dependency = (mod, extra = {}) => ({ mod, modInfo: { displayName: 'Library' }, ...extra });

  test('a complete dependency has no findings', () => {
    const findings = check({
      dependencies: [dependency({ modId: 'demo_lib', revisionMin: 1, revisionMax: 4 }, { loadBefore: false, optional: true })],
    });
    assert.deepEqual(findings, []);
  });

  test('dependencies must be an array of objects', () => {
    assert.deepEqual(codes(check({ dependencies: {} })), ['MODJSON_FIELD_TYPE']);
    assert.deepEqual(codes(check({ dependencies: ['demo_lib'] })), ['MODJSON_FIELD_TYPE']);
  });

  test('a dependency without mod is MODJSON_DEP_MOD_MISSING', () => {
    assert.deepEqual(codes(check({ dependencies: [{ modInfo: { displayName: 'Library' } }] })), ['MODJSON_DEP_MOD_MISSING']);
  });

  test('mod must be an object', () => {
    assert.deepEqual(codes(check({ dependencies: [dependency('demo_lib')] })), ['MODJSON_FIELD_TYPE']);
  });

  test('mod without modId is MODJSON_DEP_MODID_MISSING', () => {
    assert.deepEqual(codes(check({ dependencies: [dependency({})] })), ['MODJSON_DEP_MODID_MISSING']);
  });

  test('an invalid mod.modId is MODJSON_DEP_MODID_FORMAT', () => {
    const finding = only(check({ dependencies: [dependency({ modId: 'Demo Lib' })] }), 'MODJSON_DEP_MODID_FORMAT');
    assert.equal(finding.pointer, '/dependencies/0/mod/modId');
  });

  test('revision limits must be -1 or non-negative integers', () => {
    assert.deepEqual(check({ dependencies: [dependency({ modId: 'demo_lib', revisionMin: -1, revisionMax: 0 })] }), []);
    for (const revisionMin of [-2, 1.5, '1', null]) {
      assert.deepEqual(codes(check({ dependencies: [dependency({ modId: 'demo_lib', revisionMin })] })), ['MODJSON_DEP_REVISION_INVALID']);
    }
  });

  test('revisionMin above revisionMax is MODJSON_DEP_REVISION_RANGE; -1 means no limit', () => {
    assert.deepEqual(codes(check({ dependencies: [dependency({ modId: 'demo_lib', revisionMin: 5, revisionMax: 2 })] })), ['MODJSON_DEP_REVISION_RANGE']);
    assert.deepEqual(check({ dependencies: [dependency({ modId: 'demo_lib', revisionMin: 5, revisionMax: -1 })] }), []);
  });

  test('depending on itself is MODJSON_DEP_SELF', () => {
    assert.deepEqual(codes(check({ dependencies: [dependency({ modId: 'demo_mod' })] })), ['MODJSON_DEP_SELF']);
  });

  test('the same modId twice is MODJSON_DEP_DUPLICATE, reported on the second entry', () => {
    const finding = only(
      check({ dependencies: [dependency({ modId: 'demo_lib' }), dependency({ modId: 'demo_lib' })] }),
      'MODJSON_DEP_DUPLICATE',
    );
    assert.equal(finding.pointer, '/dependencies/1/mod/modId');
  });

  test('missing modInfo is a MODJSON_DEP_MODINFO_MISSING warning', () => {
    const finding = only(check({ dependencies: [{ mod: { modId: 'demo_lib' } }] }), 'MODJSON_DEP_MODINFO_MISSING');
    assert.equal(finding.severity, 'warning');
  });

  test('modInfo without displayName is a MODJSON_DEP_DISPLAYNAME_MISSING warning', () => {
    for (const modInfo of [{}, { displayName: '  ' }, { displayName: 3 }]) {
      assert.deepEqual(codes(check({ dependencies: [{ mod: { modId: 'demo_lib' }, modInfo }] })), ['MODJSON_DEP_DISPLAYNAME_MISSING']);
    }
  });

  test('modInfo, its url, loadBefore and optional have fixed types', () => {
    assert.deepEqual(codes(check({ dependencies: [{ mod: { modId: 'demo_lib' }, modInfo: 'Library' }] })), ['MODJSON_FIELD_TYPE']);
    const findings = check({
      dependencies: [dependency({ modId: 'demo_lib' }, { modInfo: { displayName: 'Library', url: 1 }, loadBefore: 'yes', optional: 1 })],
    });
    assert.deepEqual(
      findings.map((f) => [f.code, f.pointer]),
      [
        ['MODJSON_FIELD_TYPE', '/dependencies/0/modInfo/url'],
        ['MODJSON_FIELD_TYPE', '/dependencies/0/loadBefore'],
        ['MODJSON_FIELD_TYPE', '/dependencies/0/optional'],
      ],
    );
  });
});

describe('mod.json: incompatibilities', () => {
  test('a valid incompatibility has no findings and needs no modInfo', () => {
    assert.deepEqual(check({ incompatibilities: [{ mod: { modId: 'demo_rival', revisionMax: 3 } }] }), []);
  });

  test('uses its own MODJSON_INCOMPAT_* codes', () => {
    const cases = [
      [{}, 'MODJSON_INCOMPAT_MOD_MISSING'],
      [{ mod: {} }, 'MODJSON_INCOMPAT_MODID_MISSING'],
      [{ mod: { modId: 'Rival' } }, 'MODJSON_INCOMPAT_MODID_FORMAT'],
      [{ mod: { modId: 'demo_rival', revisionMin: -5 } }, 'MODJSON_INCOMPAT_REVISION_INVALID'],
      [{ mod: { modId: 'demo_rival', revisionMin: 3, revisionMax: 1 } }, 'MODJSON_INCOMPAT_REVISION_RANGE'],
      [{ mod: { modId: 'demo_mod' } }, 'MODJSON_INCOMPAT_SELF'],
    ];
    for (const [entry, code] of cases) {
      assert.deepEqual(codes(check({ incompatibilities: [entry] })), [code], JSON.stringify(entry));
    }
  });

  test('the same modId twice is MODJSON_INCOMPAT_DUPLICATE', () => {
    const entry = { mod: { modId: 'demo_rival' } };
    assert.deepEqual(codes(check({ incompatibilities: [entry, entry] })), ['MODJSON_INCOMPAT_DUPLICATE']);
  });

  test('a modId that is both dependency and incompatibility is MODJSON_DEP_INCOMPAT_CONFLICT', () => {
    const finding = only(
      check({
        dependencies: [{ mod: { modId: 'demo_lib' }, modInfo: { displayName: 'Library' } }],
        incompatibilities: [{ mod: { modId: 'demo_other' } }, { mod: { modId: 'demo_lib' } }],
      }),
      'MODJSON_DEP_INCOMPAT_CONFLICT',
    );
    assert.equal(finding.pointer, '/incompatibilities/1/mod/modId');
  });
});

describe('mod.json: params', () => {
  // `undefined` in overrides removes the field, as JSON has no undefined.
  const param = (overrides = {}) =>
    Object.fromEntries(
      Object.entries({ key: 'speed', name: 'Speed', uiType: 'ComboBox', values: ['Slow', 'Fast'], ...overrides }).filter(([, v]) => v !== undefined),
    );

  test('valid params of every uiType have no findings', () => {
    const params = ['Button', 'Slider', 'ComboBox', 'IconButton', 'CheckBox'].map((uiType, i) => param({ key: `k${i}`, uiType }));
    assert.deepEqual(check({ params }), []);
  });

  test('params must be an array of objects', () => {
    assert.deepEqual(codes(check({ params: {} })), ['MODJSON_FIELD_TYPE']);
    assert.deepEqual(codes(check({ params: [1] })), ['MODJSON_FIELD_TYPE']);
  });

  test('a missing or empty key is MODJSON_PARAM_KEY_MISSING', () => {
    assert.deepEqual(codes(check({ params: [param({ key: undefined })] })), ['MODJSON_PARAM_KEY_MISSING']);
    assert.deepEqual(codes(check({ params: [param({ key: '' })] })), ['MODJSON_PARAM_KEY_MISSING']);
  });

  test('a repeated key is MODJSON_PARAM_KEY_DUPLICATE', () => {
    const finding = only(check({ params: [param(), param()] }), 'MODJSON_PARAM_KEY_DUPLICATE');
    assert.equal(finding.pointer, '/params/1/key');
  });

  test('a missing name is MODJSON_PARAM_NAME_MISSING', () => {
    assert.deepEqual(codes(check({ params: [param({ name: undefined })] })), ['MODJSON_PARAM_NAME_MISSING']);
  });

  test('tooltip must be a string', () => {
    assert.deepEqual(check({ params: [param({ tooltip: 'Hint' })] }), []);
    assert.deepEqual(codes(check({ params: [param({ tooltip: 1 })] })), ['MODJSON_FIELD_TYPE']);
  });

  test('a missing uiType is a warning; an unknown one is an error', () => {
    assert.equal(only(check({ params: [param({ uiType: undefined })] }), 'MODJSON_PARAM_UITYPE_MISSING').severity, 'warning');
    assert.deepEqual(codes(check({ params: [param({ uiType: 'combobox' })] })), ['MODJSON_PARAM_UITYPE_VALUE']);
  });

  test('values must be a non-empty array of strings', () => {
    assert.deepEqual(codes(check({ params: [param({ values: undefined })] })), ['MODJSON_PARAM_VALUES_INVALID']);
    assert.deepEqual(codes(check({ params: [param({ values: 'Slow' })] })), ['MODJSON_PARAM_VALUES_INVALID']);
    assert.equal(only(check({ params: [param({ values: ['Slow', 2] })] }), 'MODJSON_PARAM_VALUES_INVALID').pointer, '/params/0/values/1');
    assert.deepEqual(codes(check({ params: [param({ values: [] })] })), ['MODJSON_PARAM_VALUES_EMPTY']);
  });

  test('numbers must be finite numbers, as many as values', () => {
    assert.deepEqual(check({ params: [param({ numbers: [0.5, 2] })] }), []);
    assert.deepEqual(codes(check({ params: [param({ numbers: [1, '2'] })] })), ['MODJSON_PARAM_NUMBERS_INVALID']);
    assert.deepEqual(codes(check({ params: [param({ numbers: 1 })] })), ['MODJSON_PARAM_NUMBERS_INVALID']);
    assert.deepEqual(codes(check({ params: [param({ numbers: [1, 2, 3] })] })), ['MODJSON_PARAM_NUMBERS_LENGTH']);
  });

  test('defaultIndex is a 0-based index into values', () => {
    assert.deepEqual(check({ params: [param({ defaultIndex: 0 })] }), []);
    assert.deepEqual(check({ params: [param({ defaultIndex: 1 })] }), []);
    for (const defaultIndex of [-1, 2, 0.5, '0']) {
      assert.deepEqual(codes(check({ params: [param({ defaultIndex })] })), ['MODJSON_PARAM_DEFAULTINDEX'], `defaultIndex ${defaultIndex}`);
    }
  });

  test('a 1-based defaultIndex gets a hint', () => {
    assert.match(only(check({ params: [param({ defaultIndex: 2 })] }), 'MODJSON_PARAM_DEFAULTINDEX').message, /0-based/);
  });
});

describe('mod.json: scripts', () => {
  test('valid script references have no findings', () => {
    assert.deepEqual(
      check({
        preRunScript: { fileName: 'demo_mod::setup.lua@preRun' },
        runScript: { fileName: 'demo_mod::scripts/main.lua@run_all' },
        postRunScript: { fileName: 'demo_mod::setup@post' },
      }),
      [],
    );
  });

  test('a script must be an object', () => {
    assert.deepEqual(codes(check({ runScript: 'demo_mod::setup.lua@run' })), ['MODJSON_FIELD_TYPE']);
  });

  test('a malformed fileName is MODJSON_SCRIPT_FILENAME_FORMAT', () => {
    for (const fileName of [undefined, 'setup.lua', 'demo_mod::setup.lua', 'demo_mod:setup.lua@run', 'demo_mod::@run', 'demo_mod::setup.lua@1run', 7]) {
      assert.deepEqual(codes(check({ runScript: { fileName } })), ['MODJSON_SCRIPT_FILENAME_FORMAT'], `fileName ${fileName}`);
    }
  });

  test("a fileName in another mod's namespace is a MODJSON_SCRIPT_FOREIGN_MOD warning", () => {
    const finding = only(check({ runScript: { fileName: 'demo_other::setup.lua@run' } }), 'MODJSON_SCRIPT_FOREIGN_MOD');
    assert.equal(finding.severity, 'warning');
  });
});
