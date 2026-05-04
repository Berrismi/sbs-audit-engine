// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { execa } from 'execa';
import type { SfRunner } from './preflight';

/**
 * Subprocess result shape we depend on. Matches the relevant subset of execa's
 * return type, but extracted as our own interface so tests can supply a fake
 * spawner without pulling in execa's full type surface.
 */
export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

export type Spawner = (binary: string, args: readonly string[]) => Promise<SpawnResult>;

const realSpawner: Spawner = async (binary, args) => {
  const result = await execa(binary, [...args], { reject: false });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
};

/**
 * Wraps a spawner as the production SfRunner used by preflight checks. Defaults
 * to spawning the `sf` binary (Salesforce CLI) via execa — override the binary
 * or the spawner in tests.
 *
 * Returns subprocess failure as a non-zero `exitCode` rather than throwing so
 * preflight functions can produce friendly error messages instead of stack
 * traces. (Master prompt operating principle 7: errors are content.) When the
 * subprocess is signal-killed (SIGKILL), execa returns `undefined` for
 * `exitCode`; we surface that as `-1` so downstream comparisons stay safe.
 */
export function makeExecaSfRunner(binary = 'sf', spawner: Spawner = realSpawner): SfRunner {
  return async (args) => {
    const result = await spawner(binary, args);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : -1,
    };
  };
}
