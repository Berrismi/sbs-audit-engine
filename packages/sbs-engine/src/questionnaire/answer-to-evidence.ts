// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * Pure mapping from a questionnaire answer set to the engine's EvidenceBundle
 * shape. The engine's `score()` consumes this output verbatim, so any drift
 * between Answer and QuestionnaireAnswer kinds breaks scoring silently.
 *
 * Responsibilities:
 *   1. Translate each scored Answer into an Evidence entry tagged with the
 *      question_id the engine's evaluators look up.
 *   2. Apply skip rules — a question marked `skip_na` produces no evidence
 *      and adds its control to `skippedControls`.
 *   3. Drop profile/scope answers (controlId === null) and free_text answers
 *      (no engine equivalent).
 *   4. Track which questions the user answered "I don't know" so the report
 *      viewer can highlight them.
 */

import type {
  Answer,
  AnswerSet,
  Evidence,
  EvidenceBundle,
  Question,
  QuestionnaireRegistry,
} from './types';
import { evaluateSkip } from './skip-rules';

export interface QuestionnaireSubmission {
  bundle: EvidenceBundle;
  /** Control IDs the skip rules marked as N/A for this respondent's scope. */
  skippedControls: string[];
  /** Question IDs the user answered "I don't know" on. */
  idkQuestions: string[];
}

export function toQuestionnaireSubmission({
  subjectId,
  answers,
  registry,
  collectedAt,
}: {
  subjectId: string;
  answers: AnswerSet;
  registry: QuestionnaireRegistry;
  /** Override for tests; defaults to `new Date().toISOString()`. */
  collectedAt?: string;
}): QuestionnaireSubmission {
  const evidence: Evidence[] = [];
  const skippedControls: string[] = [];
  const idkQuestions: string[] = [];

  for (const question of registry.questions) {
    const decision = evaluateSkip(question, answers, registry.skipRules);

    if (decision === 'skip_na') {
      if (question.controlId && !skippedControls.includes(question.controlId)) {
        skippedControls.push(question.controlId);
      }
      continue;
    }
    if (decision === 'skip_inapplicable') continue;

    const answer = answers[question.id];
    if (!answer) continue;

    const ev = answerToEvidence(question, answer);
    if (ev) evidence.push(ev);

    if (answer.kind === 'idk') idkQuestions.push(question.id);
  }

  return {
    bundle: {
      subject_id: subjectId,
      collected_at: collectedAt ?? new Date().toISOString(),
      evidence,
    },
    skippedControls,
    idkQuestions,
  };
}

/**
 * Convert a single Answer to an Evidence entry. Returns null when the answer
 * doesn't contribute to scoring (profile-only questions, free_text answers).
 *
 * Note: free_text Answers are dropped because the engine has no
 * QuestionnaireAnswer variant for them. Free-text questions exist only for
 * profile metadata (industry, etc.).
 */
function answerToEvidence(question: Question, answer: Answer): Evidence | null {
  if (question.controlId === null) return null;
  if (answer.kind === 'free_text') return null;

  const questionnaireAnswer =
    answer.kind === 'boolean'
      ? { kind: 'boolean' as const, value: answer.value }
      : answer.kind === 'choice'
        ? { kind: 'choice' as const, value: answer.value }
        : answer.kind === 'multi_choice'
          ? { kind: 'multi_choice' as const, values: answer.values }
          : answer.kind === 'numeric_range'
            ? { kind: 'numeric_range' as const, value: answer.value }
            : { kind: 'idk' as const };

  return {
    source: 'questionnaire',
    question_id: question.id,
    answer: questionnaireAnswer,
  };
}
