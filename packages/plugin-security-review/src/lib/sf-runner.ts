// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { execa } from 'execa';
import type { SfRunner } from './preflight';

/**
 * Wraps execa as the production SfRunner used by preflight checks. Defaults to
 * spawning the `sf` binary (Salesforce CLI) — override the binary in tests or
 * when running against a non-default install.
 *
 * Returns subprocess failure as a non-zero `exitCode` rather than throwing, so
 * preflight functions can produce friendly error messages instead of stack
 * traces. (Master prompt operating principle 7: errors are content.)
 */
export function makeExecaSfRunner(binary = 'sf'): SfRunner {
  return async (args) => {
    const result = await execa(binary, [...args], { reject: false });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : -1,
    };
  };
}
