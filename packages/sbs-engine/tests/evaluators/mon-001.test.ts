// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/mon-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-MON-001',
  questionId: 'Q-MON-001',
  evaluate,
});

describe('SBS-MON-001 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-MON-001');
  const QUERY_ID = 'event-log-file-capability';

  it('returns inconclusive+high with no-activity message when SOQL returned 0 rows', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No EventLogFile rows present');
  });

  it('flags free-baseline when only Login/Logout/ApiTotalUsage are observed', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { EventType: 'Login', cnt: 50, earliest: '2026-04-30', latest: '2026-05-01' },
            { EventType: 'ApiTotalUsage', cnt: 10, earliest: '2026-04-30', latest: '2026-05-01' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('all from the free baseline');
    expect(result.findings[0]).toContain('Login');
    expect(result.findings[0]).toContain('ApiTotalUsage');
  });

  it('confirms add-on tier when non-baseline event types are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { EventType: 'Login', cnt: 100, earliest: '2026-04-01', latest: '2026-05-01' },
            { EventType: 'ReportExport', cnt: 12, earliest: '2026-04-01', latest: '2026-05-01' },
            {
              EventType: 'LightningInteraction',
              cnt: 4500,
              earliest: '2026-04-01',
              latest: '2026-05-01',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('add-on event types present');
    expect(result.findings[0]).toContain('LightningInteraction');
  });

  it('falls back to questionnaire when no SOQL evidence provided', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-MON-001',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
