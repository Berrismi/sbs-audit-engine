// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/int-004';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-INT-004',
  questionId: 'Q-INT-004',
  evaluate,
});

describe('SBS-INT-004 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-INT-004');
  const QUERY_ID = 'event-log-file-capability';

  it('returns inconclusive when ApiTotalUsage rows are absent (no rows at all)', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No `ApiTotalUsage` EventLogFile rows observed');
  });

  it('returns inconclusive when other event types exist but ApiTotalUsage is absent', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [{ EventType: 'Login', cnt: 50, earliest: '2026-04-01', latest: '2026-05-01' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('No `ApiTotalUsage`');
  });

  it('returns pass+high when ApiTotalUsage retention >= 30 days', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              EventType: 'ApiTotalUsage',
              cnt: 60,
              earliest: '2026-04-01',
              latest: '2026-05-01',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('Meets the 30-day audit threshold');
  });

  it('returns inconclusive when ApiTotalUsage retention < 30 days', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              EventType: 'ApiTotalUsage',
              cnt: 1,
              earliest: '2026-05-01',
              latest: '2026-05-01',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 day(s)');
    expect(result.findings[0]).toContain('below the 30-day audit threshold');
    expect(result.findings[0]).toContain('1-day free-tier baseline is COMPLIANT iff');
  });
});
