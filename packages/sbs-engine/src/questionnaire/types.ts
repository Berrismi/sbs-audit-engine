// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * Questionnaire types — the product layer that sits on top of the engine's
 * Control + Evidence types. The boundary is intentional: the engine knows
 * which controls exist and what shape of evidence they consume; the
 * questionnaire layer knows the question wording, sectioning, skip rules, and
 * IDK-handling that make the questionnaire UX work.
 *
 * Answer shapes here map 1:1 to engine `Evidence` shapes via
 * `answer-to-evidence.ts`. Keep them aligned — drift breaks scoring silently.
 */

import type { CategoryPrefix, Evidence, EvidenceBundle } from '../types';

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * Top-level section identifier. Section 0 is "About you" (profile + scope
 * gates). Sections 1-9 are one per SBS category prefix. Sections 10-11 are
 * disclaimer + email gate (no questions of the scored kind).
 */
export type SectionId = 'profile' | CategoryPrefix | 'disclaimer' | 'submit';

export interface Section {
  id: SectionId;
  index: number;
  title: string;
  blurb: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * Discriminated union of question shapes. Adding a new shape means adding a
 * new variant here AND a new branch in `answer-to-evidence.ts`. The compiler
 * surfaces every callsite that needs updating.
 */
export type Question =
  | BooleanQuestion
  | ChoiceQuestion
  | MultiChoiceQuestion
  | NumericRangeQuestion
  | FreeTextQuestion;

interface QuestionBase {
  /** Stable ID, e.g. "Q-ACS-004". Used as the key in the answer payload. */
  id: string;
  /** Section this question belongs to. */
  section: SectionId;
  /**
   * The SBS control this question contributes evidence to. Profile / scope
   * questions have `controlId: null` because they drive skip logic, not scoring.
   */
  controlId: string | null;
  /** Plain-English question text (8th-grade reading level per spec §6). */
  text: string;
  /** Optional one-liner under the question. */
  helpText?: string;
  /** True for every scored question per spec §6. False for profile metadata. */
  allowIdk: boolean;
  /**
   * Optional intra-section group key. Questions sharing a `groupId` render
   * under a shared sub-heading. Title resolution lives in `GROUP_TITLES` in
   * registry.ts. Used today on long sections (e.g. ACS) for cognitive
   * chunking without changing routing or analytics granularity.
   */
  groupId?: string;
}

export interface BooleanQuestion extends QuestionBase {
  kind: 'boolean';
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  options: readonly { value: string; label: string }[];
}

export interface MultiChoiceQuestion extends QuestionBase {
  kind: 'multi_choice';
  options: readonly { value: string; label: string }[];
}

export interface NumericRangeQuestion extends QuestionBase {
  kind: 'numeric_range';
  options: readonly { value: string; label: string }[];
}

export interface FreeTextQuestion extends QuestionBase {
  kind: 'free_text';
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Answer payload keyed by question ID.
 */
export type AnswerSet = Record<string, Answer | undefined>;

export type Answer =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'choice'; value: string }
  | { kind: 'multi_choice'; values: readonly string[] }
  | { kind: 'numeric_range'; value: string }
  | { kind: 'free_text'; value: string }
  | { kind: 'idk' };

// ---------------------------------------------------------------------------
// Skip rules
// ---------------------------------------------------------------------------

export type SkipDecision = 'show' | 'skip_na' | 'skip_inapplicable';

/**
 * A skip rule is a pure predicate over the current answer set that decides
 * whether a question should be shown, hidden as N/A (counted toward "not in
 * scope" in the report), or hidden as inapplicable (silently dropped).
 *
 * Rules are evaluated in order; the first decision other than 'show' wins.
 */
export interface SkipRule {
  /** Question IDs this rule applies to. */
  appliesTo: readonly string[];
  /** Predicate over the current answer set. */
  decide: (answers: AnswerSet) => SkipDecision;
  /** Human description for debugging + report annotations. */
  reason: string;
  /**
   * Customer-facing explanation surfaced in the report's
   * "What didn't apply to your org" section. Second-person, references the
   * scope answer that caused the skip; 15-35 words.
   */
  naExplanation: string;
  /**
   * Stable id for matching skipped controls back to the rule that fired.
   * Used to group N/A controls under the right explanation when multiple
   * rules become possible.
   */
  id: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface QuestionnaireRegistry {
  /** Schema version of the registry — bump when wording or structure changes. */
  version: string;
  /** SBS version this registry targets (mirrors engine controls.json). */
  sbsVersion: string;
  sections: readonly Section[];
  questions: readonly Question[];
  skipRules: readonly SkipRule[];
}

// ---------------------------------------------------------------------------
// Re-exports of engine types so consumers only import from one place.
// ---------------------------------------------------------------------------

export type { Evidence, EvidenceBundle, CategoryPrefix };
