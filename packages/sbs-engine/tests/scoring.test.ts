// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Scoring math — pure functions. TDD strict.
//
// Spec §8 contract:
//   - Per-control: pass / fail / na / inconclusive.
//   - Category score = sum(weights of passed in-scope) / sum(weights of all in-scope) × 100.
//   - In-scope = pass + fail (inconclusive + na excluded from denominator).
//   - Overall = weighted average of category scores, weighted by each category's
//     proportion of (Critical + High) controls.
//   - Risk grade: A 90-100, B 80-89, C 65-79, D 50-64, F <50.
//   - Critical-fail cap: any Critical control returning `fail` caps the overall
//     grade at C, regardless of arithmetic.
//   - Inconclusive returning Critical does NOT trigger the cap.

import { describe, expect, it } from 'vitest';
import { categoryScore, inconclusivePercent, overallScore, riskGrade } from '../src/scoring';
import type { CategoryPrefix, CategoryScoreOutput, ControlScoreResult } from '../src/types';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

const makeResult = (
  overrides: Partial<ControlScoreResult> & Pick<ControlScoreResult, 'status'>,
): ControlScoreResult => ({
  control_id: overrides.control_id ?? 'SBS-ACS-001',
  category: overrides.category ?? 'ACS',
  risk_level: overrides.risk_level ?? 'High',
  weight: overrides.weight ?? 3,
  status: overrides.status,
  confidence: overrides.confidence ?? 'low',
  evidence_used: overrides.evidence_used ?? ['questionnaire'],
  findings: overrides.findings ?? [],
});

// -----------------------------------------------------------------------------
// categoryScore
// -----------------------------------------------------------------------------

describe('categoryScore', () => {
  it('returns 0 score and 0 totals when no results', () => {
    const out = categoryScore('ACS', []);
    expect(out.score).toBe(0);
    expect(out.passed_weight).toBe(0);
    expect(out.total_weight).toBe(0);
    expect(out.pass_count).toBe(0);
    expect(out.fail_count).toBe(0);
    expect(out.inconclusive_count).toBe(0);
    expect(out.na_count).toBe(0);
    expect(out.is_all_inconclusive).toBe(false);
  });

  it('returns 100 when one Critical control passes', () => {
    const out = categoryScore('ACS', [
      makeResult({ status: 'pass', risk_level: 'Critical', weight: 5 }),
    ]);
    expect(out.score).toBe(100);
    expect(out.passed_weight).toBe(5);
    expect(out.total_weight).toBe(5);
    expect(out.pass_count).toBe(1);
  });

  it('returns 0 when one Critical control fails', () => {
    const out = categoryScore('ACS', [
      makeResult({ status: 'fail', risk_level: 'Critical', weight: 5 }),
    ]);
    expect(out.score).toBe(0);
    expect(out.passed_weight).toBe(0);
    expect(out.total_weight).toBe(5);
    expect(out.fail_count).toBe(1);
  });

  it('weights pass and fail correctly across mixed risk tiers', () => {
    // 1 Critical pass (5) + 1 High fail (3) + 1 Moderate pass (2)
    // passed = 5 + 2 = 7; total = 5 + 3 + 2 = 10 → 70
    const out = categoryScore('ACS', [
      makeResult({ status: 'pass', risk_level: 'Critical', weight: 5 }),
      makeResult({ status: 'fail', risk_level: 'High', weight: 3 }),
      makeResult({ status: 'pass', risk_level: 'Moderate', weight: 2 }),
    ]);
    expect(out.score).toBe(70);
    expect(out.passed_weight).toBe(7);
    expect(out.total_weight).toBe(10);
    expect(out.pass_count).toBe(2);
    expect(out.fail_count).toBe(1);
  });

  it('excludes inconclusive from both numerator AND denominator', () => {
    // 2 pass (3 + 2) + 1 inconclusive (5)
    // passed = 5; total = 5 (only the pass + fail count toward denominator,
    // here both pass) → 100
    const out = categoryScore('ACS', [
      makeResult({ status: 'pass', risk_level: 'High', weight: 3 }),
      makeResult({ status: 'pass', risk_level: 'Moderate', weight: 2 }),
      makeResult({ status: 'inconclusive', risk_level: 'Critical', weight: 5 }),
    ]);
    expect(out.score).toBe(100);
    expect(out.passed_weight).toBe(5);
    expect(out.total_weight).toBe(5);
    expect(out.inconclusive_count).toBe(1);
  });

  it('excludes na the same way as inconclusive', () => {
    const out = categoryScore('ACS', [
      makeResult({ status: 'pass', risk_level: 'High', weight: 3 }),
      makeResult({ status: 'na', risk_level: 'Critical', weight: 5 }),
    ]);
    expect(out.score).toBe(100);
    expect(out.passed_weight).toBe(3);
    expect(out.total_weight).toBe(3);
    expect(out.na_count).toBe(1);
  });

  it('marks is_all_inconclusive true when every result is inconclusive', () => {
    const out = categoryScore('ACS', [
      makeResult({ status: 'inconclusive' }),
      makeResult({ status: 'inconclusive' }),
    ]);
    expect(out.is_all_inconclusive).toBe(true);
    expect(out.score).toBe(0);
  });

  it('does not mark is_all_inconclusive true when some are na', () => {
    const out = categoryScore('ACS', [
      makeResult({ status: 'inconclusive' }),
      makeResult({ status: 'na' }),
    ]);
    expect(out.is_all_inconclusive).toBe(false);
  });

  it('rounds the score to one decimal place', () => {
    // 1 High pass (3) + 2 High fail (3 + 3) → 3 / 9 → 33.333... → 33.3
    const out = categoryScore('ACS', [
      makeResult({ status: 'pass', risk_level: 'High', weight: 3 }),
      makeResult({ status: 'fail', risk_level: 'High', weight: 3 }),
      makeResult({ status: 'fail', risk_level: 'High', weight: 3 }),
    ]);
    expect(out.score).toBe(33.3);
  });
});

// -----------------------------------------------------------------------------
// overallScore
// -----------------------------------------------------------------------------

const makeCategory = (
  category: CategoryPrefix,
  score: number,
  totals: { critical?: number; high?: number; moderate?: number } = {},
): {
  category: CategoryScoreOutput;
  control_count_by_risk: { Critical: number; High: number; Moderate: number };
} => ({
  category: {
    category,
    score,
    passed_weight: 0,
    total_weight: 0,
    pass_count: 0,
    fail_count: 0,
    inconclusive_count: 0,
    na_count: 0,
    is_all_inconclusive: false,
  },
  control_count_by_risk: {
    Critical: totals.critical ?? 0,
    High: totals.high ?? 0,
    Moderate: totals.moderate ?? 0,
  },
});

describe('overallScore', () => {
  it('returns 0 with no categories', () => {
    expect(overallScore([])).toBe(0);
  });

  it('returns the single category score when only one category', () => {
    const cat = makeCategory('ACS', 80, { critical: 1, high: 2 });
    expect(overallScore([cat])).toBe(80);
  });

  it('weights categories by their (Critical + High) control share', () => {
    // ACS: score 100, 5 critical+high controls
    // CODE: score 0, 1 critical+high control
    // weight share: ACS = 5/6, CODE = 1/6
    // overall = 100 * 5/6 + 0 * 1/6 = 83.333... → rounded 83.3
    const acs = makeCategory('ACS', 100, { critical: 3, high: 2 });
    const code = makeCategory('CODE', 0, { critical: 0, high: 1 });
    expect(overallScore([acs, code])).toBe(83.3);
  });

  it('falls back to equal weighting when no category has Critical or High controls', () => {
    // Both Moderate-only — weighted avg degenerates to plain avg.
    const a = makeCategory('ACS', 80, { moderate: 2 });
    const b = makeCategory('AUTH', 60, { moderate: 2 });
    expect(overallScore([a, b])).toBe(70);
  });

  it('ignores categories that have no controls in scope (zero counts)', () => {
    // SECCONF has zero controls → weight contribution zero.
    // ACS: 90, 2 critical+high; SECCONF: 100, 0 — overall should be 90.
    const acs = makeCategory('ACS', 90, { critical: 1, high: 1 });
    const secconf = makeCategory('SECCONF', 100, {});
    expect(overallScore([acs, secconf])).toBe(90);
  });
});

// -----------------------------------------------------------------------------
// riskGrade
// -----------------------------------------------------------------------------

describe('riskGrade', () => {
  it('A for 90-100', () => {
    expect(riskGrade(90, false)).toBe('A');
    expect(riskGrade(100, false)).toBe('A');
    expect(riskGrade(95.5, false)).toBe('A');
  });

  it('B for 80-89', () => {
    expect(riskGrade(80, false)).toBe('B');
    expect(riskGrade(89.9, false)).toBe('B');
  });

  it('C for 65-79', () => {
    expect(riskGrade(65, false)).toBe('C');
    expect(riskGrade(79.9, false)).toBe('C');
  });

  it('D for 50-64', () => {
    expect(riskGrade(50, false)).toBe('D');
    expect(riskGrade(64.9, false)).toBe('D');
  });

  it('F for under 50', () => {
    expect(riskGrade(0, false)).toBe('F');
    expect(riskGrade(49.9, false)).toBe('F');
  });

  it('caps at C when a Critical control failed, even with score >= 80', () => {
    expect(riskGrade(92, true)).toBe('C');
    expect(riskGrade(100, true)).toBe('C');
    expect(riskGrade(80, true)).toBe('C');
  });

  it('does not raise the grade when capping (D stays D, F stays F)', () => {
    expect(riskGrade(60, true)).toBe('D');
    expect(riskGrade(40, true)).toBe('F');
  });

  it('is independent of inconclusive count — only fail triggers the cap', () => {
    // Caller passes hasCriticalFail=false even when Critical controls were
    // inconclusive. The inconclusive case must not cap.
    expect(riskGrade(95, false)).toBe('A');
  });
});

// -----------------------------------------------------------------------------
// inconclusivePercent
// -----------------------------------------------------------------------------

describe('inconclusivePercent', () => {
  it('returns 0 when no results', () => {
    expect(inconclusivePercent([])).toBe(0);
  });

  it('returns 0 when no inconclusive', () => {
    const results = [makeResult({ status: 'pass' }), makeResult({ status: 'fail' })];
    expect(inconclusivePercent(results)).toBe(0);
  });

  it('returns 100 when every result is inconclusive', () => {
    const results = [
      makeResult({ status: 'inconclusive' }),
      makeResult({ status: 'inconclusive' }),
    ];
    expect(inconclusivePercent(results)).toBe(100);
  });

  it('computes percent against the full result set (not the in-scope subset)', () => {
    // 1 inconclusive of 4 total → 25
    const results = [
      makeResult({ status: 'pass' }),
      makeResult({ status: 'pass' }),
      makeResult({ status: 'fail' }),
      makeResult({ status: 'inconclusive' }),
    ];
    expect(inconclusivePercent(results)).toBe(25);
  });

  it('treats na as not-inconclusive', () => {
    // 1 na of 2 total → 0% inconclusive
    const results = [makeResult({ status: 'pass' }), makeResult({ status: 'na' })];
    expect(inconclusivePercent(results)).toBe(0);
  });

  it('rounds to one decimal place', () => {
    // 1 inconclusive of 3 total → 33.333... → 33.3
    const results = [
      makeResult({ status: 'pass' }),
      makeResult({ status: 'fail' }),
      makeResult({ status: 'inconclusive' }),
    ];
    expect(inconclusivePercent(results)).toBe(33.3);
  });
});
