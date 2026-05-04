// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { assembleEvidenceBundle } from '../src/assemble';
import type { CodeAnalyzerExecution } from '../src/code-analyzer/runner';
import type { HealthCheckResult } from '../src/health-check/client';
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

  it('appends a health_check_api Evidence variant when given an ok HealthCheckResult', () => {
    const healthCheck: HealthCheckResult = {
      kind: 'ok',
      riskScore: 75,
      highRiskSettings: [
        { name: 'Session Settings', setting: 'timeout', orgValue: '8h', recommended: '15m' },
      ],
    };

    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [],
      healthCheck,
    });

    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({
      source: 'health_check_api',
      risk_score: 75,
    });
  });

  it('omits health_check_api Evidence when HealthCheckResult is unsupported (no tooling namespace)', () => {
    const healthCheck: HealthCheckResult = {
      kind: 'unsupported',
      reason: 'no_tooling_namespace',
    };

    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [],
      healthCheck,
    });

    expect(bundle.evidence).toHaveLength(0);
  });

  it('omits health_check_api Evidence when HealthCheckResult is failed', () => {
    const healthCheck: HealthCheckResult = {
      kind: 'failed',
      error: { message: 'INSUFFICIENT_ACCESS' },
    };

    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [],
      healthCheck,
    });

    expect(bundle.evidence).toHaveLength(0);
  });

  it('combines SOQL Evidence + health_check_api Evidence in one bundle', () => {
    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [{ kind: 'ok', query: userQuery, rows: [{ Id: 'u1' }] }],
      healthCheck: { kind: 'ok', riskScore: 90, highRiskSettings: [] },
    });

    expect(bundle.evidence).toHaveLength(2);
    expect(bundle.evidence.map((e) => e.source)).toEqual(['soql', 'health_check_api']);
  });

  it('appends a code_analyzer Evidence variant when given an ok CodeAnalyzerExecution', () => {
    const codeAnalyzer: CodeAnalyzerExecution = {
      kind: 'ok',
      engine: 'pmd',
      findings: [{ rule: 'ApexCSRF', severity: 'Critical', file: '/a.cls', line: 1, message: 'm' }],
    };

    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [],
      codeAnalyzer,
    });

    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({
      source: 'code_analyzer',
      engine: 'pmd',
      findings: codeAnalyzer.findings,
    });
  });

  it('omits code_analyzer Evidence when CodeAnalyzerExecution is failed', () => {
    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [],
      codeAnalyzer: { kind: 'failed', phase: 'retrieve', error: { message: 'org not authed' } },
    });

    expect(bundle.evidence).toHaveLength(0);
  });

  it('combines all three sources (SOQL + health_check + code_analyzer) in one bundle', () => {
    const bundle = assembleEvidenceBundle({
      subjectId: 's',
      queryResults: [{ kind: 'ok', query: userQuery, rows: [] }],
      healthCheck: { kind: 'ok', riskScore: 80, highRiskSettings: [] },
      codeAnalyzer: { kind: 'ok', engine: 'pmd', findings: [] },
    });

    expect(bundle.evidence).toHaveLength(3);
    expect(bundle.evidence.map((e) => e.source)).toEqual([
      'soql',
      'health_check_api',
      'code_analyzer',
    ]);
  });
});
