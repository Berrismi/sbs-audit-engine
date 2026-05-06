// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Tests for the shared attestationEvaluator helper. Per-control tests cover
// the standard four cases (pass/fail/idk/no-evidence); this file covers the
// extra paths the helper handles (unexpected answer shape, irrelevant
// evidence ignored, evidence_used contract).

import { describe, expect, it } from 'vitest';
import {
  attestationEvaluator,
  corroboratingCodeAnalyzerEvaluator,
  corroboratingEvaluator,
  corroboratingHealthCheckEvaluator,
  corroboratingLimitsApiEvaluator,
} from '../../src/evaluators/_attestation';
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

describe('corroboratingHealthCheckEvaluator', () => {
  const evaluateCorr = corroboratingHealthCheckEvaluator({
    questionId: 'Q-SECCONF-001',
    passFinding: 'PASS_MSG',
    failFinding: 'FAIL_MSG',
    observe: (hc) => [
      `Health Check observed: score ${hc.risk_score}, ${hc.high_risk.length} high-risk setting(s).`,
    ],
  });

  const inputCorr = (evidence: Evidence[]): EvaluatorInput => ({
    control: makeControlFixture('SBS-SECCONF-001'),
    evidence,
  });

  it('returns questionnaire pass with HIGH confidence + HC observations when both are present', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-001',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'health_check_api', risk_score: 90, high_risk: [] },
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'health_check_api']);
    expect(result.findings[0]).toBe('PASS_MSG');
    expect(result.findings[1]).toContain('score 90');
  });

  it('returns questionnaire fail with HIGH confidence + HC observations when both are present', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-001',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'health_check_api',
          risk_score: 60,
          high_risk: [{ name: 'Session', value: '8h', recommended: '15m' }],
        },
      ]),
    );
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'health_check_api']);
  });

  it('returns inconclusive+high with HC observations when only HC evidence is present', () => {
    const result = evaluateCorr(
      inputCorr([{ source: 'health_check_api', risk_score: 75, high_risk: [] }]),
    );
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['health_check_api']);
    expect(result.findings.some((f) => f.includes('score 75'))).toBe(true);
    expect(result.findings.some((f) => f.includes('questionnaire'))).toBe(true);
  });

  it('returns questionnaire-only verdict (low confidence) when HC evidence is absent', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-SECCONF-001',
          answer: { kind: 'boolean', value: true },
        },
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('returns inconclusive+low when no evidence is provided at all', () => {
    const result = evaluateCorr(inputCorr([]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });
});

describe('corroboratingCodeAnalyzerEvaluator', () => {
  const evaluateCorr = corroboratingCodeAnalyzerEvaluator({
    questionId: 'Q-CODE-002',
    passFinding: 'PASS_CODE_MSG',
    failFinding: 'FAIL_CODE_MSG',
    observe: (ca) => [
      `Code Analyzer (engine: ${ca.engine}) reported ${ca.findings.length} finding(s).`,
    ],
  });

  const inputCa = (evidence: Evidence[]): EvaluatorInput => ({
    control: makeControlFixture('SBS-CODE-002'),
    evidence,
  });

  it('returns questionnaire pass with HIGH confidence + CA observations when both are present', () => {
    const result = evaluateCorr(
      inputCa([
        {
          source: 'questionnaire',
          question_id: 'Q-CODE-002',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'code_analyzer',
          engine: 'pmd',
          findings: [
            {
              rule: 'ApexCSRF',
              severity: 'High',
              file: '/a.cls',
              line: 10,
              message: 'm',
            },
          ],
        },
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'code_analyzer']);
    expect(result.findings[0]).toBe('PASS_CODE_MSG');
    expect(result.findings[1]).toContain('1 finding');
  });

  it('returns inconclusive+high with CA observations when only CA evidence is present', () => {
    const result = evaluateCorr(
      inputCa([{ source: 'code_analyzer', engine: 'pmd', findings: [] }]),
    );
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['code_analyzer']);
    expect(result.findings.some((f) => f.includes('engine: pmd'))).toBe(true);
    expect(result.findings.some((f) => f.includes('questionnaire'))).toBe(true);
  });

  it('returns standard low-confidence questionnaire result when CA evidence is absent', () => {
    const result = evaluateCorr(
      inputCa([
        {
          source: 'questionnaire',
          question_id: 'Q-CODE-002',
          answer: { kind: 'boolean', value: false },
        },
      ]),
    );
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('returns inconclusive+low when no evidence is provided at all', () => {
    const result = evaluateCorr(inputCa([]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });
});

describe('corroboratingLimitsApiEvaluator', () => {
  const evaluateCorr = corroboratingLimitsApiEvaluator({
    questionId: 'Q-MON-005',
    passFinding: 'PASS_MSG',
    failFinding: 'FAIL_MSG',
    observe: (e) => {
      const daily = e.limits['DailyApiRequests'];
      if (!daily) return ['no DailyApiRequests entry'];
      return [`Daily API requests: ${daily.max - daily.remaining}/${daily.max}.`];
    },
  });

  const inputCorr = (evidence: Evidence[]): EvaluatorInput => ({
    control: makeControlFixture('SBS-MON-005'),
    evidence,
  });

  const limitsEvidence = (max: number, remaining: number): Evidence => ({
    source: 'limits_rest_api',
    api_version: '60.0',
    limits: { DailyApiRequests: { max, remaining } },
  });

  it('returns questionnaire pass with HIGH confidence + Limits observations when both are present', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-MON-005',
          answer: { kind: 'boolean', value: true },
        },
        limitsEvidence(100000, 95000),
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'limits_rest_api']);
    expect(result.findings[0]).toBe('PASS_MSG');
    expect(result.findings[1]).toContain('5000/100000');
  });

  it('returns questionnaire fail with HIGH confidence + Limits observations when both are present', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-MON-005',
          answer: { kind: 'boolean', value: false },
        },
        limitsEvidence(100000, 5000),
      ]),
    );
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'limits_rest_api']);
  });

  it('returns inconclusive+high with Limits observations when only Limits evidence is present', () => {
    const result = evaluateCorr(inputCorr([limitsEvidence(100000, 70000)]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['limits_rest_api']);
    expect(result.findings.some((f) => f.includes('30000/100000'))).toBe(true);
    expect(result.findings.some((f) => f.includes('questionnaire'))).toBe(true);
  });

  it('returns questionnaire-only verdict (low confidence) when Limits evidence is absent', () => {
    const result = evaluateCorr(
      inputCorr([
        {
          source: 'questionnaire',
          question_id: 'Q-MON-005',
          answer: { kind: 'boolean', value: true },
        },
      ]),
    );
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('returns inconclusive+low when no evidence is provided at all', () => {
    const result = evaluateCorr(inputCorr([]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });
});

describe('corroboratingEvaluator (generic, used directly)', () => {
  // Confirms the generic helper is callable without going through a
  // source-specific wrapper. Each wrapper above already exercises this
  // code path; this test pins direct-call ergonomics so future controls
  // can adopt the generic without adding a wrapper.
  const evaluateDirect = corroboratingEvaluator({
    questionId: 'Q-MON-005',
    passFinding: 'PASS',
    failFinding: 'FAIL',
    source: 'limits_rest_api',
    observe: (e) => [`limits api_version=${e.api_version}`],
  });

  it('combines questionnaire + CLI evidence at HIGH confidence', () => {
    const result = evaluateDirect({
      control: makeControlFixture('SBS-MON-005'),
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-MON-005',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'limits_rest_api', api_version: '60.0', limits: {} },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['questionnaire', 'limits_rest_api']);
    expect(result.findings[1]).toBe('limits api_version=60.0');
  });

  it('returns inconclusive+high when only CLI evidence is present', () => {
    const result = evaluateDirect({
      control: makeControlFixture('SBS-MON-005'),
      evidence: [{ source: 'limits_rest_api', api_version: '59.0', limits: {} }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['limits_rest_api']);
    expect(result.findings[0]).toBe('limits api_version=59.0');
  });
});
