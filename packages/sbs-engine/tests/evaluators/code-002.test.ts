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
    expect(result.findings.some((f) => f.includes('0 security-tagged findings'))).toBe(true);
  });

  it('reports total + high/critical count + top rule names when CA findings are present', () => {
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
            {
              rule: 'ApexCRUDViolation',
              severity: 'Critical',
              file: '/a.cls',
              line: 1,
              message: 'm',
            },
            { rule: 'ApexCRUDViolation', severity: 'High', file: '/b.cls', line: 2, message: 'm' },
            { rule: 'ApexFlsViolation', severity: 'High', file: '/c.cls', line: 3, message: 'm' },
            {
              rule: 'ApexSOQLInjection',
              severity: 'Moderate',
              file: '/d.cls',
              line: 4,
              message: 'm',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'code_analyzer']);
    expect(result.findings.some((f) => f.includes('4 finding'))).toBe(true);
    expect(result.findings.some((f) => f.includes('3 of severity High or Critical'))).toBe(true);
    // Top-rule narrative should name the most-frequent rules with counts.
    expect(result.findings.some((f) => f.includes('ApexCRUDViolation (2)'))).toBe(true);
    expect(result.findings.some((f) => f.includes('ApexFlsViolation (1)'))).toBe(true);
  });

  it('caps the top-rule list at 3 entries with alphabetical tie-break', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'code_analyzer',
          engine: 'pmd',
          findings: [
            // 5 distinct rules, each at count 1 — alphabetical tie-break
            { rule: 'BetaRule', severity: 'High', file: '/a.cls', line: 1, message: 'm' },
            { rule: 'AlphaRule', severity: 'High', file: '/b.cls', line: 1, message: 'm' },
            { rule: 'EpsilonRule', severity: 'High', file: '/c.cls', line: 1, message: 'm' },
            { rule: 'DeltaRule', severity: 'High', file: '/d.cls', line: 1, message: 'm' },
            { rule: 'GammaRule', severity: 'High', file: '/e.cls', line: 1, message: 'm' },
          ],
        },
      ],
    });
    const finding = result.findings[0]!;
    // Top-3 alphabetically (all tied at count 1): Alpha, Beta, Delta
    expect(finding).toContain('AlphaRule (1)');
    expect(finding).toContain('BetaRule (1)');
    expect(finding).toContain('DeltaRule (1)');
    // 4th and 5th must NOT appear in the top-3 sample.
    expect(finding).not.toContain('EpsilonRule');
    expect(finding).not.toContain('GammaRule');
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
