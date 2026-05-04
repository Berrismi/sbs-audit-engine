// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// These tests use a real subprocess (`node`, always available on the runner)
// to exercise makeExecaSfRunner without mocking execa. Per project TDD lean
// rules: real code over mocks where reasonable.

import { describe, it, expect } from 'vitest';
import { makeExecaSfRunner } from '../../src/lib/sf-runner';
import type { Spawner } from '../../src/lib/sf-runner';

describe('makeExecaSfRunner', () => {
  it('spawns the binary and returns stdout + exitCode 0 on success', async () => {
    const runner = makeExecaSfRunner('node');
    const result = await runner(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^v\d+/);
  });

  it('returns non-zero exitCode without throwing when the subprocess fails', async () => {
    const runner = makeExecaSfRunner('node');
    const result = await runner(['--bogus-flag-xyz-abc']);
    expect(result.exitCode).not.toBe(0);
  });

  it('surfaces undefined exitCode (e.g., a SIGKILL-ed subprocess) as -1', async () => {
    const fakeSpawner: Spawner = async () => ({
      stdout: '',
      stderr: 'Killed',
      exitCode: undefined,
    });

    const runner = makeExecaSfRunner('whatever', fakeSpawner);
    const result = await runner([]);

    expect(result.exitCode).toBe(-1);
  });
});
