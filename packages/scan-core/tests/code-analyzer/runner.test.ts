// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { runCodeAnalyzer } from '../../src/code-analyzer/runner';
import type { CodeAnalyzerSpawner, TmpdirManager } from '../../src/code-analyzer/runner';

const okJsonOutput = JSON.stringify({
  results: [
    {
      engine: 'pmd',
      rule: 'ApexCSRF',
      severity: 1,
      primaryLocation: { file: '/abs/MyController.cls', startLine: 42 },
      message: 'CSRF protection missing',
    },
    {
      engine: 'pmd',
      rule: 'ApexBadCrypto',
      severity: 4,
      primaryLocation: { file: '/abs/MyService.cls', startLine: 100 },
      message: 'Weak crypto algorithm used',
    },
  ],
});

function makeOkSpawner(jsonOutput: string = okJsonOutput): CodeAnalyzerSpawner {
  return async () => ({ stdout: jsonOutput, stderr: '', exitCode: 0 });
}

function makeOkTmpdir(jsonOutput: string = okJsonOutput): TmpdirManager {
  return {
    create: async () => '/tmp/scan-test-xyz',
    cleanup: async () => {},
    readFile: async () => jsonOutput,
  };
}

describe('runCodeAnalyzer', () => {
  it('returns ok with findings when retrieve + analyze + parse all succeed', async () => {
    const result = await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: makeOkSpawner(),
      tmpdir: makeOkTmpdir(),
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.findings).toHaveLength(2);
      expect(result.engine).toBe('pmd');
    }
  });

  it('returns failed (phase=retrieve) when sf project retrieve start exits non-zero', async () => {
    let callCount = 0;
    const failOnRetrieve: CodeAnalyzerSpawner = async (_binary, args) => {
      callCount++;
      if (args.includes('retrieve')) {
        return { stdout: '', stderr: 'Org not authed', exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    const result = await runCodeAnalyzer({
      alias: 'bogus',
      spawner: failOnRetrieve,
      tmpdir: makeOkTmpdir(),
    });

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.phase).toBe('retrieve');
      expect(result.error.message).toContain('Org not authed');
    }
    expect(callCount).toBe(1); // analyze never called
  });

  it('returns failed (phase=analyze) when sf code-analyzer run exits non-zero', async () => {
    const failOnAnalyze: CodeAnalyzerSpawner = async (_binary, args) => {
      if (args.includes('code-analyzer')) {
        return { stdout: '', stderr: 'Analyzer crashed', exitCode: 2 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    const result = await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: failOnAnalyze,
      tmpdir: makeOkTmpdir(),
    });

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.phase).toBe('analyze');
      expect(result.error.message).toContain('Analyzer crashed');
    }
  });

  it('returns failed (phase=parse) when the output JSON is malformed', async () => {
    const result = await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: makeOkSpawner(),
      tmpdir: makeOkTmpdir('{not valid json'),
    });

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.phase).toBe('parse');
    }
  });

  it('applies severityThreshold to filter findings (default: includes everything)', async () => {
    const high = await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: makeOkSpawner(),
      tmpdir: makeOkTmpdir(),
      severityThreshold: 'High',
    });

    expect(high.kind).toBe('ok');
    if (high.kind === 'ok') {
      // okJsonOutput has Critical + Low; threshold High includes only Critical + High
      expect(high.findings).toHaveLength(1);
      expect(high.findings[0]?.severity).toBe('Critical');
    }
  });

  it('always cleans up the tmpdir, even on failure', async () => {
    let cleanupCalled = false;
    const trackingTmpdir: TmpdirManager = {
      create: async () => '/tmp/scan-test-cleanup',
      cleanup: async (path) => {
        if (path === '/tmp/scan-test-cleanup') cleanupCalled = true;
      },
      readFile: async () => okJsonOutput,
    };
    const failOnAnalyze: CodeAnalyzerSpawner = async (_b, args) =>
      args.includes('code-analyzer')
        ? { stdout: '', stderr: 'fail', exitCode: 1 }
        : { stdout: '', stderr: '', exitCode: 0 };

    await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: failOnAnalyze,
      tmpdir: trackingTmpdir,
    });

    expect(cleanupCalled).toBe(true);
  });

  it('passes the configured metadataTypes to the retrieve subprocess', async () => {
    const calls: string[][] = [];
    const trackingSpawner: CodeAnalyzerSpawner = async (_b, args) => {
      calls.push([...args]);
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: trackingSpawner,
      tmpdir: makeOkTmpdir(),
      metadataTypes: ['ApexClass', 'CustomObject'],
    });

    const retrieveCall = calls[0];
    expect(retrieveCall?.join(' ')).toContain('ApexClass,CustomObject');
  });

  it('passes --rule-selector Security to code-analyzer by default (alpha.36+)', async () => {
    const calls: string[][] = [];
    const trackingSpawner: CodeAnalyzerSpawner = async (_b, args) => {
      calls.push([...args]);
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: trackingSpawner,
      tmpdir: makeOkTmpdir(),
    });

    // Second invocation is the analyzer (first is retrieve).
    const analyzeCall = calls[1];
    expect(analyzeCall).toBeDefined();
    expect(analyzeCall![0]).toBe('code-analyzer');
    expect(analyzeCall).toContain('--rule-selector');
    const selectorIdx = analyzeCall!.indexOf('--rule-selector');
    expect(analyzeCall![selectorIdx + 1]).toBe('Security');
  });

  it('forwards an explicit ruleSelector option to code-analyzer', async () => {
    const calls: string[][] = [];
    const trackingSpawner: CodeAnalyzerSpawner = async (_b, args) => {
      calls.push([...args]);
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    await runCodeAnalyzer({
      alias: 'client-prod',
      spawner: trackingSpawner,
      tmpdir: makeOkTmpdir(),
      ruleSelector: 'Recommended',
    });

    const analyzeCall = calls[1];
    const selectorIdx = analyzeCall!.indexOf('--rule-selector');
    expect(analyzeCall![selectorIdx + 1]).toBe('Recommended');
  });
});
