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

// ---------------------------------------------------------------------------
// CLI-aware variant of attestationEvaluator (Phase 5 Block E).
//
// Same questionnaire fallback as attestationEvaluator, but checks for SOQL
// evidence first (matched by query_id). When SOQL is present, calls the
// caller-provided evaluator function with the rows; SOQL is ground-truth so
// confidence is `high` regardless of result.
// ---------------------------------------------------------------------------

export interface SoqlEvaluation {
  status: 'pass' | 'fail' | 'inconclusive';
  /** Plain-English findings to surface in the report. */
  findings: string[];
}

export interface CliAttestationConfig extends AttestationConfig {
  /** scan-core query id this evaluator consumes (e.g., 'acs-002-frozen-but-active-users'). */
  soqlQueryId: string;
  /** Pure function: rows → SoqlEvaluation. Never throws; degrade to inconclusive on bad data. */
  evaluateSoql: (rows: Record<string, unknown>[]) => SoqlEvaluation;
}

/**
 * Build an evaluator that prefers SOQL evidence (high confidence) and falls
 * back to questionnaire attestation (low confidence) when no matching SOQL
 * is present. Pure: same input → same output. Never throws.
 */
export function cliAttestationEvaluator(config: CliAttestationConfig): Evaluator {
  const baseAttestation = attestationEvaluator(config);
  return (input) => {
    const { evidence } = input;

    const soql = evidence.find(
      (e): e is Extract<Evidence, { source: 'soql' }> =>
        e.source === 'soql' && e.query_id === config.soqlQueryId,
    );

    if (soql) {
      const r = config.evaluateSoql(soql.rows);
      return {
        status: r.status,
        confidence: 'high',
        evidence_used: ['soql'],
        findings: r.findings,
      };
    }

    return baseAttestation(input);
  };
}
