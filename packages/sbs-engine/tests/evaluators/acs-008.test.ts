// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-008';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-008',
  questionId: 'Q-ACS-008',
  evaluate,
});

describe('SBS-ACS-008 evaluator (multi-query SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-008');
  const INVENTORY = 'acs-007-nhi-inventory';
  const PERMSET = 'acs-008-nhi-broad-permset-grants';

  it('returns pass+high when no NHI rows are present at all', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: INVENTORY, rows: [] },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No active non-human identity carries any of the 5');
  });

  it('returns pass+high when NHI candidates exist but none carry broad privileges', () => {
    // NHI candidates with all-false broad-perm flags on Profile and no
    // permset entries → pass.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005aa',
              Username: 'nhi-clean@example.com',
              Profile: {
                PermissionsViewAllData: false,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('flags NHI users with profile-level broad privileges as inconclusive+high', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005bb',
              Username: 'nhi-broad@example.com',
              Profile: {
                Name: 'Analytics Cloud Integration User',
                PermissionsViewAllData: true,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via Profile');
    expect(result.findings[0]).toContain('nhi-broad@example.com');
  });

  it('flags NHI users with permset-only broad privileges as inconclusive+high', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005cc',
              Username: 'nhi-permset@example.com',
              Profile: {
                Name: 'Standard NHI Profile',
                PermissionsViewAllData: false,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [
            {
              AssigneeId: '005cc',
              Assignee: { Username: 'nhi-permset@example.com' },
              PermissionSet: {
                Label: 'Tooling Bypass',
                PermissionsModifyAllData: true,
                PermissionsViewAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via Permission Set');
    expect(result.findings[0]).not.toContain('via Profile');
  });

  it('counts users with both profile + permset grants under "via both"', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005dd',
              Username: 'nhi-double@example.com',
              Profile: {
                PermissionsViewAllData: true,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [
            {
              AssigneeId: '005dd',
              Assignee: { Username: 'nhi-double@example.com' },
              PermissionSet: {
                Label: 'Author Apex',
                PermissionsAuthorApex: true,
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via both Profile and Permission Set');
    // Profile-only and Permset-only buckets should NOT appear.
    expect(result.findings[0]).not.toContain('1 via Profile,');
    expect(result.findings[0]).not.toContain('1 via Permission Set,');
  });

  it('combines all 3 buckets when present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005pp',
              Username: 'profile-only@example.com',
              Profile: { PermissionsViewAllData: true },
            },
            {
              Id: '005ss',
              Username: 'permset-only@example.com',
              Profile: { PermissionsViewAllData: false },
            },
            {
              Id: '005bb',
              Username: 'both@example.com',
              Profile: { PermissionsModifyAllData: true },
            },
            {
              Id: '005cc',
              Username: 'no-broad@example.com',
              Profile: {
                PermissionsViewAllData: false,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [
            {
              AssigneeId: '005ss',
              Assignee: { Username: 'permset-only@example.com' },
              PermissionSet: { Label: 'Manage Users', PermissionsManageUsers: true },
            },
            {
              AssigneeId: '005bb',
              Assignee: { Username: 'both@example.com' },
              PermissionSet: { Label: 'Author Apex', PermissionsAuthorApex: true },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('3 non-human identity');
    expect(result.findings[0]).toContain('1 via Profile');
    expect(result.findings[0]).toContain('1 via Permission Set');
    expect(result.findings[0]).toContain('1 via both Profile and Permission Set');
    // The "no-broad" user must NOT appear in the count.
    expect(result.findings[0]).not.toContain('no-broad@example.com');
  });

  it('unions per-user perms across multiple permset rows', () => {
    // Same assignee gets two permset rows (one with View All, one with
    // Modify All). Should count as ONE NHI with permset-level grants.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005ee',
              Username: 'multi-permset@example.com',
              Profile: {
                PermissionsViewAllData: false,
                PermissionsModifyAllData: false,
                PermissionsManageUsers: false,
                PermissionsAuthorApex: false,
                PermissionsCustomizeApplication: false,
              },
            },
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [
            {
              AssigneeId: '005ee',
              Assignee: { Username: 'multi-permset@example.com' },
              PermissionSet: { Label: 'Set X', PermissionsViewAllData: true },
            },
            {
              AssigneeId: '005ee',
              Assignee: { Username: 'multi-permset@example.com' },
              PermissionSet: { Label: 'Set Y', PermissionsModifyAllData: true },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via Permission Set');
  });

  it('caps username sample at 10 with +N more', () => {
    const inventoryRows = Array.from({ length: 12 }, (_, i) => ({
      Id: `005${i}`,
      Username: `nhi-${i}@example.com`,
      Profile: { PermissionsViewAllData: true },
    }));
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: INVENTORY, rows: inventoryRows },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.findings[0]).toContain('12 non-human identity');
    expect(result.findings[0]).toContain('nhi-0@example.com');
    expect(result.findings[0]).toContain('nhi-9@example.com');
    expect(result.findings[0]).not.toContain('nhi-10@example.com');
    expect(result.findings[0]).toContain('(+2 more)');
  });

  it('handles partial evidence (only inventory query present)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            {
              Id: '005aa',
              Username: 'inv-only@example.com',
              Profile: { PermissionsAuthorApex: true },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via Profile');
  });

  it('handles partial evidence (only permset query present)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [
            {
              AssigneeId: '005bb',
              Assignee: { Username: 'permset-only@example.com' },
              PermissionSet: { Label: 'Modify All', PermissionsModifyAllData: true },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('1 non-human identity');
    expect(result.findings[0]).toContain('1 via Permission Set');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-008',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: INVENTORY, rows: [] },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('falls back to questionnaire low-confidence when neither query is present', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: 'some-other-query', rows: [] },
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-008',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
