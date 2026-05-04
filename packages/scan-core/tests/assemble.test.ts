// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { assembleEvidenceBundle } from '../src/assemble';
import type { QueryResult, SoqlQueryDef } from '../src/types';

const userQuery: SoqlQueryDef = {
  id: 'q-users',
  controlIds: ['SBS-ACS-001'],
  soql: 'SELECT Id FROM User',
  label: 'List users',
};

const profileQuery: SoqlQueryDef = {
  id: 'q-profiles',
  controlIds: ['SBS-ACS-002'],
  soql: 'SELECT Id FROM Profile',
  label: 'List profiles',
};

describe('assembleEvidenceBundle', () => {
  it('builds an EvidenceBundle with subject_id + a parseable ISO collected_at', () => {
    const bundle = assembleEvidenceBundle({
      subjectId: 'subj-123',
      queryResults: [],
    });

    expect(bundle.subject_id).toBe('subj-123');
    expect(() => new Date(bundle.collected_at).toISOString()).not.toThrow();
    expect(bundle.evidence).toEqual([]);
  });

  it('maps ok QueryResults to soql-source Evidence entries with the right query + rows', () => {
    const queryResults: QueryResult[] = [
      { kind: 'ok', query: userQuery, rows: [{ Id: 'u1' }, { Id: 'u2' }] },
    ];

    const bundle = assembleEvidenceBundle({ subjectId: 's', queryResults });

    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({
      source: 'soql',
      query: 'SELECT Id FROM User',
      rows: [{ Id: 'u1' }, { Id: 'u2' }],
    });
  });

  it('omits failed QueryResults from the evidence list', () => {
    const queryResults: QueryResult[] = [
      { kind: 'ok', query: userQuery, rows: [{ Id: 'u1' }] },
      { kind: 'failed', query: profileQuery, error: { message: 'INVALID_TYPE' } },
    ];

    const bundle = assembleEvidenceBundle({ subjectId: 's', queryResults });

    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({ query: userQuery.soql });
  });

  it('omits skipped QueryResults from the evidence list', () => {
    const queryResults: QueryResult[] = [
      { kind: 'ok', query: userQuery, rows: [] },
      { kind: 'skipped', query: profileQuery, reason: 'applies_when_false' },
    ];

    const bundle = assembleEvidenceBundle({ subjectId: 's', queryResults });

    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({ query: userQuery.soql });
  });

  it('preserves order of ok results in the evidence list', () => {
    const queryResults: QueryResult[] = [
      { kind: 'ok', query: userQuery, rows: [{ Id: 'u1' }] },
      { kind: 'failed', query: profileQuery, error: { message: 'fail' } },
      { kind: 'ok', query: profileQuery, rows: [{ Id: 'p1' }] },
    ];

    const bundle = assembleEvidenceBundle({ subjectId: 's', queryResults });

    expect(bundle.evidence).toHaveLength(2);
    expect(bundle.evidence[0]).toMatchObject({ query: userQuery.soql });
    expect(bundle.evidence[1]).toMatchObject({ query: profileQuery.soql });
  });
});
