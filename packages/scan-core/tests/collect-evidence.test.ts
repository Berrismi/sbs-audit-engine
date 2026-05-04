// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
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

  it('plumbs onProgress through to the executor', async () => {
    const events: ProgressEvent[] = [];

    await collectEvidence({
      connection: okConnection,
      subjectId: 'subj-1',
      soqlQueries: [userQuery],
      onProgress: (e) => events.push(e),
    });

    expect(events.map((e) => e.type)).toEqual(['query_start', 'query_ok']);
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
});
