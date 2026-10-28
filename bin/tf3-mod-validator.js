#!/usr/bin/env node
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { EXIT_USAGE, run } from '../src/cli.js';

try {
  process.exitCode = await run(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
} catch (error) {
  // An unexpected failure (e.g. a permission error) must not look like exit
  // code 1, which means "the mod has errors".
  process.stderr.write(`Internal error: ${error.stack ?? error}\n`);
  process.exitCode = EXIT_USAGE;
}
