// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/dep-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DEP-001',
  questionId: 'Q-DEP-001',
  evaluate,
});

describe('SBS-DEP-001 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-DEP-001');
  const QUERY_ID = 'dep-setup-audit-trail-recent';

  // ---- helpers ----------------------------------------------------------
  function row(opts: {
    section: string;
    createdById: string;
    username?: string;
  }): Record<string, unknown> {
    return {
      Id: `0Ym${opts.createdById}-${opts.section}`,
      Action: 'someAction',
      Section: opts.section,
      CreatedById: opts.createdById,
      CreatedBy: { Username: opts.username ?? `${opts.createdById}@example.com` },
      CreatedDate: '2026-04-01T12:00:00.000+0000',
    };
  }

  it('returns inconclusive+high when no high-risk rows exist in the window', () => {
    // Rows present but all in low-risk Sections — should NOT count as
    // deployment activity.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            row({ section: 'Custom Tabs', createdById: '005a' }),
            row({ section: 'Lightning Components', createdById: '005a' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No high-risk metadata changes');
  });

  it('returns inconclusive+high when the SOQL returned 0 rows at all', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No high-risk metadata changes');
  });

  it('returns pass+high when exactly one user touched all high-risk rows', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            row({ section: 'Apex Class', createdById: '005deploy', username: 'deploy@x.com' }),
            row({ section: 'Permission Sets', createdById: '005deploy', username: 'deploy@x.com' }),
            row({ section: 'Custom Tabs', createdById: '005other' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('All 2 high-risk metadata change(s)');
    expect(result.findings[0]).toContain('deploy@x.com');
  });

  it('returns inconclusive+high when 2+ distinct users touched high-risk rows', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            row({ section: 'Apex Class', createdById: '005a', username: 'admin.a@example.com' }),
            row({ section: 'Apex Class', createdById: '005a', username: 'admin.a@example.com' }),
            row({ section: 'Profile', createdById: '005b', username: 'admin.b@example.com' }),
            row({
              section: 'Connected Apps',
              createdById: '005c',
              username: 'admin.c@example.com',
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('3 distinct user(s) performed 4 high-risk');
    // admin.a sorted first (2 changes) then admin.b/admin.c by name asc.
    expect(result.findings[0]).toContain('admin.a@example.com (2)');
    expect(result.findings[0]).toContain('admin.b@example.com (1)');
  });

  it('caps the user breakdown at 5 users with +N more', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({
        section: 'Apex Class',
        createdById: `005u${i}`,
        username: `user-${i}@example.com`,
      }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('8 distinct user(s) performed 8 high-risk');
    expect(result.findings[0]).toContain('user-0@example.com (1)');
    expect(result.findings[0]).toContain('user-4@example.com (1)');
    expect(result.findings[0]).not.toContain('user-5@example.com (1)');
    expect(result.findings[0]).toContain('(+3 more)');
  });

  it('surfaces a row-cap caveat when the SOQL returned exactly the cap (2000)', () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      row({
        section: i % 2 === 0 ? 'Apex Class' : 'Custom Tabs',
        createdById: `005u${i % 3}`,
      }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('capped at 2000 rows');
  });

  it('does not surface the cap caveat when the result is below the cap', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [row({ section: 'Apex Class', createdById: '005a' })],
        },
      ],
    });
    expect(result.findings[0]).not.toContain('capped at 2000');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DEP-001',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: QUERY_ID, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
