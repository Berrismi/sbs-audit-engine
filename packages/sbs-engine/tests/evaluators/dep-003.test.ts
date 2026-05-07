// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/dep-003';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DEP-003',
  questionId: 'Q-DEP-003',
  evaluate,
});

describe('SBS-DEP-003 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-DEP-003');
  const QUERY_ID = 'dep-setup-audit-trail-recent';

  function row(opts: { section: string; createdById: string }): Record<string, unknown> {
    return {
      Id: `0Ym${opts.createdById}-${opts.section}`,
      Action: 'someAction',
      Section: opts.section,
      CreatedById: opts.createdById,
      CreatedBy: { Username: `${opts.createdById}@example.com` },
      CreatedDate: '2026-04-01T12:00:00.000+0000',
    };
  }

  it('returns pass+high when no high-risk rows exist (low-risk activity only)', () => {
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
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No high-risk metadata changes');
  });

  it('returns pass+high when the SOQL returned 0 rows at all', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('returns inconclusive+high with a section breakdown when high-risk rows exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            row({ section: 'Apex Class', createdById: '005a' }),
            row({ section: 'Apex Class', createdById: '005b' }),
            row({ section: 'Apex Class', createdById: '005a' }),
            row({ section: 'Profile', createdById: '005c' }),
            row({ section: 'Custom Tabs', createdById: '005a' }), // low-risk, drops
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('4 high-risk metadata change(s)');
    expect(result.findings[0]).toContain('3 distinct user(s)');
    expect(result.findings[0]).toContain('Apex Class (3)');
    expect(result.findings[0]).toContain('Profile (1)');
    expect(result.findings[0]).not.toContain('Custom Tabs');
  });

  it('caps the section breakdown at 5 with +N more section(s) summary', () => {
    // 7 high-risk sections each with 1 row
    const sections = [
      'Apex Class',
      'Apex Trigger',
      'Apex Page',
      'Permission Sets',
      'Permission Set Group',
      'Profile',
      'Manage Users',
    ];
    const rows = sections.map((s) => row({ section: s, createdById: '005x' }));
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('7 high-risk metadata change(s)');
    expect(result.findings[0]).toContain('(+2 more section(s))');
  });

  it('surfaces the row-cap caveat when SOQL returned the cap (2000 rows)', () => {
    const rows = Array.from({ length: 2000 }, () =>
      row({ section: 'Apex Class', createdById: '005a' }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('capped at 2000 rows');
  });

  it('handles rows missing CreatedById defensively (excluded from user count)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            row({ section: 'Apex Class', createdById: '005a' }),
            // Missing CreatedById entirely.
            { Id: '0Ymzz', Action: 'x', Section: 'Apex Class' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 high-risk metadata change(s)');
    expect(result.findings[0]).toContain('1 distinct user(s)');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DEP-003',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: QUERY_ID, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
