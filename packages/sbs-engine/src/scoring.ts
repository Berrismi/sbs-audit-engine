// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Scoring math — pure functions only. No IO, no module-level state.
// Spec §8 contract; see tests/scoring.test.ts for the cases.

import type {
  CategoryPrefix,
  CategoryScoreOutput,
  ControlScoreResult,
  RiskGrade,
  RiskLevel,
} from './types';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Aggregate per-control results into a category score.
 *
 * Inconclusive + na are excluded from both numerator and denominator —
 * they don't penalize the score (the inconclusive banner already
 * communicates uncertainty separately).
 */
export function categoryScore(
  category: CategoryPrefix,
  results: readonly ControlScoreResult[],
): CategoryScoreOutput {
  let passed_weight = 0;
  let total_weight = 0;
  let pass_count = 0;
  let fail_count = 0;
  let inconclusive_count = 0;
  let na_count = 0;

  for (const r of results) {
    switch (r.status) {
      case 'pass':
        passed_weight += r.weight;
        total_weight += r.weight;
        pass_count += 1;
        break;
      case 'fail':
        total_weight += r.weight;
        fail_count += 1;
        break;
      case 'inconclusive':
        inconclusive_count += 1;
        break;
      case 'na':
        na_count += 1;
        break;
    }
  }

  const score = total_weight === 0 ? 0 : round1((passed_weight / total_weight) * 100);
  const is_all_inconclusive =
    results.length > 0 && results.every((r) => r.status === 'inconclusive');

  return {
    category,
    score,
    passed_weight,
    total_weight,
    pass_count,
    fail_count,
    inconclusive_count,
    na_count,
    is_all_inconclusive,
  };
}

/**
 * Per-category input for `overallScore`. Each entry pairs the category's
 * score output with its in-scope-control composition by risk level — needed
 * so we can weight by (Critical + High) share per spec §8.
 */
export interface CategoryWeightInput {
  category: CategoryScoreOutput;
  control_count_by_risk: Record<RiskLevel, number>;
}

/**
 * Spec §8: overall score is a weighted average of category scores, where each
 * category's weight is its proportion of (Critical + High) controls in the
 * full in-scope set. Categories with no Critical/High controls fall back to
 * equal weighting (only triggered when the entire in-scope set has none).
 */
export function overallScore(categories: readonly CategoryWeightInput[]): number {
  if (categories.length === 0) return 0;

  const criticalHighWeights = categories.map(
    (c) => c.control_count_by_risk.Critical + c.control_count_by_risk.High,
  );
  const totalCriticalHigh = criticalHighWeights.reduce((a, b) => a + b, 0);

  if (totalCriticalHigh === 0) {
    // Fallback: equal weighting across categories that have any controls at all.
    const inScope = categories.filter(
      (c) =>
        c.control_count_by_risk.Critical +
          c.control_count_by_risk.High +
          c.control_count_by_risk.Moderate >
        0,
    );
    if (inScope.length === 0) return 0;
    const sum = inScope.reduce((acc, c) => acc + c.category.score, 0);
    return round1(sum / inScope.length);
  }

  let weightedSum = 0;
  for (let i = 0; i < categories.length; i += 1) {
    const w = (criticalHighWeights[i] ?? 0) / totalCriticalHigh;
    weightedSum += (categories[i]?.category.score ?? 0) * w;
  }
  return round1(weightedSum);
}

/**
 * Letter grade from overall score, with the spec §8 "any critical fail caps
 * grade at C" rule. Passing `hasCriticalFail = true` floors the grade at C
 * (does not raise lower grades).
 */
export function riskGrade(overall: number, hasCriticalFail: boolean): RiskGrade {
  let grade: RiskGrade;
  if (overall >= 90) grade = 'A';
  else if (overall >= 80) grade = 'B';
  else if (overall >= 65) grade = 'C';
  else if (overall >= 50) grade = 'D';
  else grade = 'F';

  if (hasCriticalFail && (grade === 'A' || grade === 'B')) {
    return 'C';
  }
  return grade;
}

/**
 * Percentage of total results that came back `inconclusive`. Used to drive
 * the "X% of controls could not be evaluated" banner.
 */
export function inconclusivePercent(results: readonly ControlScoreResult[]): number {
  if (results.length === 0) return 0;
  const inconclusive = results.filter((r) => r.status === 'inconclusive').length;
  return round1((inconclusive / results.length) * 100);
}
