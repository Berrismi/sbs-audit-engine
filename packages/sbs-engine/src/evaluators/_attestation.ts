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

import type { Evaluator, Evidence, EvaluatorResult, EvidenceSource } from '../types';

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
// Corroborating evaluator family (Phase 5 — Blocks E.2 / E.3 / alpha.13).
//
// For controls classified `cli_corroborating`: the questionnaire decides the
// pass/fail verdict, but a CLI-collected evidence source (Health Check API,
// Code Analyzer, Limits REST API, ...) raises confidence and surfaces
// observations alongside. Used by SECCONF-001/002 (HC), CODE-002 (CA), and
// MON-005 (Limits).
//
// Behavior across all corroborating sources is identical and parameterized
// by `source` + `observe` only:
// - Both questionnaire + CLI present: questionnaire verdict, confidence
//   bumps to 'high' (CLI corroborates), findings include both.
// - CLI only: inconclusive+high with observations + a prompt to gather
//   questionnaire input.
// - Questionnaire only: standard low-confidence attestation result.
// - Neither: standard no-evidence inconclusive.
//
// History: through alpha.12 this lived as 3 nearly-identical hand-rolled
// helpers. alpha.14 collapsed them into the generic
// `corroboratingEvaluator<S>` below. The 3 source-specific wrappers are kept
// as thin convenience functions so call-sites and the public API surface
// stay unchanged.
// ---------------------------------------------------------------------------

/**
 * EvidenceSource values that the corroborating helper supports. Excludes
 * `'questionnaire'` (it's the fallback, not a corroborator) and `'soql'`
 * (SOQL evidence has the pass/fail/inconclusive shape handled by
 * `cliAttestationEvaluator`, not the observe-only shape here).
 */
export type CorroboratingSource = Exclude<EvidenceSource, 'questionnaire' | 'soql'>;

/** Generic config for the corroborating helper. The `observe` callback's
 * evidence parameter is narrowed to the chosen source via discriminated-union
 * `Extract`. */
export interface CorroboratingConfig<S extends CorroboratingSource> extends AttestationConfig {
  source: S;
  observe: (evidence: Extract<Evidence, { source: S }>) => readonly string[];
}

/**
 * Generic corroborating-evidence evaluator. Source-specific wrappers below
 * are thin delegations to this. New cli_corroborating controls can either
 * call this directly (passing `source` + `observe`) or add a wrapper if
 * call-site ergonomics matter.
 */
export function corroboratingEvaluator<S extends CorroboratingSource>(
  config: CorroboratingConfig<S>,
): Evaluator {
  return (input) => {
    const { evidence } = input;
    const found = evidence.find(
      (e): e is Extract<Evidence, { source: S }> => e.source === config.source,
    );

    if (found) {
      const observations = config.observe(found);
      const baseResult = attestationEvaluator(config)(input);

      if (baseResult.evidence_used.includes('questionnaire')) {
        return {
          status: baseResult.status,
          confidence: 'high',
          evidence_used: ['questionnaire', config.source],
          findings: [...baseResult.findings, ...observations],
        };
      }

      return {
        status: 'inconclusive',
        confidence: 'high',
        evidence_used: [config.source],
        findings: [
          ...observations,
          'Process attestation is required to fully score this control. Complete the questionnaire or interview the customer.',
        ],
      };
    }

    return attestationEvaluator(config)(input);
  };
}

// Source-specific wrapper configs: same as the generic but with `source`
// pinned to the specific literal so callers get a sharper observe signature.

export interface CorroboratingHealthCheckConfig extends AttestationConfig {
  observe: (evidence: Extract<Evidence, { source: 'health_check_api' }>) => readonly string[];
}

export function corroboratingHealthCheckEvaluator(
  config: CorroboratingHealthCheckConfig,
): Evaluator {
  return corroboratingEvaluator<'health_check_api'>({ ...config, source: 'health_check_api' });
}

export interface CorroboratingCodeAnalyzerConfig extends AttestationConfig {
  observe: (evidence: Extract<Evidence, { source: 'code_analyzer' }>) => readonly string[];
}

export function corroboratingCodeAnalyzerEvaluator(
  config: CorroboratingCodeAnalyzerConfig,
): Evaluator {
  return corroboratingEvaluator<'code_analyzer'>({ ...config, source: 'code_analyzer' });
}

export interface CorroboratingLimitsApiConfig extends AttestationConfig {
  observe: (evidence: Extract<Evidence, { source: 'limits_rest_api' }>) => readonly string[];
}

export function corroboratingLimitsApiEvaluator(config: CorroboratingLimitsApiConfig): Evaluator {
  return corroboratingEvaluator<'limits_rest_api'>({ ...config, source: 'limits_rest_api' });
}
