// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/mon-005';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

// Existing 4-case attestation contract — questionnaire-only path stays
// unchanged after the corroborating extension.
describeBooleanEvaluator({
  controlId: 'SBS-MON-005',
  questionId: 'Q-MON-005',
  evaluate,
});

// Tier 1 PR 3 (alpha.13): Limits REST API evidence (corroborating) tests.
describe('SBS-MON-005 evaluator (Limits REST API evidence path)', () => {
  const control = makeControlFixture('SBS-MON-005');

  it('combines questionnaire pass with Limits observations at HIGH confidence when both present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-MON-005',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'limits_rest_api',
          api_version: '60.0',
          limits: { DailyApiRequests: { max: 100000, remaining: 95000 } },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'limits_rest_api']);
    // Pass finding from attestationEvaluator + observation from corroborating helper.
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.findings.some((f) => /5%|5\.0%|5,000/.test(f))).toBe(true);
  });

  it('returns inconclusive+high with Limits observations when only Limits evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'limits_rest_api',
          api_version: '60.0',
          limits: { DailyApiRequests: { max: 100000, remaining: 15000 } },
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['limits_rest_api']);
    // Utilization of 85,000 / 100,000 = 85% — should appear in findings.
    expect(result.findings.some((f) => f.includes('85') || f.includes('85,000'))).toBe(true);
  });
});
