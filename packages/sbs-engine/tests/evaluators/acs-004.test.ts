// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004: Documented Justification for All Super Admin–Equivalent Users.
//
// Reference evaluator test. Establishes the pattern that all 41 other
// Phase 3 evaluators will follow:
//   1. one test per evidence path the evaluator handles
//      (questionnaire, soql) × (pass, fail, na, inconclusive)
//   2. soql evaluator multiplexes shape (zero rows, all-justified, some-undocumented)
//   3. evaluator never throws; degrades to inconclusive when evidence is absent

import { describe, expect, it } from 'vitest';
import { evaluate as evaluateAcs004 } from '../../src/evaluators/acs-004.ts';
import type { Evidence, EvaluatorInput } from '../../src/types.ts';
import { ACS_004 } from '../fixtures/control-acs-004.ts';

const inputWith = (evidence: Evidence[]): EvaluatorInput => ({
  control: ACS_004,
  evidence,
});

describe('SBS-ACS-004 evaluator', () => {
  describe('questionnaire evidence', () => {
    it('returns pass with low confidence when user attests they have documented justification', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: 'Q-ACS-004',
            answer: { kind: 'boolean', value: true },
          },
        ]),
      );

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('low');
      expect(result.evidence_used).toEqual(['questionnaire']);
    });

    it('returns fail with low confidence when user attests they do not have documentation', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: 'Q-ACS-004',
            answer: { kind: 'boolean', value: false },
          },
        ]),
      );

      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('low');
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('returns inconclusive when the user picks "I don\'t know"', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: 'Q-ACS-004',
            answer: { kind: 'idk' },
          },
        ]),
      );

      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
    });
  });

  describe('soql evidence', () => {
    it('returns pass with high confidence when zero super-admin-equivalent users exist', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: 'SELECT Id, Username FROM User WHERE ...',
            rows: [],
          },
        ]),
      );

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
      expect(result.evidence_used).toEqual(['soql']);
    });

    it('returns fail with high confidence when super-admin-equivalent users exist but justification is missing', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: 'SELECT Id, Username FROM User WHERE ...',
            rows: [
              { Id: '005000000000001', Username: 'admin1@example.com', JustificationDoc__c: null },
              { Id: '005000000000002', Username: 'admin2@example.com', JustificationDoc__c: '' },
            ],
          },
        ]),
      );

      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('high');
      expect(result.findings.some((f) => f.includes('admin1@example.com'))).toBe(true);
      expect(result.findings.some((f) => f.includes('admin2@example.com'))).toBe(true);
    });

    it('returns pass with high confidence when every super-admin-equivalent user has justification', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: 'SELECT Id, Username FROM User WHERE ...',
            rows: [
              {
                Id: '005000000000001',
                Username: 'admin1@example.com',
                JustificationDoc__c: 'https://wiki.example.com/super-admin-justifications#admin1',
              },
            ],
          },
        ]),
      );

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
    });
  });

  describe('precedence and degradation', () => {
    it('prefers SOQL evidence over questionnaire evidence when both are present', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: 'Q-ACS-004',
            answer: { kind: 'boolean', value: true },
          },
          {
            source: 'soql',
            query: 'SELECT Id, Username FROM User WHERE ...',
            rows: [
              { Id: '005000000000001', Username: 'admin1@example.com', JustificationDoc__c: null },
            ],
          },
        ]),
      );

      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('high');
      expect(result.evidence_used).toEqual(['soql']);
    });

    it('returns inconclusive (not throws) when no relevant evidence is provided', () => {
      const result = evaluateAcs004(inputWith([]));

      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('ignores irrelevant evidence sources', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'health_check_api',
            risk_score: 92,
            high_risk: [],
          },
        ]),
      );

      expect(result.status).toBe('inconclusive');
    });
  });
});
