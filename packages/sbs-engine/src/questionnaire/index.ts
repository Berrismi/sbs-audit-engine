// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Public entry for @hellomavens/security-review-for-salesforce-engine/questionnaire.
//
// Exposes the question registry, type system, skip-rule evaluation, and
// answer-to-evidence mapper used by the audit web app and the CLI plugin.

export type {
  Answer,
  AnswerSet,
  BooleanQuestion,
  CategoryPrefix,
  ChoiceQuestion,
  Evidence,
  EvidenceBundle,
  FreeTextQuestion,
  MultiChoiceQuestion,
  NumericRangeQuestion,
  Question,
  QuestionnaireRegistry,
  Section,
  SectionId,
  SkipDecision,
  SkipRule,
} from './types';

export {
  ALL_QUESTIONS,
  CONTROL_QUESTIONS,
  GROUP_TITLES,
  KNOWN_DEFERRED_CONTROLS,
  PROFILE_QUESTIONS,
  REGISTRY,
  SECTIONS,
} from './registry';

export { CPORTAL_SKIP_RULE_ID, evaluateSkip, makeCportalSkipRule } from './skip-rules';

export { toQuestionnaireSubmission, type QuestionnaireSubmission } from './answer-to-evidence';

export { DISCLAIMER_PARAGRAPHS, DISCLAIMER_VERSION } from './disclaimer';
