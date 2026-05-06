// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/oauth-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-OAUTH-002',
  questionId: 'Q-OAUTH-002',
  evaluate,
});

describe('SBS-OAUTH-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-OAUTH-002');
  const QUERY_ID = 'oauth-002-connected-apps-without-admin-approval';

  it('returns pass+high when no Connected Apps allow self-service authorization', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive+high when self-service Connected Apps exist (questionnaire confirms intent)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { Id: '0H4xx1', Name: 'Custom App A' },
            { Id: '0H4xx2', Name: 'Custom App B' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('2 Connected App');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-OAUTH-002',
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
          question_id: 'Q-OAUTH-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
