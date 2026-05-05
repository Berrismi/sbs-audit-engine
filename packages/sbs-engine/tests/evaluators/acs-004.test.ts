// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004 evaluator tests.
//
// F.4 Bug C: SOQL evidence is split across two queries to avoid the SOQL
// 2-semi-join cap. The evaluator merges:
//   - acs-004-super-admin-via-permsets — one row per (assignee, permission_set)
//     pair where the set carries any of the 3 super-admin perms. Multiple
//     rows per assignee are unioned to determine if all 3 perms are covered.
//   - acs-004-super-admin-via-profile — one row per active user whose Profile
//     directly grants all 3 perms (System Administrator + clones).
//
// Either path can be present alone, both, or neither. Users that appear in
// both paths are deduped. When neither path is present (e.g. both queries
// failed or were skipped), the evaluator falls back to questionnaire
// attestation with low confidence.

import { describe, expect, it } from 'vitest';
import { evaluate as evaluateAcs004 } from '../../src/evaluators/acs-004';
import type { Evidence, EvaluatorInput } from '../../src/types';
import { makeControlFixture } from '../fixtures/control';

const QUESTION_ID = 'Q-ACS-004';
const PERMSET_QUERY_ID = 'acs-004-super-admin-via-permsets';
const PROFILE_QUERY_ID = 'acs-004-super-admin-via-profile';

const inputWith = (evidence: Evidence[]): EvaluatorInput => ({
  control: makeControlFixture('SBS-ACS-004'),
  evidence,
});

describe('SBS-ACS-004 evaluator', () => {
  describe('SOQL evidence (high confidence)', () => {
    it('pass when both paths return zero rows', () => {
      const result = evaluateAcs004(
        inputWith([
          { source: 'soql', query: '...', query_id: PERMSET_QUERY_ID, rows: [] },
          { source: 'soql', query: '...', query_id: PROFILE_QUERY_ID, rows: [] },
        ]),
      );
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
      expect(result.evidence_used).toEqual(['soql']);
      expect(result.findings[0]).toMatch(/No active users hold all of View All Data/);
    });

    it('pass when only the permset path is present and returns no qualifying users', () => {
      const result = evaluateAcs004(
        inputWith([
          // PermSet rows but none with the full perm set per assignee.
          {
            source: 'soql',
            query: '...',
            query_id: PERMSET_QUERY_ID,
            rows: [
              {
                AssigneeId: 'u1',
                Assignee: { Username: 'partial@example.com', Profile: { Name: 'Standard' } },
                PermissionSet: {
                  PermissionsViewAllData: true,
                  PermissionsModifyAllData: false,
                  PermissionsManageUsers: false,
                },
              },
            ],
          },
        ]),
      );
      // Profile path absent — only one path supplied, but it covered the org.
      // Evaluator surfaces "no qualifying users" because no user had all 3.
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
      expect(result.evidence_used).toEqual(['soql']);
    });

    it('inconclusive when permset rows union to all 3 perms for one user (questionnaire adjudicates)', () => {
      const rows = [
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'admin1@example.com', Profile: { Name: 'Standard' } },
          PermissionSet: {
            PermissionsViewAllData: true,
            PermissionsModifyAllData: false,
            PermissionsManageUsers: false,
          },
        },
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'admin1@example.com', Profile: { Name: 'Standard' } },
          PermissionSet: {
            PermissionsViewAllData: false,
            PermissionsModifyAllData: true,
            PermissionsManageUsers: true,
          },
        },
      ];
      const result = evaluateAcs004(
        inputWith([
          { source: 'soql', query: '...', query_id: PERMSET_QUERY_ID, rows },
          { source: 'soql', query: '...', query_id: PROFILE_QUERY_ID, rows: [] },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('high');
      expect(result.findings[0]).toContain('1 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('admin1@example.com');
    });

    it('captures cross-permset composition (3 separate sets each granting one perm = 1 user)', () => {
      const rows = [
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'crossperm@example.com', Profile: { Name: 'Std' } },
          PermissionSet: {
            PermissionsViewAllData: true,
            PermissionsModifyAllData: false,
            PermissionsManageUsers: false,
          },
        },
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'crossperm@example.com', Profile: { Name: 'Std' } },
          PermissionSet: {
            PermissionsViewAllData: false,
            PermissionsModifyAllData: true,
            PermissionsManageUsers: false,
          },
        },
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'crossperm@example.com', Profile: { Name: 'Std' } },
          PermissionSet: {
            PermissionsViewAllData: false,
            PermissionsModifyAllData: false,
            PermissionsManageUsers: true,
          },
        },
      ];
      const result = evaluateAcs004(
        inputWith([{ source: 'soql', query: '...', query_id: PERMSET_QUERY_ID, rows }]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.findings[0]).toContain('1 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('crossperm@example.com');
    });

    it('excludes users whose unioned permset perms still do not cover all 3', () => {
      const rows = [
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'partial@example.com', Profile: { Name: 'Std' } },
          PermissionSet: {
            PermissionsViewAllData: true,
            PermissionsModifyAllData: false,
            PermissionsManageUsers: false,
          },
        },
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'partial@example.com', Profile: { Name: 'Std' } },
          PermissionSet: {
            PermissionsViewAllData: false,
            PermissionsModifyAllData: true,
            PermissionsManageUsers: false,
          },
        },
        // No ManageUsers perm anywhere for u1 — should be excluded.
      ];
      const result = evaluateAcs004(
        inputWith([{ source: 'soql', query: '...', query_id: PERMSET_QUERY_ID, rows }]),
      );
      expect(result.status).toBe('pass');
    });

    it('inconclusive when only the profile path is present with N rows', () => {
      const rows = [
        { Id: 'u1', Username: 'sysadmin@example.com', Profile: { Name: 'System Administrator' } },
      ];
      const result = evaluateAcs004(
        inputWith([{ source: 'soql', query: '...', query_id: PROFILE_QUERY_ID, rows }]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('high');
      expect(result.findings[0]).toContain('1 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('sysadmin@example.com');
    });

    it('dedupes a user that appears in both permset and profile paths', () => {
      const permsetRows = [
        {
          AssigneeId: 'u1',
          Assignee: { Username: 'mike@example.com', Profile: { Name: 'System Administrator' } },
          PermissionSet: {
            PermissionsViewAllData: true,
            PermissionsModifyAllData: true,
            PermissionsManageUsers: true,
          },
        },
      ];
      const profileRows = [
        { Id: 'u1', Username: 'mike@example.com', Profile: { Name: 'System Administrator' } },
      ];
      const result = evaluateAcs004(
        inputWith([
          { source: 'soql', query: '...', query_id: PERMSET_QUERY_ID, rows: permsetRows },
          { source: 'soql', query: '...', query_id: PROFILE_QUERY_ID, rows: profileRows },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.findings[0]).toContain('1 active super-admin-equivalent user(s)');
    });

    it('caps the sample at 10 usernames and reports remainder', () => {
      const profileRows = Array.from({ length: 15 }, (_, i) => ({
        Id: `u${i}`,
        Username: `admin${i}@example.com`,
        Profile: { Name: 'System Administrator' },
      }));
      const result = evaluateAcs004(
        inputWith([
          { source: 'soql', query: '...', query_id: PROFILE_QUERY_ID, rows: profileRows },
        ]),
      );
      expect(result.findings[0]).toContain('15 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('+5 more');
    });

    it('does NOT reference JustificationDoc__c in any finding (authoring-rule guard)', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: '...',
            query_id: PROFILE_QUERY_ID,
            rows: [{ Id: 'u1', Username: 'admin1@example.com', Profile: { Name: 'Sysadmin' } }],
          },
        ]),
      );
      expect(JSON.stringify(result)).not.toContain('JustificationDoc');
    });
  });

  describe('questionnaire fallback (low confidence, when neither SOQL path is present)', () => {
    it('returns pass when respondent attests Yes', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'boolean', value: true },
          },
        ]),
      );
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('low');
      expect(result.evidence_used).toEqual(['questionnaire']);
    });

    it('returns fail when respondent attests No', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'boolean', value: false },
          },
        ]),
      );
      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('low');
    });

    it('returns inconclusive when respondent answers idk', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'idk' },
          },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
    });
  });

  it('returns inconclusive when no evidence at all', () => {
    const result = evaluateAcs004(inputWith([]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });
});
