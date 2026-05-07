// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/mon-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-MON-002',
  questionId: 'Q-MON-002',
  evaluate,
});

describe('SBS-MON-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-MON-002');
  const QUERY_ID = 'event-log-file-capability';

  it('returns inconclusive when no EventLogFile rows present', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No EventLogFile rows present');
  });

  it('reports free-baseline retention when max span is 1 day', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { EventType: 'Login', cnt: 5, earliest: '2026-05-01', latest: '2026-05-01' },
            { EventType: 'ApiTotalUsage', cnt: 1, earliest: '2026-05-01', latest: '2026-05-01' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('Maximum observed retention 1 day(s)');
    expect(result.findings[0]).toContain('free baseline');
    expect(result.findings[0]).toContain('External export is REQUIRED');
  });

  it('reports add-on tier when max span >= 30 days', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { EventType: 'Login', cnt: 100, earliest: '2026-04-01', latest: '2026-05-01' },
            {
              EventType: 'ReportExport',
              cnt: 12,
              earliest: '2026-04-01',
              latest: '2026-05-01',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('Maximum observed retention');
    expect(result.findings[0]).toContain('day(s)');
    expect(result.findings[0]).toContain('Event Monitoring add-on');
  });

  it('reports intermediate band when max span is between 1 and 30 days', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [{ EventType: 'Login', cnt: 30, earliest: '2026-04-25', latest: '2026-05-01' }],
        },
      ],
    });
    expect(result.findings[0]).toContain('between the 1-day free baseline and the 30-day');
  });
});
