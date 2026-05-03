// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Tests for the shared attestationEvaluator helper. Per-control tests cover
// the standard four cases (pass/fail/idk/no-evidence); this file covers the
// extra paths the helper handles (unexpected answer shape, irrelevant
// evidence ignored, evidence_used contract).

import { describe, expect, it } from 'vitest';
import { attestationEvaluator } from '../../src/evaluators/_attestation';
import { makeControlFixture } from '../fixtures/control';
import type { Evidence, EvaluatorInput } from '../../src/types';

const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-001',
  passFinding: 'PASS_MSG',
  failFinding: 'FAIL_MSG',
});

const inputWith = (evidence: Evidence[]): EvaluatorInput => ({
  control: makeControlFixture('SBS-ACS-001'),
  evidence,
});

describe('attestationEvaluator', () => {
  it('ignores evidence for a different question_id', () => {
    const result = evaluate(
      inputWith([
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-001',
          answer: { kind: 'boolean', value: true },
        },
      ]),
    );
    expect(result.status).toBe('inconclusive');
    expect(result.evidence_used).toEqual([]);
  });

  it('ignores irrelevant evidence sources', () => {
    const result = evaluate(
      inputWith([{ source: 'health_check_api', risk_score: 92, high_risk: [] }]),
    );
    expect(result.status).toBe('inconclusive');
    expect(result.evidence_used).toEqual([]);
  });

  it('returns inconclusive when answer shape is unexpected (e.g., choice)', () => {
    const result = evaluate(
      inputWith([
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-001',
          answer: { kind: 'choice', value: 'something' },
        },
      ]),
    );
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
    expect(result.findings[0]).toContain('Unexpected answer shape');
  });

  it('uses the configured passFinding string verbatim on pass', () => {
    const result = evaluate(
      inputWith([
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-001',
          answer: { kind: 'boolean', value: true },
        },
      ]),
    );
    expect(result.findings).toEqual(['PASS_MSG']);
  });

  it('uses the configured failFinding string verbatim on fail', () => {
    const result = evaluate(
      inputWith([
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-001',
          answer: { kind: 'boolean', value: false },
        },
      ]),
    );
    expect(result.findings).toEqual(['FAIL_MSG']);
  });
});
