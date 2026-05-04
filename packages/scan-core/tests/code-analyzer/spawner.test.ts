// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Smoke tests for the production execa-backed CodeAnalyzerSpawner. Uses
// `node` (always available) instead of `sf` so CI doesn't need Salesforce
// CLI installed.

import { describe, it, expect } from 'vitest';
import { makeExecaCodeAnalyzerSpawner } from '../../src/code-analyzer/spawner';

describe('makeExecaCodeAnalyzerSpawner', () => {
  it('spawns the binary and returns stdout + exitCode 0 on success', async () => {
    const spawner = makeExecaCodeAnalyzerSpawner();
    const result = await spawner('node', ['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^v\d+/);
  });

  it('returns non-zero exitCode without throwing on subprocess failure', async () => {
    const spawner = makeExecaCodeAnalyzerSpawner();
    const result = await spawner('node', ['--bogus-flag-xyz-abc']);

    expect(result.exitCode).not.toBe(0);
  });
});
