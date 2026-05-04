// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { execa } from 'execa';
import type { CodeAnalyzerSpawner } from './runner';

/**
 * Production CodeAnalyzerSpawner backed by execa. Returns subprocess
 * failure as a non-zero exitCode rather than throwing so the runner can
 * produce friendly per-phase error messages instead of stack traces.
 * Signal-killed processes (SIGKILL) surface as -1, same convention as
 * the plugin's sf-runner.
 */
export function makeExecaCodeAnalyzerSpawner(): CodeAnalyzerSpawner {
  return async (binary, args) => {
    const result = await execa(binary, [...args], { reject: false });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : -1,
    };
  };
}
