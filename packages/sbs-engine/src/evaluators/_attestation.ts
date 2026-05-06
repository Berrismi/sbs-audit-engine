// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Internal helper for boolean-attestation evaluators (Phase 3).
//
// Every SBS questionnaire question for a scored control is `kind:
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

// ---------------------------------------------------------------------------
// Corroborating Health Check evaluator (Phase 5 Block E.2).
//
// For controls classified `cli_corroborating`: questionnaire decides the
// pass/fail verdict, but Health Check evidence raises confidence + surfaces
// observations alongside. Used by SECCONF-001 and SECCONF-002 where the
// underlying control is process-shaped (deliberate baseline selection,
// repeatable review cadence) and Health Check API data corroborates without
// being decisive.
// ---------------------------------------------------------------------------

export interface CorroboratingHealthCheckConfig extends AttestationConfig {
  /** Pure function: given the health_check_api Evidence, return human-readable
   * observation strings to append to findings. Never throws. */
  observe: (evidence: Extract<Evidence, { source: 'health_check_api' }>) => readonly string[];
}

/**
 * Build an evaluator where Health Check evidence corroborates (not overrides)
 * the questionnaire verdict.
 *
 * Behavior:
 * - Both questionnaire + HC present: questionnaire decides verdict, confidence
 *   bumps to 'high' (HC corroborates), findings include both.
 * - HC only: returns inconclusive+high with observations, prompting the
 *   consultant to gather questionnaire input.
 * - Questionnaire only: standard low-confidence attestation result.
 * - Neither: standard no-evidence inconclusive.
 */
export function corroboratingHealthCheckEvaluator(
  config: CorroboratingHealthCheckConfig,
): Evaluator {
  return (input) => {
    const { evidence } = input;
    const hc = evidence.find(
      (e): e is Extract<Evidence, { source: 'health_check_api' }> =>
        e.source === 'health_check_api',
    );

    if (hc) {
      const observations = config.observe(hc);
      const baseResult = attestationEvaluator(config)(input);

      if (baseResult.evidence_used.includes('questionnaire')) {
        // Both present: questionnaire verdict, high confidence, combined findings.
        return {
          status: baseResult.status,
          confidence: 'high',
          evidence_used: ['questionnaire', 'health_check_api'],
          findings: [...baseResult.findings, ...observations],
        };
      }

      // HC only: inconclusive verdict but high confidence in the observation.
      return {
        status: 'inconclusive',
        confidence: 'high',
        evidence_used: ['health_check_api'],
        findings: [
          ...observations,
          'Process attestation is required to fully score this control. Complete the questionnaire or interview the customer.',
        ],
      };
    }

    // No HC: fall through to standard attestation behavior.
    return attestationEvaluator(config)(input);
  };
}

// ---------------------------------------------------------------------------
// Corroborating Code Analyzer evaluator (Phase 5 Block E.3).
//
// For controls where Code Analyzer findings INFORM but don't DECIDE the
// verdict (e.g., CODE-002 — the audit asks about CI pipeline configuration
// but Code Analyzer findings are circumstantial: many high-severity findings
// imply CI scanning isn't catching them, but absence of findings doesn't
// prove CI scanning IS in place). Same shape as corroboratingHealthCheckEvaluator
// above: questionnaire adjudicates the verdict, Code Analyzer findings
// raise confidence and add observations.
//
// Note: this helper is intentionally parallel to corroboratingHealthCheckEvaluator.
// Both share the same pattern (find evidence by source, fall back to
// attestation, surface observations when only CLI is present). The
// unification refactor — collapsing all three corroborating helpers into a
// generic `corroboratingEvaluator<S extends EvidenceSource>(...)` parameterized
// by source + observe — is now triggered (we're at the third source as of
// alpha.13's corroboratingLimitsApiEvaluator). Deferred to a follow-up PR
// because the discriminated-union narrowing on the observe callback is
// non-trivial in TypeScript and the parallel structure is easier to review
// in this PR alongside the new evidence variant.
// ---------------------------------------------------------------------------

export interface CorroboratingCodeAnalyzerConfig extends AttestationConfig {
  /** Pure function: given the code_analyzer Evidence, return human-readable
   * observation strings to append to findings. Never throws. */
  observe: (evidence: Extract<Evidence, { source: 'code_analyzer' }>) => readonly string[];
}

/**
 * Build an evaluator where Code Analyzer evidence corroborates (not overrides)
 * the questionnaire verdict.
 *
 * Behavior:
 * - Both questionnaire + Code Analyzer present: questionnaire decides verdict,
 *   confidence bumps to 'high', findings include both.
 * - Code Analyzer only: returns inconclusive+high with observations + a
 *   prompt to gather questionnaire input.
 * - Questionnaire only: standard low-confidence attestation result.
 * - Neither: standard no-evidence inconclusive.
 */
export function corroboratingCodeAnalyzerEvaluator(
  config: CorroboratingCodeAnalyzerConfig,
): Evaluator {
  return (input) => {
    const { evidence } = input;
    const ca = evidence.find(
      (e): e is Extract<Evidence, { source: 'code_analyzer' }> => e.source === 'code_analyzer',
    );

    if (ca) {
      const observations = config.observe(ca);
      const baseResult = attestationEvaluator(config)(input);

      if (baseResult.evidence_used.includes('questionnaire')) {
        return {
          status: baseResult.status,
          confidence: 'high',
          evidence_used: ['questionnaire', 'code_analyzer'],
          findings: [...baseResult.findings, ...observations],
        };
      }

      return {
        status: 'inconclusive',
        confidence: 'high',
        evidence_used: ['code_analyzer'],
        findings: [
          ...observations,
          'Process attestation is required to fully score this control. Complete the questionnaire or interview the customer.',
        ],
      };
    }

    return attestationEvaluator(config)(input);
  };
}

// ---------------------------------------------------------------------------
// Corroborating Limits REST API evaluator (Phase 5 / alpha.13).
//
// For controls where the Salesforce Limits REST API surfaces a quantitative
// signal but the audit's deciding question is process-level (alerting setup,
// IR plan, breach history). Used by SBS-MON-005. Same shape as
// corroboratingHealthCheckEvaluator + corroboratingCodeAnalyzerEvaluator —
// see the deferred-unification note above.
// ---------------------------------------------------------------------------

export interface CorroboratingLimitsApiConfig extends AttestationConfig {
  /** Pure function: given the limits_rest_api Evidence, return human-readable
   * observation strings to append to findings. Never throws. */
  observe: (evidence: Extract<Evidence, { source: 'limits_rest_api' }>) => readonly string[];
}

/**
 * Build an evaluator where Limits API evidence corroborates (not overrides)
 * the questionnaire verdict.
 *
 * Behavior:
 * - Both questionnaire + Limits API present: questionnaire decides verdict,
 *   confidence bumps to 'high', findings include both.
 * - Limits API only: returns inconclusive+high with observations + a prompt
 *   to gather questionnaire input.
 * - Questionnaire only: standard low-confidence attestation result.
 * - Neither: standard no-evidence inconclusive.
 */
export function corroboratingLimitsApiEvaluator(config: CorroboratingLimitsApiConfig): Evaluator {
  return (input) => {
    const { evidence } = input;
    const limits = evidence.find(
      (e): e is Extract<Evidence, { source: 'limits_rest_api' }> => e.source === 'limits_rest_api',
    );

    if (limits) {
      const observations = config.observe(limits);
      const baseResult = attestationEvaluator(config)(input);

      if (baseResult.evidence_used.includes('questionnaire')) {
        return {
          status: baseResult.status,
          confidence: 'high',
          evidence_used: ['questionnaire', 'limits_rest_api'],
          findings: [...baseResult.findings, ...observations],
        };
      }

      return {
        status: 'inconclusive',
        confidence: 'high',
        evidence_used: ['limits_rest_api'],
        findings: [
          ...observations,
          'Process attestation is required to fully score this control. Complete the questionnaire or interview the customer.',
        ],
      };
    }

    return attestationEvaluator(config)(input);
  };
}
