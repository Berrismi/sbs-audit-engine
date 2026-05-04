// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/code-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

// Existing 4-case attestation contract — unchanged after the
// corroborating CA extension.
describeBooleanEvaluator({
  controlId: 'SBS-CODE-002',
  questionId: 'Q-CODE-002',
  evaluate,
});

// Phase 5 Block E.3: Code Analyzer evidence (corroborating) tests.
describe('SBS-CODE-002 evaluator (Code Analyzer evidence path)', () => {
  const control = makeControlFixture('SBS-CODE-002');

  it('combines questionnaire pass with CA "0 findings" observation at HIGH confidence when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CODE-002',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'code_analyzer', engine: 'pmd', findings: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'code_analyzer']);
    expect(result.findings.some((f) => f.includes('0 findings'))).toBe(true);
  });

  it('reports total + high/critical count when CA findings are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CODE-002',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'code_analyzer',
          engine: 'pmd',
          findings: [
            { rule: 'r1', severity: 'Critical', file: '/a.cls', line: 1, message: 'm' },
            { rule: 'r2', severity: 'High', file: '/b.cls', line: 2, message: 'm' },
            { rule: 'r3', severity: 'Moderate', file: '/c.cls', line: 3, message: 'm' },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'code_analyzer']);
    expect(result.findings.some((f) => f.includes('3 finding'))).toBe(true);
    expect(result.findings.some((f) => f.includes('2 of severity High or Critical'))).toBe(true);
  });

  it('returns inconclusive+high with CA observations when only CA evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'code_analyzer',
          engine: 'pmd',
          findings: [{ rule: 'r1', severity: 'High', file: '/a.cls', line: 1, message: 'm' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['code_analyzer']);
    expect(result.findings.some((f) => f.includes('engine: pmd'))).toBe(true);
  });
});
