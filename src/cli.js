// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

import pkg from '../package.json' with { type: 'json' };
import { validateModSet } from './validate-mod-set.js';
import { NotADirectoryError, validateMod } from './validate-mod.js';

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;

// Bump when the shape of the --json output changes incompatibly.
export const JSON_SCHEMA_VERSION = 1;

export const FORMATS = ['text', 'json', 'github'];

const USAGE = `Usage: tf3-mod-validator [options] <mod-folder>...

Checks Transport Fever 3 mods without opening the game.
Each folder is checked on its own. With --set, the folders are also
checked as a set of mods that must work in any combination.

Options:
  --set            Also check the folders as one mod set
  --format <name>  Output format: text (default), json or github
  --json           Same as --format json
  -h, --help       Show this help
  -v, --version    Print the version

Exit codes: 0 no errors (warnings allowed), 1 errors found, 2 usage error.
`;

/**
 * Runs the command line.
 * @param {string[]} argv  Arguments without the node binary and script path.
 * @param {{ stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream, cwd?: string }} io
 *   `cwd` is the folder that `--format github` makes file paths relative to.
 * @returns {Promise<number>} The exit code.
 */
export async function run(argv, { stdout, stderr, cwd = process.cwd() }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        set: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        format: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (error) {
    stderr.write(`${error.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(USAGE);
    return EXIT_OK;
  }
  if (values.version) {
    stdout.write(`${pkg.version}\n`);
    return EXIT_OK;
  }
  if (positionals.length === 0) {
    stderr.write(`Missing mod folder.\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  const format = values.format ?? (values.json ? 'json' : 'text');
  if (!FORMATS.includes(format)) {
    stderr.write(`Unknown format "${format}". Use one of: ${FORMATS.join(', ')}.\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (values.json && format !== 'json') {
    stderr.write(`--json cannot be combined with --format ${format}.\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  let mods;
  let set = null;
  try {
    if (values.set) {
      const result = await validateModSet(positionals);
      mods = result.mods;
      set = { findings: result.findings };
    } else {
      mods = [];
      for (const dir of positionals) {
        mods.push(await validateMod(dir));
      }
    }
  } catch (error) {
    if (!(error instanceof NotADirectoryError)) throw error;
    stderr.write(`${error.message}\n`);
    return EXIT_USAGE;
  }

  const summary = summarize(mods, set);
  if (format === 'json') stdout.write(formatJson(mods, set, summary));
  else if (format === 'github') stdout.write(formatGithub(mods, set, summary, cwd));
  else stdout.write(formatText(mods, set, summary));
  return summary.errors > 0 ? EXIT_FINDINGS : EXIT_OK;
}

function summarize(mods, set) {
  const all = [...mods.flatMap((mod) => mod.findings), ...(set?.findings ?? [])];
  return {
    mods: mods.length,
    errors: all.filter((finding) => finding.severity === 'error').length,
    warnings: all.filter((finding) => finding.severity === 'warning').length,
  };
}

function formatJson(mods, set, summary) {
  return JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, mods, set, summary }, null, 2) + '\n';
}

function formatText(mods, set, summary) {
  const lines = [];
  for (const mod of mods) {
    lines.push(mod.modId ? `${mod.dir} (${mod.modId})` : mod.dir);
    if (mod.findings.length === 0) {
      lines.push('  ok');
    }
    for (const finding of mod.findings) {
      lines.push(`  ${finding.severity.padEnd(7)}  ${finding.code}  ${formatLocation(finding)}`);
      lines.push(`           ${finding.message}`);
    }
    lines.push('');
  }
  if (set) {
    lines.push('Mod set');
    if (set.findings.length === 0) {
      lines.push('  ok');
    }
    for (const finding of set.findings) {
      lines.push(`  ${finding.severity.padEnd(7)}  ${finding.code}`);
      lines.push(`           ${finding.message}`);
      for (const location of finding.locations) {
        lines.push(`           - ${location.dir}: ${formatLocation(location)}`);
      }
    }
    lines.push('');
  }
  lines.push(summaryLine(set, summary));
  return lines.join('\n') + '\n';
}

/**
 * One GitHub Actions annotation per finding, and per location for set
 * findings, so each one shows up on its file in the pull request. File paths
 * are relative to `cwd`, which in a workflow is the repository root.
 */
function formatGithub(mods, set, summary, cwd) {
  const lines = [];
  const annotate = (finding, dir, location) => {
    const properties = [`file=${escapeProperty(relative(cwd, join(dir, location.file)).split(sep).join('/'))}`];
    if (location.line !== null) properties.push(`line=${location.line}`);
    properties.push(`title=${escapeProperty(finding.code)}`);
    const where = location.line === null && location.pointer ? ` (at ${location.pointer})` : '';
    lines.push(`::${finding.severity} ${properties.join(',')}::${escapeData(finding.message + where)}`);
  };
  for (const mod of mods) {
    for (const finding of mod.findings) annotate(finding, mod.dir, finding);
  }
  for (const finding of set?.findings ?? []) {
    for (const location of finding.locations) annotate(finding, location.dir, location);
  }
  lines.push(summaryLine(set, summary));
  return lines.join('\n') + '\n';
}

/** Escapes the message of a workflow command. */
export function escapeData(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** Escapes a property value of a workflow command, such as `file` or `title`. */
export function escapeProperty(text) {
  return escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

function summaryLine(set, summary) {
  const scope = set ? ' as a set' : '';
  return `${plural(summary.mods, 'mod')} checked${scope}: ${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}.`;
}

/** `file:line` for scripts, `file#pointer` for JSON, `file` for the whole file. */
function formatLocation({ file, pointer, line }) {
  if (line !== null) return `${file}:${line}`;
  return pointer ? `${file}#${pointer}` : file;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
