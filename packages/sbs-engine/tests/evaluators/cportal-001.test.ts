// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/cportal-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-CPORTAL-001',
  questionId: 'Q-CPORTAL-001',
  evaluate,
});

describe('SBS-CPORTAL-001 evaluator (Code Analyzer corroboration, alpha.39)', () => {
  const control = makeControlFixture('SBS-CPORTAL-001');

  it('observes 0 IDOR-shaped findings when CA returns nothing in the IDOR rule set', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-001',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'code_analyzer',
          engine: 'pmd',
          findings: [
            // findings present, but none in the IDOR-rule set we filter to
            { rule: 'ApexDoc', severity: 'Info', file: '/a.cls', line: 1, message: 'm' },
            {
              rule: 'NoMixedIndentation',
              severity: 'Info',
              file: '/a.cls',
              line: 1,
              message: 'm',
            },
          ],
        },
      ],
    });

    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toContain('code_analyzer');
    expect(result.findings.some((f) => f.includes('0 IDOR-shaped findings'))).toBe(true);
  });

  it('reports IDOR-shaped findings with rule-name + count breakdown when CA returns matches', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-001',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'code_analyzer',
          engine: 'sfge',
          findings: [
            { rule: 'ApexCRUDViolation', severity: 'High', file: '/a.cls', line: 1, message: 'm' },
            { rule: 'ApexCRUDViolation', severity: 'High', file: '/a.cls', line: 5, message: 'm' },
            { rule: 'ApexFlsViolation', severity: 'High', file: '/b.cls', line: 1, message: 'm' },
            // a non-IDOR rule that should be filtered out
            { rule: 'ApexDoc', severity: 'Info', file: '/c.cls', line: 1, message: 'm' },
          ],
        },
      ],
    });

    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toContain('code_analyzer');
    // 3 IDOR findings, 2 unique files (a.cls + b.cls)
    expect(result.findings.some((f) => f.includes('3 IDOR-shaped finding'))).toBe(true);
    expect(result.findings.some((f) => f.includes('2 Apex file'))).toBe(true);
    // Top rules with counts, alphabetical tie-break
    expect(result.findings.some((f) => f.includes('ApexCRUDViolation (2)'))).toBe(true);
    expect(result.findings.some((f) => f.includes('ApexFlsViolation (1)'))).toBe(true);
    // The non-IDOR rule must NOT be reported
    expect(result.findings.some((f) => f.includes('ApexDoc'))).toBe(false);
  });

  it('returns inconclusive+high when only CA evidence is present (no questionnaire)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'code_analyzer',
          engine: 'sfge',
          findings: [
            { rule: 'ApexFlsViolation', severity: 'High', file: '/a.cls', line: 1, message: 'm' },
          ],
        },
      ],
    });

    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['code_analyzer']);
    expect(result.findings.some((f) => f.includes('1 IDOR-shaped finding'))).toBe(true);
    expect(result.findings.some((f) => f.includes('Process attestation is required'))).toBe(true);
  });

  it('falls back to questionnaire low-confidence when no CA evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-001',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });

    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('detects all 5 IDOR rules in the filter set', () => {
    // Spot-check that each of the 5 rules in the IDOR_RULE_NAMES set is
    // recognized — guards against typos in the filter list.
    const rules = [
      'ApexCRUDViolation',
      'ApexFlsViolation',
      'ApexSharingViolations',
      'DatabaseOperationsMustUseWithSharing',
      'ApexSOQLInjection',
    ];
    for (const rule of rules) {
      const result = evaluate({
        control,
        evidence: [
          {
            source: 'code_analyzer',
            engine: 'pmd',
            findings: [{ rule, severity: 'High', file: '/a.cls', line: 1, message: 'm' }],
          },
        ],
      });
      expect(result.findings[0]).toContain('1 IDOR-shaped finding');
      expect(result.findings[0]).toContain(`${rule} (1)`);
    }
  });
});
