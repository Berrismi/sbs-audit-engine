// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TmpdirManager } from './runner';

/**
 * Production TmpdirManager backed by node:fs.promises + node:os.tmpdir.
 * Each `create()` returns a fresh directory under the OS temp root, named
 * `hm-scan-<random>`. `cleanup()` is idempotent (force: true) so partial
 * failures don't leak directories.
 */
export function makeNodeTmpdirManager(): TmpdirManager {
  return {
    create: () => mkdtemp(join(tmpdir(), 'hm-scan-')),
    cleanup: (path) => rm(path, { recursive: true, force: true }),
    readFile: (path) => readFile(path, 'utf8'),
  };
}
