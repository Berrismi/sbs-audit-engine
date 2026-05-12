// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Format the respondent's questionnaire answer(s) for a given control, for
// inline display in the per-control sections of the HTML + Markdown reports.
//
// Why: when a control's verdict is backed by questionnaire evidence, the
// report otherwise only shows the canned rationale ("Respondent attests
// they cannot confirm..."). Users want to see what they actually answered
// so they can self-verify the auto-generated narrative.

import type {
  Answer,
  AnswerSet,
  Question,
  QuestionnaireRegistry,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

/**
 * Look up every questionnaire question that contributes to `controlId` and
 * return a display-friendly summary of each question's answer.
 *
 * Returns:
 * - An array of `{ questionText, formattedAnswer }` pairs when answers exist.
 * - An empty array when the control has no questionnaire-backed questions
 *   OR when no answers were collected (e.g. --no-questionnaire run).
 *
 * Renderers can check `result.length === 0` to decide whether to render
 * the respondent-answer row at all.
 */
export function formatRespondentAnswers(
  controlId: string,
  answers: AnswerSet,
  registry: QuestionnaireRegistry,
): ReadonlyArray<{ questionText: string; formattedAnswer: string }> {
  const questions = registry.questions.filter((q) => q.controlId === controlId);
  if (questions.length === 0) return [];

  const out: { questionText: string; formattedAnswer: string }[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined) continue;
    out.push({ questionText: q.text, formattedAnswer: formatAnswer(a, q) });
  }
  return out;
}

/**
 * Convert a single Answer into a display string, using the question's option
 * labels when available (so "hipaa" renders as "HIPAA (US healthcare)" rather
 * than the raw value).
 */
export function formatAnswer(answer: Answer, question: Question): string {
  switch (answer.kind) {
    case 'idk':
      return "I don't know";
    case 'boolean':
      return answer.value ? 'Yes' : 'No';
    case 'free_text':
      return answer.value.trim() === '' ? '(empty)' : answer.value;
    case 'choice':
    case 'numeric_range': {
      const opt =
        question.kind === answer.kind
          ? question.options.find((o) => o.value === answer.value)
          : undefined;
      return opt?.label ?? answer.value;
    }
    case 'multi_choice': {
      if (answer.values.length === 0) return '(none selected)';
      if (question.kind !== 'multi_choice') return answer.values.join(', ');
      const labels = answer.values.map((v) => {
        const opt = question.options.find((o) => o.value === v);
        return opt?.label ?? v;
      });
      return labels.join(', ');
    }
  }
}
