// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TmpdirManager } from './runner';

/**
 * Production TmpdirManager backed by node:fs.promises. Creates the scan
 * tmpdir under `parentDir` (default: `process.cwd()`), prefixed with
 * `.hm-scan-`. `cleanup()` is idempotent (`force: true`) so partial
 * failures don't leak directories.
 *
 * Why not `os.tmpdir()` — `sf project retrieve start --output-dir <abs>`
 * rejects with `OutputDirOutsideProjectError` when the output dir is
 * outside the Salesforce DX project root. Since the consultant runs the
 * security-review CLI from inside their project (it's a `sf` plugin
 * subcommand), `process.cwd()` is the project root and creating tmpdirs
 * there satisfies the retrieve constraint. The `.hm-scan-` prefix is
 * gitignore-friendly — pair with a `.hm-scan-*` glob in the
 * consultant's .gitignore if they want to exclude leftover scan dirs
 * from their commits.
 *
 * The runner's try/finally cleanup covers the success path AND the
 * exit-mid-flight path. SIGINT / SIGTERM during scan won't be caught
 * here — those leave a `.hm-scan-<random>/` directory the consultant
 * can rm manually. Chose not to wire signal handlers in the OSS engine;
 * that's a closed-app concern.
 *
 * Tests can pass an explicit `parentDir` to keep filesystem touches
 * inside the test's own scratch space.
 */
export interface MakeNodeTmpdirManagerOptions {
  /** Parent directory the scan tmpdir is created under. Defaults to
   *  `process.cwd()`. */
  parentDir?: string;
}

export function makeNodeTmpdirManager(opts: MakeNodeTmpdirManagerOptions = {}): TmpdirManager {
  const parent = opts.parentDir ?? process.cwd();
  return {
    create: () => mkdtemp(join(parent, '.hm-scan-')),
    cleanup: (path) => rm(path, { recursive: true, force: true }),
    readFile: (path) => readFile(path, 'utf8'),
  };
}
