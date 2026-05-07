// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-006';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-006',
  questionId: 'Q-ACS-006',
  evaluate,
});

describe('SBS-ACS-006 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-006');
  const QUERY_ID = 'acs-006-use-any-api-client-via-permsets';

  it('returns pass+high when no active users are granted Use Any API Client via permset', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive+high when Use Any API Client assignments are inventoried', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              AssigneeId: '005xx',
              Assignee: { Name: 'Integration User', Username: 'integration@example.com' },
              PermissionSet: {
                Name: 'IntegrationTooling',
                Label: 'Integration Tooling',
                IsOwnedByProfile: false,
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('1 active user-permset assignment');
    expect(result.findings[0]).toContain('1 via Permission Set');
  });

  it('separates profile-derived from permset-derived assignments in the inconclusive finding', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            // 2 profile-derived rows (Salesforce models each Profile as a backing
            // PermissionSet with IsOwnedByProfile=true)
            {
              AssigneeId: '005aa',
              Assignee: { Name: 'Admin Alpha', Username: 'admin.a@example.com' },
              PermissionSet: {
                Name: 'Admin',
                Label: 'System Administrator',
                IsOwnedByProfile: true,
              },
            },
            {
              AssigneeId: '005bb',
              Assignee: { Name: 'Admin Beta', Username: 'admin.b@example.com' },
              PermissionSet: {
                Name: 'Admin',
                Label: 'System Administrator',
                IsOwnedByProfile: true,
              },
            },
            // 1 permset-derived row (explicit assignment via a non-profile-backed set)
            {
              AssigneeId: '005cc',
              Assignee: { Name: 'Integration Gamma', Username: 'int.g@example.com' },
              PermissionSet: {
                Name: 'IntegrationTooling',
                Label: 'Integration Tooling',
                IsOwnedByProfile: false,
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('3 active user-permset assignment');
    expect(result.findings[0]).toContain('2 via Profile (backing permission set)');
    expect(result.findings[0]).toContain('1 via Permission Set');
  });

  it('counts rows lacking IsOwnedByProfile under an explicit unknown bucket', () => {
    // Older bundles or partial-shape evidence: never silently drop the row.
    // The breakdown surfaces an explicit "unknown ownership" count so the
    // numbers sum to the original row total.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              AssigneeId: '005xx',
              Assignee: { Name: 'Legacy User', Username: 'legacy@example.com' },
              PermissionSet: { Name: 'Legacy', Label: 'Legacy Set' },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 active user-permset assignment');
    expect(result.findings[0]).toContain('1 of unknown ownership');
    // Should NOT report a misleading "0 via" something — buckets with 0
    // rows are omitted from the breakdown entirely.
    expect(result.findings[0]).not.toContain('0 via');
  });

  it('combines profile-derived, permset-derived, and unknown buckets when all 3 are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              AssigneeId: '005pp',
              Assignee: { Name: 'Profile User', Username: 'p@example.com' },
              PermissionSet: { Name: 'Admin', Label: 'Admin', IsOwnedByProfile: true },
            },
            {
              AssigneeId: '005ss',
              Assignee: { Name: 'Permset User', Username: 's@example.com' },
              PermissionSet: { Name: 'IntegrationTooling', Label: 'IT', IsOwnedByProfile: false },
            },
            {
              AssigneeId: '005uu',
              Assignee: { Name: 'Legacy User', Username: 'u@example.com' },
              PermissionSet: { Name: 'Legacy', Label: 'Legacy' },
            },
          ],
        },
      ],
    });
    expect(result.findings[0]).toContain('3 active user-permset assignment');
    expect(result.findings[0]).toContain('1 via Profile (backing permission set)');
    expect(result.findings[0]).toContain('1 via Permission Set');
    expect(result.findings[0]).toContain('1 of unknown ownership');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-006',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: QUERY_ID, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('falls back to questionnaire low-confidence when SOQL evidence has different query_id', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: 'some-other-query', rows: [] },
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-006',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
