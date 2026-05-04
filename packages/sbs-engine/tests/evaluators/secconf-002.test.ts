// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/secconf-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-SECCONF-002',
  questionId: 'Q-SECCONF-002',
  evaluate,
});

describe('SBS-SECCONF-002 evaluator (Health Check evidence path)', () => {
  const control = makeControlFixture('SBS-SECCONF-002');

  it('observes "0 high-risk currently flagged" when HC list is empty', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-002',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'health_check_api', risk_score: 95, high_risk: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.findings.some((f) => f.includes('0 high-risk'))).toBe(true);
  });

  it('observes the count when HC list is non-empty', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-002',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'health_check_api',
          risk_score: 40,
          high_risk: [
            { name: 'A', value: '1', recommended: '2' },
            { name: 'B', value: '3', recommended: '4' },
            { name: 'C', value: '5', recommended: '6' },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'health_check_api']);
    expect(result.findings.some((f) => f.includes('3 high-risk'))).toBe(true);
  });
});
