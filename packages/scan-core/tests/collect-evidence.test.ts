// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import { collectEvidence } from '../src/index';
import type { ConnectionLike, ProgressEvent, SoqlQueryDef } from '../src/types';

const userQuery: SoqlQueryDef = {
  id: 'q-users',
  controlIds: ['SBS-ACS-001'],
  soql: 'SELECT Id FROM User',
  label: 'List users',
};

const okConnection: ConnectionLike = {
  query: async () => ({ records: [{ Id: 'u1' }], totalSize: 1, done: true }),
};

describe('collectEvidence', () => {
  it('returns a ScanResult with the assembled EvidenceBundle and the raw QueryResults', async () => {
    const result = await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [userQuery],
    });

    expect(result.bundle.subject_id).toBe('subj-1');
    expect(result.bundle.evidence).toHaveLength(1);
    expect(result.queryResults).toHaveLength(1);
    expect(result.queryResults[0]?.kind).toBe('ok');
  });

  it('plumbs onProgress through to the executor + brackets each phase with phase_start/phase_done', async () => {
    const events: ProgressEvent[] = [];

    await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [userQuery],
      onProgress: (e) => events.push(e),
    });

    // The SOQL phase emits phase_start, then per-query events, then phase_done.
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('phase_start');
    expect(types).toContain('query_start');
    expect(types).toContain('query_ok');
    expect(types[types.length - 1]).toBe('phase_done');
    // phase_start carries the source identifier for consumer rendering.
    const phaseStart = events.find((e) => e.type === 'phase_start');
    expect(phaseStart && 'source' in phaseStart ? phaseStart.source : undefined).toBe('soql');
    // phase_done carries a non-negative duration.
    const phaseDone = events.find((e) => e.type === 'phase_done');
    expect(
      phaseDone && 'durationMs' in phaseDone ? phaseDone.durationMs >= 0 : false,
    ).toBe(true);
  });

  it('returns an empty bundle when onlySources excludes "soql"', async () => {
    const result = await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [userQuery],
      onlySources: ['health_check_api'],
    });

    expect(result.bundle.evidence).toEqual([]);
    expect(result.queryResults).toEqual([]);
  });

  it('uses the default SOQL bundle when soqlQueries is not provided', async () => {
    // Default bundle comes from src/soql/queries.ts — we just assert it ran.
    const result = await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
    });

    // With at least one query in the default bundle, queryResults should be non-empty.
    expect(result.queryResults.length).toBeGreaterThan(0);
  });

  it('fetches Health Check evidence when the connection has a tooling namespace', async () => {
    const connectionWithTooling: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async (soql) => {
          if (soql.includes('SecurityHealthCheck ')) {
            return { records: [{ Score: 80 }], totalSize: 1, done: true };
          }
          return { records: [], totalSize: 0, done: true };
        },
      },
    };

    const result = await collectEvidence({
      connection: connectionWithTooling,
      subjectId: 'subj-1',
      soqlQueries: [],
    });

    const healthEvidence = result.bundle.evidence.find((e) => e.source === 'health_check_api');
    expect(healthEvidence).toBeDefined();
    if (healthEvidence?.source === 'health_check_api') {
      expect(healthEvidence.risk_score).toBe(80);
    }
  });

  it('skips Health Check fetch when onlySources excludes health_check_api', async () => {
    let toolingCalled = false;
    const connectionWithTooling: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async () => {
          toolingCalled = true;
          return { records: [], totalSize: 0, done: true };
        },
      },
    };

    await collectEvidence({
      connection: connectionWithTooling,
      subjectId: 'subj-1',
      soqlQueries: [],
      onlySources: ['soql'],
    });

    expect(toolingCalled).toBe(false);
  });

  it('runs Code Analyzer and includes the findings in the bundle when codeAnalyzer option is set', async () => {
    const okJsonOutput = JSON.stringify({
      version: '5.12.0',
      violations: [
        {
          engine: 'pmd',
          rule: 'ApexCSRF',
          severity: 1,
          tags: ['Recommended', 'Security', 'Apex'],
          locations: [{ file: '/abs/x.cls', startLine: 1 }],
          primaryLocationIndex: 0,
          message: 'm',
        },
      ],
    });

    const result = await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [],
      codeAnalyzer: {
        alias: 'client-prod',
        spawner: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        tmpdir: {
          create: async () => '/tmp/test',
          cleanup: async () => {},
          readFile: async () => okJsonOutput,
        },
      },
    });

    const codeEvidence = result.bundle.evidence.find((e) => e.source === 'code_analyzer');
    expect(codeEvidence).toBeDefined();
    if (codeEvidence?.source === 'code_analyzer') {
      expect(codeEvidence.engine).toBe('pmd');
      expect(codeEvidence.findings).toHaveLength(1);
    }
  });

  it('skips Code Analyzer when codeAnalyzer option is omitted (even if onlySources includes code_analyzer)', async () => {
    const result = await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [],
      onlySources: ['code_analyzer'],
      // no codeAnalyzer option set
    });

    expect(result.bundle.evidence).toEqual([]);
    expect(result.codeAnalyzer).toBeUndefined();
  });

  it('triggers fetchLimits when onlySources includes limits_rest_api', async () => {
    const requestSpy = vi.fn().mockResolvedValue({
      DailyApiRequests: { Max: 50000, Remaining: 49500 },
    });
    const conn: ConnectionLike = {
      query: vi.fn().mockResolvedValue({ records: [], totalSize: 0, done: true }),
      request: requestSpy,
    };
    const result = await collectEvidence({
      connection: conn,
      subjectId: 'test',
      soqlQueries: [],
      onlySources: ['limits_rest_api'],
    });
    expect(requestSpy).toHaveBeenCalledWith('/services/data/v60.0/limits');
    expect(result.limits?.kind).toBe('ok');
    expect(result.bundle.evidence.some((e) => e.source === 'limits_rest_api')).toBe(true);
  });
});
