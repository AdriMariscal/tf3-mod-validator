// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Checks that a group of mods can be active in any combination without
// stepping on each other. See "Load order" and "Combinability" in
// docs/mod-format.md.

import { join } from 'node:path';

import { hashFile } from './files.js';
import { pointer, severityOf } from './report.js';
import { loadMod } from './validate-mod.js';

/**
 * @typedef {object} Location
 * @property {string} dir  The mod folder as given by the caller.
 * @property {string | null} modId
 * @property {string} file  Path relative to that mod folder.
 * @property {string} pointer  JSON Pointer into the file; `''` for the whole file.
 * @property {number | null} line
 */

/**
 * @typedef {object} SetFinding
 * @property {string} code
 * @property {'error' | 'warning'} severity
 * @property {string} message
 * @property {Location[]} locations  One or more places per mod involved, in input order.
 */

/**
 * Validates every mod on its own, then the group as a set.
 * Rejects with NotADirectoryError when any path is not a directory.
 * @param {string[]} dirs
 * @returns {Promise<{ mods: import('./validate-mod.js').ModResult[], findings: SetFinding[] }>}
 */
export async function validateModSet(dirs) {
  const loaded = [];
  for (const dir of dirs) {
    loaded.push(await loadMod(dir));
  }
  return { mods: loaded.map(({ result }) => result), findings: await checkModSet(loaded.map(({ facts }) => facts)) };
}

/**
 * @param {import('./validate-mod.js').ModFacts[]} mods
 * @returns {Promise<SetFinding[]>}
 */
async function checkModSet(mods) {
  const findings = [];
  const report = (code, message, locations) => findings.push({ code, severity: severityOf(code), message, locations });

  // A modId resolves to its first mod in input order; later copies are only
  // reported as duplicates.
  const byModId = new Map();
  for (const mod of mods) {
    if (!mod.modId) continue;
    if (!byModId.has(mod.modId)) byModId.set(mod.modId, []);
    byModId.get(mod.modId).push(mod);
  }
  for (const [modId, copies] of byModId) {
    if (copies.length > 1) {
      report('MODSET_MODID_DUPLICATE', `${copies.length} mods declare modId "${modId}"; the game keeps only one copy.`, copies.map((mod) => at(mod, 'mod.json', '/modId')));
    }
  }
  const resolved = new Map([...byModId].map(([modId, copies]) => [modId, copies[0]]));
  const canBeActiveTogether = (a, b) => !(a.modId && a.modId === b.modId) && !incompatibilityBetween(a, b) && !incompatibilityBetween(b, a);

  checkDependencies(resolved, report);
  checkIncompatibilities(resolved, report);
  checkCycles(resolved, report);
  await checkContent(mods, canBeActiveTogether, report);
  checkScriptConflicts(mods, canBeActiveTogether, report);
  checkBaseConfigConflicts(mods, canBeActiveTogether, report);

  return findings;
}

function checkDependencies(resolved, report) {
  for (const mod of resolved.values()) {
    for (const dependency of mod.dependencies) {
      if (dependency.optional) continue;
      const target = resolved.get(dependency.modId);
      const here = at(mod, 'mod.json', pointer('dependencies', dependency.index));
      if (!target) {
        report('MODSET_DEPENDENCY_NOT_IN_SET', `"${mod.modId}" requires "${dependency.modId}", which is not in the set.`, [here]);
      } else if (!revisionMatches(dependency, target)) {
        report(
          'MODSET_DEPENDENCY_REVISION',
          `"${mod.modId}" requires "${dependency.modId}" revision ${describeRange(dependency)}, but the set has revision ${target.revision}.`,
          [here, at(target, 'mod.json', '/revision')],
        );
      }
    }
  }
}

function checkIncompatibilities(resolved, report) {
  for (const mod of resolved.values()) {
    for (const incompatibility of mod.incompatibilities) {
      const target = resolved.get(incompatibility.modId);
      if (!target || !revisionMatches(incompatibility, target)) continue;
      if (!incompatibilityBetween(target, mod)) {
        report(
          'MODSET_INCOMPAT_ASYMMETRIC',
          `"${mod.modId}" declares "${target.modId}" incompatible, but "${target.modId}" does not declare "${mod.modId}" incompatible.`,
          [at(mod, 'mod.json', pointer('incompatibilities', incompatibility.index)), at(target, 'mod.json', target.declaresIncompatibilities ? '/incompatibilities' : '')],
        );
      }
    }
    for (const dependency of mod.dependencies) {
      const target = resolved.get(dependency.modId);
      const blocking = target && incompatibilityBetween(target, mod);
      if (!dependency.optional && blocking) {
        report(
          'MODSET_DEP_INCOMPAT_CONFLICT',
          `"${mod.modId}" requires "${target.modId}", but "${target.modId}" declares "${mod.modId}" incompatible.`,
          [at(mod, 'mod.json', pointer('dependencies', dependency.index)), at(target, 'mod.json', pointer('incompatibilities', blocking.index))],
        );
      }
    }
  }
}

/** Reports each strongly connected group of dependencies once, with one cycle through it. */
function checkCycles(resolved, report) {
  const order = [...resolved.keys()];
  const edges = (modId) => resolved.get(modId).dependencies.filter((d) => resolved.has(d.modId) && d.modId !== modId);

  for (const component of stronglyConnected(order, (modId) => edges(modId).map((d) => d.modId))) {
    if (component.length < 2) continue;
    const members = new Set(component);
    const cycle = shortestCycle(component[0], (modId) => edges(modId).filter((d) => members.has(d.modId)));
    report(
      'MODSET_DEPENDENCY_CYCLE',
      `Dependency cycle: ${[...cycle.map(({ from }) => from), cycle[0].from].map((id) => `"${id}"`).join(' -> ')}.`,
      cycle.map(({ from, dependency }) => at(resolved.get(from), 'mod.json', pointer('dependencies', dependency.index))),
    );
  }
}

/** Tarjan's algorithm. Components come out sorted by their first member in `order`. */
function stronglyConnected(order, successors) {
  const rank = new Map(order.map((id, i) => [id, i]));
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = (id) => {
    index.set(id, index.size);
    low.set(id, index.get(id));
    stack.push(id);
    onStack.add(id);
    for (const next of successors(id)) {
      if (!index.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id), index.get(next)));
      }
    }
    if (low.get(id) === index.get(id)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component.sort((a, b) => rank.get(a) - rank.get(b)));
    }
  };

  for (const id of order) {
    if (!index.has(id)) visit(id);
  }
  return components.sort((a, b) => rank.get(a[0]) - rank.get(b[0]));
}

/** Breadth-first search for the shortest cycle through `start`, as a list of edges. */
function shortestCycle(start, edges) {
  const parent = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const dependency of edges(from)) {
      if (dependency.modId === start) {
        const path = [{ from, dependency }];
        for (let step = parent.get(from); step; step = parent.get(step.from)) path.unshift(step);
        return path;
      }
      if (!parent.has(dependency.modId)) {
        parent.set(dependency.modId, { from, dependency });
        queue.push(dependency.modId);
      }
    }
  }
  throw new Error(`No cycle through ${start}`);
}

async function checkContent(mods, canBeActiveTogether, report) {
  const byPath = new Map();
  const byFoldedPath = new Map();
  mods.forEach((mod, i) => {
    for (const path of mod.contentFiles) {
      append(byPath, path, i);
      const folded = path.toLowerCase();
      if (!byFoldedPath.has(folded)) byFoldedPath.set(folded, new Map());
      append(byFoldedPath.get(folded), i, path);
    }
  });

  for (const path of [...byPath.keys()].sort()) {
    const clashing = clashingMods(byPath.get(path), mods, canBeActiveTogether);
    if (clashing.length < 2) continue;
    const hashes = await Promise.all(clashing.map((i) => hashFile(join(mods[i].root, path))));
    const identical = hashes.every((hash) => hash === hashes[0]);
    report(
      identical ? 'MODSET_CONTENT_IDENTICAL' : 'MODSET_CONTENT_COLLISION',
      identical
        ? `${clashing.length} mods ship identical copies of ${path}; harmless today, but an update to one of them will silently override the others.`
        : `${clashing.length} mods ship different files at ${path}; the one loaded last silently replaces the others.`,
      clashing.map((i) => at(mods[i], path)),
    );
  }

  for (const folded of [...byFoldedPath.keys()].sort()) {
    const perMod = [...byFoldedPath.get(folded)];
    const involved = new Set();
    for (let a = 0; a < perMod.length; a += 1) {
      for (let b = a + 1; b < perMod.length; b += 1) {
        const [i, pathsA] = perMod[a];
        const [j, pathsB] = perMod[b];
        const differOnlyInCase = pathsA.some((p) => pathsB.some((q) => p !== q));
        if (differOnlyInCase && canBeActiveTogether(mods[i], mods[j])) {
          involved.add(i).add(j);
        }
      }
    }
    if (involved.size === 0) continue;
    const ordered = [...involved].sort((x, y) => x - y);
    report(
      'MODSET_CONTENT_CASE_COLLISION',
      `Paths under content/ differ only in letter case (${folded}); on a case-insensitive file system they are the same file.`,
      ordered.flatMap((i) => byFoldedPath.get(folded).get(i).map((path) => at(mods[i], path))),
    );
  }
}

function checkScriptConflicts(mods, canBeActiveTogether, report) {
  const keys = new Map();
  const fields = new Map();
  mods.forEach((mod, i) => {
    for (const { file, scan } of mod.scripts) {
      for (const { key, line } of scan.saveDataKeys) firstPerMod(keys, key, i, at(mod, file, '', line));
      for (const { module, field, line } of scan.moduleFields) firstPerMod(fields, `${module}\0${field}`, i, at(mod, file, '', line));
    }
  });

  for (const [key, perMod] of keys) {
    const clashing = clashingMods([...perMod.keys()], mods, canBeActiveTogether);
    if (clashing.length < 2) continue;
    report('MODSET_SAVEDATA_KEY_CONFLICT', `${clashing.length} mods save GUI data under the key "${key}", so their data mixes.`, clashing.map((i) => perMod.get(i)));
  }
  for (const [id, perMod] of fields) {
    const clashing = clashingMods([...perMod.keys()], mods, canBeActiveTogether);
    if (clashing.length < 2) continue;
    const [module, field] = id.split('\0');
    report('MODSET_MODULE_FIELD_CONFLICT', `${clashing.length} mods assign field "${field}" of module "${module}"; the last one to run wins for everyone.`, clashing.map((i) => perMod.get(i)));
  }
}

/**
 * Two mods that write different fixed values to one base config field cannot
 * both get their way: the one activated last wins. The same value is fine.
 */
function checkBaseConfigConflicts(mods, canBeActiveTogether, report) {
  const writes = new Map();
  mods.forEach((mod, i) => {
    for (const { file, path, value, line } of mod.baseConfigWrites) {
      firstPerMod(writes, path, i, { value, location: at(mod, file, '', line) });
    }
  });
  for (const [path, perMod] of writes) {
    const indexes = [...perMod.keys()];
    const value = (i) => perMod.get(i).value;
    const clashing = indexes
      .filter((i) => indexes.some((j) => value(j) !== value(i) && canBeActiveTogether(mods[i], mods[j])))
      .sort((a, b) => a - b);
    if (clashing.length < 2) continue;
    const values = [...new Set(clashing.map(value))].join(', ');
    report('MODSET_BASECONFIG_CONFLICT', `${clashing.length} mods set base config field "${path}" to different fixed values (${values}); the one activated last wins.`, clashing.map((i) => perMod.get(i).location));
  }
}

/** The mods (by index, sorted) that can be active together with at least one other mod of `indexes`. */
function clashingMods(indexes, mods, canBeActiveTogether) {
  return indexes.filter((i) => indexes.some((j) => j !== i && canBeActiveTogether(mods[i], mods[j]))).sort((a, b) => a - b);
}

/** The entry of `a.incompatibilities` that applies to `b`, if any. */
function incompatibilityBetween(a, b) {
  if (!b.modId) return undefined;
  return a.incompatibilities.find((incompatibility) => incompatibility.modId === b.modId && revisionMatches(incompatibility, b));
}

/** A target without a valid revision matches any range: we cannot tell. */
function revisionMatches(reference, target) {
  if (target.revision === undefined) return true;
  return (reference.revisionMin === undefined || target.revision >= reference.revisionMin) && (reference.revisionMax === undefined || target.revision <= reference.revisionMax);
}

function describeRange({ revisionMin, revisionMax }) {
  if (revisionMax === undefined) return `${revisionMin} or later`;
  if (revisionMin === undefined) return `${revisionMax} or earlier`;
  return `${revisionMin} to ${revisionMax}`;
}

function at(mod, file, pointer = '', line = null) {
  return { dir: mod.dir, modId: mod.modId, file, pointer, line };
}

function append(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function firstPerMod(map, key, modIndex, location) {
  if (!map.has(key)) map.set(key, new Map());
  if (!map.get(key).has(modIndex)) map.get(key).set(modIndex, location);
}
