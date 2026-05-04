// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/secconf-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

// Existing 4-case attestation contract — questionnaire-only path stays
// unchanged after the corroborating extension.
describeBooleanEvaluator({
  controlId: 'SBS-SECCONF-001',
  questionId: 'Q-SECCONF-001',
  evaluate,
});

// Phase 5 Block E.2: Health Check evidence (corroborating) tests.
describe('SBS-SECCONF-001 evaluator (Health Check evidence path)', () => {
  const control = makeControlFixture('SBS-SECCONF-001');

  it('combines questionnaire pass with HC observations at HIGH confidence when both present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-001',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'health_check_api', risk_score: 85, high_risk: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'health_check_api']);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.findings.some((f) => f.includes('risk score 85'))).toBe(true);
  });

  it('returns inconclusive+high with HC observations when only HC is present (no questionnaire)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'health_check_api',
          risk_score: 50,
          high_risk: [{ name: 'Session', value: '8h', recommended: '15m' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['health_check_api']);
    expect(result.findings.some((f) => f.includes('1 high-risk setting'))).toBe(true);
  });
});
