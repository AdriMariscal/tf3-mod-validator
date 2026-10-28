// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { NotADirectoryError, validateModSet } from '../src/index.js';
import { codes, FIXTURES, makeMod, only, VALID_MODINFO } from './helpers.js';

/**
 * Creates a valid mod. `modJson` is merged into `{ modId, revision: 1 }`;
 * `files` adds or replaces files.
 */
function mod(modId, modJson = {}, files = {}) {
  return makeMod(modId, { 'mod.json': { modId, revision: 1, ...modJson }, '_metadata/modinfo.json': VALID_MODINFO, ...files });
}

const requires = (modId, extra = {}) => ({ mod: { modId, ...extra }, modInfo: { displayName: modId } });
const forbids = (modId, extra = {}) => ({ mod: { modId, ...extra } });

async function checkSet(...dirs) {
  return (await validateModSet(await Promise.all(dirs))).findings;
}

describe('mod set: basics', () => {
  test('independent valid mods have no findings', async () => {
    const result = await validateModSet([await mod('demo_alpha'), await mod('demo_beta')]);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.mods.map((m) => [m.modId, m.findings]), [
      ['demo_alpha', []],
      ['demo_beta', []],
    ]);
  });

  test('keeps the single-mod findings of each mod', async () => {
    const result = await validateModSet([await mod('demo_alpha', { revision: 'x' })]);
    assert.deepEqual(codes(result.mods[0].findings), ['MODJSON_REVISION_TYPE']);
  });

  test('rejects with NotADirectoryError for a missing folder', async () => {
    await assert.rejects(validateModSet([join(FIXTURES, 'does_not_exist')]), NotADirectoryError);
  });

  test('a set finding lists one location per mod involved', async () => {
    const finding = only(await checkSet(mod('demo_alpha'), mod('demo_alpha')), 'MODSET_MODID_DUPLICATE');
    assert.deepEqual(Object.keys(finding).sort(), ['code', 'locations', 'message', 'severity']);
    assert.equal(finding.severity, 'error');
    assert.equal(finding.locations.length, 2);
    assert.deepEqual(Object.keys(finding.locations[0]).sort(), ['dir', 'file', 'line', 'modId', 'pointer']);
    assert.deepEqual(finding.locations.map((l) => [l.modId, l.file, l.pointer]), [
      ['demo_alpha', 'mod.json', '/modId'],
      ['demo_alpha', 'mod.json', '/modId'],
    ]);
  });
});

describe('mod set: dependencies', () => {
  test('a required dependency inside the set with a matching revision is fine', async () => {
    const findings = await checkSet(mod('demo_alpha', { dependencies: [requires('demo_lib', { revisionMin: 2 })] }), mod('demo_lib', { revision: 3 }));
    assert.deepEqual(findings, []);
  });

  test('a required dependency outside the set is a MODSET_DEPENDENCY_NOT_IN_SET warning', async () => {
    const finding = only(await checkSet(mod('demo_alpha', { dependencies: [requires('demo_lib')] })), 'MODSET_DEPENDENCY_NOT_IN_SET');
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.locations[0].pointer, '/dependencies/0');
  });

  test('a missing optional dependency is fine', async () => {
    assert.deepEqual(await checkSet(mod('demo_alpha', { dependencies: [requires('demo_lib', {})].map((d) => ({ ...d, optional: true })) })), []);
  });

  test('a revision outside the range is MODSET_DEPENDENCY_REVISION', async () => {
    const finding = only(
      await checkSet(mod('demo_alpha', { dependencies: [requires('demo_lib', { revisionMin: 2, revisionMax: 4 })] }), mod('demo_lib', { revision: 5 })),
      'MODSET_DEPENDENCY_REVISION',
    );
    assert.match(finding.message, /revision 2 to 4, but the set has revision 5/);
    assert.deepEqual(finding.locations.map((l) => l.pointer), ['/dependencies/0', '/revision']);
  });

  test('a two-mod cycle is one MODSET_DEPENDENCY_CYCLE', async () => {
    const finding = only(
      await checkSet(mod('demo_alpha', { dependencies: [requires('demo_beta')] }), mod('demo_beta', { dependencies: [requires('demo_alpha')] })),
      'MODSET_DEPENDENCY_CYCLE',
    );
    assert.equal(finding.message, 'Dependency cycle: "demo_alpha" -> "demo_beta" -> "demo_alpha".');
  });

  test('a longer cycle is reported with its shortest path from the first mod', async () => {
    const findings = await checkSet(
      mod('demo_a', { dependencies: [requires('demo_b')] }),
      mod('demo_b', { dependencies: [requires('demo_c'), requires('demo_d')] }),
      mod('demo_c', { dependencies: [requires('demo_a')] }),
      mod('demo_d', { dependencies: [requires('demo_c')] }),
      mod('demo_free', { dependencies: [requires('demo_a')] }),
    );
    const finding = only(findings, 'MODSET_DEPENDENCY_CYCLE');
    assert.equal(finding.message, 'Dependency cycle: "demo_a" -> "demo_b" -> "demo_c" -> "demo_a".');
    assert.deepEqual(finding.locations.map((l) => [l.modId, l.pointer]), [
      ['demo_a', '/dependencies/0'],
      ['demo_b', '/dependencies/0'],
      ['demo_c', '/dependencies/0'],
    ]);
  });

  test('a chain without a cycle is fine', async () => {
    const findings = await checkSet(mod('demo_a', { dependencies: [requires('demo_b')] }), mod('demo_b', { dependencies: [requires('demo_c')] }), mod('demo_c'));
    assert.deepEqual(findings, []);
  });
});

describe('mod set: incompatibilities', () => {
  test('incompatibilities declared on both sides are fine', async () => {
    assert.deepEqual(await checkSet(mod('demo_alpha', { incompatibilities: [forbids('demo_beta')] }), mod('demo_beta', { incompatibilities: [forbids('demo_alpha')] })), []);
  });

  test('a one-sided incompatibility is MODSET_INCOMPAT_ASYMMETRIC', async () => {
    const finding = only(await checkSet(mod('demo_alpha', { incompatibilities: [forbids('demo_beta')] }), mod('demo_beta')), 'MODSET_INCOMPAT_ASYMMETRIC');
    assert.deepEqual(finding.locations.map((l) => [l.modId, l.pointer]), [
      ['demo_alpha', '/incompatibilities/0'],
      ['demo_beta', ''],
    ]);
  });

  test('the other side may name a revision range that does not cover this mod', async () => {
    const findings = await checkSet(
      mod('demo_alpha', { revision: 5, incompatibilities: [forbids('demo_beta')] }),
      mod('demo_beta', { incompatibilities: [forbids('demo_alpha', { revisionMax: 3 })] }),
    );
    const finding = only(findings, 'MODSET_INCOMPAT_ASYMMETRIC');
    assert.equal(finding.locations[1].pointer, '/incompatibilities');
  });

  test('an incompatibility whose revision range misses the mod in the set does not count', async () => {
    assert.deepEqual(await checkSet(mod('demo_alpha', { incompatibilities: [forbids('demo_beta', { revisionMin: 4 })] }), mod('demo_beta', { revision: 2 })), []);
  });

  test('requiring a mod that forbids you is MODSET_DEP_INCOMPAT_CONFLICT', async () => {
    const findings = await checkSet(mod('demo_alpha', { dependencies: [requires('demo_beta')] }), mod('demo_beta', { incompatibilities: [forbids('demo_alpha')] }));
    assert.deepEqual(codes(findings), ['MODSET_DEP_INCOMPAT_CONFLICT', 'MODSET_INCOMPAT_ASYMMETRIC']);
    assert.deepEqual(only(findings, 'MODSET_DEP_INCOMPAT_CONFLICT').locations.map((l) => l.pointer), ['/dependencies/0', '/incompatibilities/0']);
  });
});

describe('mod set: content', () => {
  const texture = 'content/res/textures/demo/sign.tga';

  test('different files at the same path are MODSET_CONTENT_COLLISION', async () => {
    const finding = only(await checkSet(mod('demo_alpha', {}, { [texture]: 'A' }), mod('demo_beta', {}, { [texture]: 'B' })), 'MODSET_CONTENT_COLLISION');
    assert.deepEqual(finding.locations.map((l) => [l.modId, l.file]), [
      ['demo_alpha', texture],
      ['demo_beta', texture],
    ]);
  });

  test('identical files at the same path are a MODSET_CONTENT_IDENTICAL warning', async () => {
    const finding = only(await checkSet(mod('demo_alpha', {}, { [texture]: 'same' }), mod('demo_beta', {}, { [texture]: 'same' })), 'MODSET_CONTENT_IDENTICAL');
    assert.equal(finding.severity, 'warning');
  });

  test('mods declared incompatible never clash', async () => {
    const findings = await checkSet(
      mod('demo_alpha', { incompatibilities: [forbids('demo_beta')] }, { [texture]: 'A' }),
      mod('demo_beta', { incompatibilities: [forbids('demo_alpha')] }, { [texture]: 'B' }),
    );
    assert.deepEqual(findings, []);
  });

  test('in a group of three, only the mods that can be active together are listed', async () => {
    const findings = await checkSet(
      mod('demo_alpha', { incompatibilities: [forbids('demo_beta'), forbids('demo_gamma')] }, { [texture]: 'A' }),
      mod('demo_beta', { incompatibilities: [forbids('demo_alpha')] }, { [texture]: 'B' }),
      mod('demo_gamma', { incompatibilities: [forbids('demo_alpha')] }, { [texture]: 'C' }),
    );
    assert.deepEqual(only(findings, 'MODSET_CONTENT_COLLISION').locations.map((l) => l.modId), ['demo_beta', 'demo_gamma']);
  });

  test('paths that differ only in case are a MODSET_CONTENT_CASE_COLLISION warning', async () => {
    const finding = only(
      await checkSet(mod('demo_alpha', {}, { 'content/res/Sign.tga': 'A' }), mod('demo_beta', {}, { 'content/res/sign.tga': 'B' })),
      'MODSET_CONTENT_CASE_COLLISION',
    );
    assert.deepEqual(finding.locations.map((l) => l.file), ['content/res/Sign.tga', 'content/res/sign.tga']);
  });

  test('files outside content/ and dot files do not clash', async () => {
    const findings = await checkSet(
      mod('demo_alpha', {}, { 'res/notes.txt': 'A', 'content/.DS_Store': 'A' }),
      mod('demo_beta', {}, { 'res/notes.txt': 'B', 'content/.DS_Store': 'B' }),
    );
    assert.deepEqual(findings, []);
  });

  test('two copies of the same modId are reported as duplicates, not as clashes', async () => {
    const findings = await checkSet(mod('demo_alpha', {}, { [texture]: 'A' }), mod('demo_alpha', {}, { [texture]: 'B' }));
    assert.deepEqual(codes(findings), ['MODSET_MODID_DUPLICATE']);
  });
});

describe('mod set: scripts', () => {
  const ui = (key) => ({ 'res/scripts/ui.lua': `api.gui.game.setGuiSaveData("${key}", data)` });

  test('the same saved-data key in two mods is MODSET_SAVEDATA_KEY_CONFLICT', async () => {
    const findings = await checkSet(mod('demo_alpha', {}, ui('settings')), mod('demo_beta', {}, ui('settings')));
    const finding = only(findings, 'MODSET_SAVEDATA_KEY_CONFLICT');
    assert.deepEqual(finding.locations.map((l) => [l.modId, l.file, l.line]), [
      ['demo_alpha', 'res/scripts/ui.lua', 1],
      ['demo_beta', 'res/scripts/ui.lua', 1],
    ]);
  });

  test('assigning the same field of the same module is MODSET_MODULE_FIELD_CONFLICT', async () => {
    const patch = (value) => ({ 'res/scripts/patch.lua': `local cfg = ug_require("base/config")\ncfg.maxSpeed = ${value}` });
    const finding = only(await checkSet(mod('demo_alpha', {}, patch(1)), mod('demo_beta', {}, patch(2))), 'MODSET_MODULE_FIELD_CONFLICT');
    assert.match(finding.message, /field "maxSpeed" of module "base\/config"/);
    assert.deepEqual(finding.locations.map((l) => l.line), [2, 2]);
  });

  test('different fields of the same module are fine', async () => {
    const findings = await checkSet(
      mod('demo_alpha', {}, { 'a.lua': 'local m = ug_require("base/m")\nm.a = 1' }),
      mod('demo_beta', {}, { 'b.lua': 'local m = ug_require("base/m")\nm.b = 1' }),
    );
    assert.deepEqual(findings, []);
  });
});

describe('mod set: fixture', () => {
  test('set_clash reports every planted set problem, in a stable order', async () => {
    const base = join(FIXTURES, 'set_clash');
    const result = await validateModSet(['demo_roads', 'demo_signals', 'demo_trams'].map((name) => join(base, name)));
    assert.deepEqual(result.mods.map((m) => codes(m.findings)), [[], [], ['SCRIPT_SAVEDATA_KEY']]);
    assert.deepEqual(codes(result.findings), [
      'MODSET_INCOMPAT_ASYMMETRIC',
      'MODSET_DEPENDENCY_CYCLE',
      'MODSET_CONTENT_COLLISION',
      'MODSET_SAVEDATA_KEY_CONFLICT',
    ]);
  });
});
