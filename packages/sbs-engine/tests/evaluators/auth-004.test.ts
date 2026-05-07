// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/auth-004';
import { describeBooleanEvaluator } from './_shared';
import { makeControlFixture } from '../fixtures/control';

describeBooleanEvaluator({
  controlId: 'SBS-AUTH-004',
  questionId: 'Q-AUTH-004',
  evaluate,
});

describe('SBS-AUTH-004 risk-level override (Block A)', () => {
  it('loads with risk_level=Critical and weight=5 from the override file', () => {
    const control = makeControlFixture('SBS-AUTH-004');
    expect(control.risk_level).toBe('Critical');
    expect(control.hellomavens_enrichments.weight).toBe(5);
  });
});

describe('SBS-AUTH-004 evaluator (multi-query SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-AUTH-004');
  const INVENTORY = 'auth-004-external-users-mfa';
  const PERMSET = 'auth-004-external-users-mfa-via-permsets';

  function externalUser(opts: {
    id: string;
    username: string;
    userType?: string;
    profileForcesMfa?: boolean;
    profileName?: string;
  }): Record<string, unknown> {
    return {
      Id: opts.id,
      Username: opts.username,
      Name: opts.username,
      UserType: opts.userType ?? 'CustomerSuccess',
      Profile: {
        Name: opts.profileName ?? 'Customer Community Plus',
        PermissionsForceTwoFactor: opts.profileForcesMfa ?? false,
      },
    };
  }

  function permsetGrant(opts: { assigneeId: string; username: string }): Record<string, unknown> {
    return {
      AssigneeId: opts.assigneeId,
      Assignee: { Username: opts.username },
      PermissionSet: { Label: 'Force MFA Customers' },
    };
  }

  it('returns inconclusive when no external users are found', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: INVENTORY, rows: [] },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No active external users');
  });

  it('returns pass+high when every external user has MFA enforced via Profile', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            externalUser({ id: '005a', username: 'cust.a@example.com', profileForcesMfa: true }),
            externalUser({ id: '005b', username: 'cust.b@example.com', profileForcesMfa: true }),
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('All 2 active external user(s) have MFA');
  });

  it('returns pass+high when MFA is enforced via permset for a user whose Profile lacks it', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            externalUser({ id: '005c', username: 'cust.c@example.com', profileForcesMfa: false }),
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [permsetGrant({ assigneeId: '005c', username: 'cust.c@example.com' })],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('flags users with no MFA enforcement via either path as inconclusive+high', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            externalUser({
              id: '005x',
              username: 'no.mfa@example.com',
              profileForcesMfa: false,
              profileName: 'Customer Community',
            }),
            externalUser({ id: '005y', username: 'has.mfa@example.com', profileForcesMfa: true }),
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('1 of 2 active external user(s) do NOT have MFA');
    expect(result.findings[0]).toContain('no.mfa@example.com, profile=Customer Community');
    expect(result.findings[0]).not.toContain('has.mfa@example.com');
  });

  it('caps the missing-MFA sample at 5 with +N more', () => {
    const inventoryRows = Array.from({ length: 8 }, (_, i) =>
      externalUser({ id: `005${i}`, username: `cust-${i}@example.com`, profileForcesMfa: false }),
    );
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: INVENTORY, rows: inventoryRows },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.findings[0]).toContain('8 of 8 active external user(s)');
    expect(result.findings[0]).toContain('cust-0@example.com');
    expect(result.findings[0]).toContain('cust-4@example.com');
    expect(result.findings[0]).not.toContain('cust-5@example.com');
    expect(result.findings[0]).toContain('(+3 more user(s))');
  });

  it('drops permset rows that do not match an inventory user', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            externalUser({ id: '005a', username: 'cust.a@example.com', profileForcesMfa: false }),
          ],
        },
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          // Permset row for a user NOT in the inventory — should be ignored,
          // not crash.
          rows: [permsetGrant({ assigneeId: '005zz', username: 'orphan@example.com' })],
        },
      ],
    });
    // 005a still has no MFA (Profile false, no matching permset) → flagged.
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 of 1 active external user');
    expect(result.findings[0]).not.toContain('orphan@example.com');
  });

  it('handles partial-shape inventory rows defensively (missing Profile, missing Username)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            // Missing Profile entirely
            { Id: '005m1', Username: 'no.profile@example.com', UserType: 'CustomerSuccess' },
            // Missing Username
            {
              Id: '005m2',
              UserType: 'CustomerSuccess',
              Profile: { PermissionsForceTwoFactor: false },
            },
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 of 2');
  });

  it('handles partial evidence (only inventory query present)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [externalUser({ id: '005a', username: 'a@example.com', profileForcesMfa: true })],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('handles partial evidence (only permset query present, no inventory)', () => {
    // Without an inventory entry to match against, permset rows are
    // dropped → no users → inconclusive.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: PERMSET,
          rows: [permsetGrant({ assigneeId: '005a', username: 'a@example.com' })],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('No active external users');
  });

  it('falls back to questionnaire when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-004',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-004',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: INVENTORY,
          rows: [
            externalUser({ id: '005a', username: 'cust@example.com', profileForcesMfa: false }),
          ],
        },
        { source: 'soql', query: '...', query_id: PERMSET, rows: [] },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
