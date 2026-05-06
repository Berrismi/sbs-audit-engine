// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/file-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

// Existing 4-case attestation contract (questionnaire-only path stays
// unchanged after the CLI extension lands).
describeBooleanEvaluator({
  controlId: 'SBS-FILE-002',
  questionId: 'Q-FILE-002',
  evaluate,
});

// Tier 1 PR 2: SOQL evidence path tests. Same shape as INT-002/INT-003 —
// 0 rows = pass+high (compliant); ≥1 rows = inconclusive+high (questionnaire
// still adjudicates sensitivity classification).
describe('SBS-FILE-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-FILE-002');

  it('returns pass+high when no ContentDistribution rows lack passwords', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'file-002-content-distributions-without-passwords',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive+high when ContentDistribution rows lack passwords (sensitivity needs questionnaire)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'file-002-content-distributions-without-passwords',
          rows: [{ Id: 'cd1' }, { Id: 'cd2' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('2 Public Content link');
    expect(result.findings[0]).toContain('sensitivity');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-FILE-002',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: 'file-002-content-distributions-without-passwords',
          rows: [],
        },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.status).toBe('pass');
  });

  it('falls back to questionnaire low-confidence when SOQL evidence is absent (edition-gate skipped)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-FILE-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
