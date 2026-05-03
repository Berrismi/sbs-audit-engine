// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Internal helper for boolean-attestation evaluators (Phase 3).
//
// Every SBS v0.4.1 questionnaire question for a scored control is `kind:
// 'boolean'` (verified at registry construction). The pattern is identical
// for all of them: read the questionnaire answer, map Yes/No/IDK to
// pass/fail/inconclusive, and degrade gracefully when no evidence is
// present.
//
// SOQL / scan evidence variants are added per-control in Phase 5 alongside
// the consultant CLI; until then this helper covers every Phase 3
// questionnaire-only evaluator.
//
// Underscore prefix => not exported through the package index. Per-control
// files are the public surface.

import type { Evaluator, Evidence, EvaluatorResult } from '../types';

export interface AttestationConfig {
  /** Questionnaire question id this evaluator consumes (e.g., 'Q-ACS-001'). */
  questionId: string;
  /** Plain-English finding when the respondent attests Yes. */
  passFinding: string;
  /** Plain-English finding when the respondent attests No. */
  failFinding: string;
}

/**
 * Build a questionnaire-only attestation evaluator. Pure: same input → same
 * output. Never throws; degrades to `inconclusive` when no relevant evidence
 * is present or when the answer shape is unexpected.
 */
export function attestationEvaluator(config: AttestationConfig): Evaluator {
  return ({ evidence }) => {
    const questionnaire = evidence.find(
      (e): e is Extract<Evidence, { source: 'questionnaire' }> =>
        e.source === 'questionnaire' && e.question_id === config.questionId,
    );

    if (!questionnaire) {
      return noEvidence(config.questionId);
    }

    const { answer } = questionnaire;

    if (answer.kind === 'idk') {
      return idk();
    }

    if (answer.kind === 'boolean') {
      return answer.value
        ? {
            status: 'pass',
            confidence: 'low',
            evidence_used: ['questionnaire'],
            findings: [config.passFinding],
          }
        : {
            status: 'fail',
            confidence: 'low',
            evidence_used: ['questionnaire'],
            findings: [config.failFinding],
          };
    }

    return unexpectedShape(config.questionId);
  };
}

function noEvidence(questionId: string): EvaluatorResult {
  return {
    status: 'inconclusive',
    confidence: 'low',
    evidence_used: [],
    findings: [
      `No evidence available for ${questionId}. Run a consultant scan or complete the questionnaire to score this control.`,
    ],
  };
}

function idk(): EvaluatorResult {
  return {
    status: 'inconclusive',
    confidence: 'low',
    evidence_used: ['questionnaire'],
    findings: ['Respondent answered "I don\'t know." An evidence-based scan would resolve this.'],
  };
}

function unexpectedShape(questionId: string): EvaluatorResult {
  return {
    status: 'inconclusive',
    confidence: 'low',
    evidence_used: ['questionnaire'],
    findings: [`Unexpected answer shape for ${questionId}; cannot score.`],
  };
}
