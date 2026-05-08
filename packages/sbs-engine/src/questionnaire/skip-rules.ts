// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * Skip-rule evaluation. Pure functions over the current answer set; no IO.
 *
 * Today's ruleset:
 *   Q-SCOPE-CPORTAL === 'no'  →  skip all SBS-CPORTAL-* questions as N/A.
 *
 * Add new rules here when SBS introduces categories with conditional scope
 * (e.g. Event Monitoring add-on tiers).
 */

import type { AnswerSet, Question, SkipDecision, SkipRule } from './types';

/**
 * Evaluate skip rules for a single question against the current answer set.
 * First non-'show' decision wins. Order matters — list more-specific rules first.
 */
export function evaluateSkip(
  question: Question,
  answers: AnswerSet,
  rules: readonly SkipRule[],
): SkipDecision {
  for (const rule of rules) {
    if (!rule.appliesTo.includes(question.id)) continue;
    const decision = rule.decide(answers);
    if (decision !== 'show') return decision;
  }
  return 'show';
}

/**
 * `appliesTo` is filled in at registry-construction time with the actual
 * CPORTAL question IDs, so this module doesn't have to know which question IDs
 * map to CPORTAL controls. See `registry.ts`.
 */
export const CPORTAL_SKIP_RULE_ID = 'cportal-out-of-scope';

export function makeCportalSkipRule(cportalQuestionIds: readonly string[]): SkipRule {
  return {
    id: CPORTAL_SKIP_RULE_ID,
    appliesTo: cportalQuestionIds,
    reason:
      'Customer Portal controls are only relevant to orgs running Experience Cloud / Customer Portals.',
    naExplanation:
      "You said you don't run Experience Cloud or a Customer Portal, so customer-portal hardening controls don't apply to your org.",
    decide: (answers: AnswerSet): SkipDecision => {
      const scope = answers['Q-SCOPE-CPORTAL'];
      if (scope?.kind === 'boolean' && scope.value === false) return 'skip_na';
      // Default: show. "Yes", "I don't know", and unanswered all keep CPORTAL
      // questions visible (defensive — better to ask than to silently exclude).
      return 'show';
    },
  };
}
