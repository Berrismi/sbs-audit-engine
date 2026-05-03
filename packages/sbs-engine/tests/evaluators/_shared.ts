// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Shared describe-block runner for boolean-attestation evaluators.
//
// All Phase 3 questionnaire-only evaluators conform to the same four-case
// contract: pass/fail/idk/no-evidence. Per-control test files use this
// helper to assert that contract uniformly. When Phase 5 adds SOQL paths,
// each evaluator picks up its own hand-written test file with the SOQL
// cases (mirroring the acs-004 reference test pattern).

import { describe, expect, it } from 'vitest';
import type { Evaluator, Evidence, EvaluatorInput } from '../../src/types';
import { makeControlFixture } from '../fixtures/control';

export interface BooleanEvaluatorTestConfig {
  controlId: string;
  questionId: string;
  evaluate: Evaluator;
}

export function describeBooleanEvaluator(config: BooleanEvaluatorTestConfig): void {
  const inputWith = (evidence: Evidence[]): EvaluatorInput => ({
    control: makeControlFixture(config.controlId),
    evidence,
  });

  describe(`${config.controlId} evaluator`, () => {
    it('returns pass with low confidence when respondent attests Yes', () => {
      const result = config.evaluate(
        inputWith([
          {
            source: 'questionnaire',
            question_id: config.questionId,
            answer: { kind: 'boolean', value: true },
          },
        ]),
      );
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('low');
      expect(result.evidence_used).toEqual(['questionnaire']);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('returns fail with low confidence when respondent attests No', () => {
      const result = config.evaluate(
        inputWith([
          {
            source: 'questionnaire',
            question_id: config.questionId,
            answer: { kind: 'boolean', value: false },
          },
        ]),
      );
      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('low');
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('returns inconclusive when respondent picks "I don\'t know"', () => {
      const result = config.evaluate(
        inputWith([
          {
            source: 'questionnaire',
            question_id: config.questionId,
            answer: { kind: 'idk' },
          },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
    });

    it('returns inconclusive (not throws) when no relevant evidence is provided', () => {
      const result = config.evaluate(inputWith([]));
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
      expect(result.evidence_used).toEqual([]);
    });
  });
}
