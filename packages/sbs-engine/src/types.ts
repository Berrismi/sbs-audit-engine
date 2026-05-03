// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

/**
 * SBS risk levels as published upstream.
 * Source: control-metadata/*.yaml `risk_level` field.
 */
export type RiskLevel = 'Critical' | 'High' | 'Moderate';

/**
 * SBS remediation scopes as published upstream.
 * Source: control-metadata/*.yaml `remediation.scope` field.
 *
 * - `org` — single org-level configuration change.
 * - `entity` — one task per noncompliant entity (User, Profile, ConnectedApp, ...).
 * - `mechanism` — implement tooling or automated process.
 * - `inventory` — establish and maintain a system of record.
 */
export type RemediationScope = 'org' | 'entity' | 'mechanism' | 'inventory';

/**
 * The 9 SBS category prefixes present at v0.4.1. May expand as SBS approaches 1.0
 * (FOUNDATIONS, FILE, MON expected to land in later versions).
 */
export type CategoryPrefix =
  | 'ACS'
  | 'AUTH'
  | 'CODE'
  | 'CPORTAL'
  | 'DATA'
  | 'DEP'
  | 'INT'
  | 'OAUTH'
  | 'SECCONF';

/**
 * A single SBS control as derived from the upstream YAML + markdown.
 * Stored in `data/controls.json` (CC BY-SA 4.0). Keep field names aligned with
 * upstream where possible; HelloMavens-added fields are explicitly prefixed
 * `hellomavens_*` so the borrowed/built boundary is visible at the data level.
 */
export interface Control {
  /** Upstream control ID, e.g. "SBS-ACS-004". */
  id: string;
  /** Category prefix derived from the ID (e.g., "ACS"). */
  category: CategoryPrefix;
  /** Title from the markdown heading, e.g. "Documented Justification for All Super Admin–Equivalent Users". */
  title: string;
  /** Upstream control statement (one or two sentences). */
  control_statement: string;
  /** Upstream long-form description. */
  description: string;
  /** Upstream risk badge. */
  risk_level: RiskLevel;
  /** Upstream risk narrative paragraph (the **Risk:** body). */
  risk_narrative: string;
  /** Upstream audit procedure as a list of numbered steps. */
  audit_procedure: string[];
  /** Upstream remediation as a list of numbered steps. */
  remediation_steps: string[];
  /** Upstream "Default Value" paragraph. */
  default_value: string;
  /** Upstream remediation metadata. */
  remediation: {
    scope: RemediationScope;
    /** Required when scope === 'entity'. */
    entity_type?: string;
  };
  /** Upstream task title template (mustache-style). */
  task_title_template: string;
  /** Provenance pointer back to upstream source. */
  sources: ControlSource[];
  /**
   * HelloMavens-added enrichments (mappings, weights, evaluator wiring).
   * Anything in this object is OUR contribution, not derived from SBS.
   */
  hellomavens_enrichments: ControlEnrichments;
}

export interface ControlSource {
  type: 'sbs';
  upstream_repo: string;
  upstream_ref: string;
  upstream_path: string;
}

export interface ControlEnrichments {
  /** Risk-tier weight used by our scoring algorithm. Derived from risk_level. */
  weight: number;
  /** OWASP Top 10 2021 categories this control mitigates. */
  owasp: readonly string[];
  /** Regulation citations relevant to this control. */
  regulations: {
    hipaa?: readonly string[];
    soc2?: readonly string[];
    iso27001?: readonly string[];
    gdpr?: readonly string[];
    ccpa?: readonly string[];
  };
  /** Path to the evaluator function file (relative to packages/sbs-engine/src). */
  evaluator?: string;
  /** Path to the remediation playbook markdown (relative to packages/sbs-engine). */
  playbook?: string;
}

/**
 * The full control library snapshot. Top-level metadata captures provenance
 * so every report can cite the exact SBS version it was scored against.
 */
export interface ControlLibrary {
  sbs_version: string;
  upstream_ref: string;
  upstream_sha: string;
  fetched_at: string;
  engine_version: string;
  controls: Control[];
}

// ---------------------------------------------------------------------------
// Evidence + evaluator types — designed to support multiple evidence sources
// per Checkpoint 0 §2 update 3 ("SBS is the base, not the ceiling").
// ---------------------------------------------------------------------------

export type EvaluatorStatus = 'pass' | 'fail' | 'na' | 'inconclusive';
export type EvidenceConfidence = 'low' | 'medium' | 'high';

export type EvidenceSource =
  | 'questionnaire'
  | 'soql'
  | 'code_analyzer'
  | 'health_check_api'
  | 'metadata_api';

/**
 * Tagged-union of evidence shapes the engine can score against. Adding a new
 * source means: add a new variant here, and any evaluator that needs it can
 * narrow on `source`. Existing evaluators continue to compile unchanged.
 */
export type Evidence =
  | { source: 'questionnaire'; question_id: string; answer: QuestionnaireAnswer }
  | { source: 'soql'; query: string; rows: Record<string, unknown>[] }
  | { source: 'code_analyzer'; engine: string; findings: CodeAnalyzerFinding[] }
  | { source: 'health_check_api'; risk_score: number; high_risk: HealthCheckSetting[] }
  | { source: 'metadata_api'; type: string; records: Record<string, unknown>[] };

export type QuestionnaireAnswer =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'choice'; value: string }
  | { kind: 'multi_choice'; values: readonly string[] }
  | { kind: 'numeric_range'; value: string }
  | { kind: 'idk' };

export interface CodeAnalyzerFinding {
  rule: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Low' | 'Info';
  file: string;
  line: number;
  message: string;
}

export interface HealthCheckSetting {
  name: string;
  value: string;
  recommended: string;
}

/**
 * Bundle of all evidence collected for a single audit subject. May contain
 * a mix of questionnaire and scan-derived evidence; evaluators pick the
 * highest-confidence source available and report which they used.
 */
export interface EvidenceBundle {
  subject_id: string;
  collected_at: string;
  evidence: Evidence[];
}

/**
 * Input passed to a single evaluator function. Includes the control being
 * evaluated plus any evidence relevant to it (filtered by the engine).
 */
export interface EvaluatorInput {
  control: Control;
  evidence: Evidence[];
}

/**
 * Output of a single evaluator function. Includes the resulting status,
 * any human-readable findings, and a confidence tag the report can surface.
 */
export interface EvaluatorResult {
  status: EvaluatorStatus;
  confidence: EvidenceConfidence;
  /** Source(s) the evaluator actually used to reach the verdict. */
  evidence_used: EvidenceSource[];
  /** Plain-English findings; surfaced verbatim in reports. */
  findings: string[];
}

/**
 * Function signature for any control evaluator. Pure: same input → same output.
 */
export type Evaluator = (input: EvaluatorInput) => EvaluatorResult;

// ---------------------------------------------------------------------------
// Scoring types — Phase 3
// ---------------------------------------------------------------------------

/**
 * Per-control scoring outcome. Carries enough metadata for the report viewer
 * to render the control row + the category aggregation logic to weight it.
 */
export interface ControlScoreResult {
  control_id: string;
  category: CategoryPrefix;
  risk_level: RiskLevel;
  /** Risk-tier weight: Critical=5, High=3, Moderate=2. */
  weight: number;
  status: EvaluatorStatus;
  confidence: EvidenceConfidence;
  evidence_used: EvidenceSource[];
  findings: string[];
}

/**
 * Aggregate score for a single SBS category.
 *
 * `score` is in 0..100. `passed_weight` and `total_weight` exclude controls
 * whose status is `inconclusive` or `na` — those don't count toward the
 * denominator (spec §8). When no in-scope controls exist (everything skipped
 * or inconclusive), `score` is `0` and the report viewer treats the category
 * as "not enough evidence to grade."
 */
export interface CategoryScoreOutput {
  category: CategoryPrefix;
  score: number;
  passed_weight: number;
  total_weight: number;
  pass_count: number;
  fail_count: number;
  inconclusive_count: number;
  na_count: number;
  /** True when every in-scope control in the category returned `inconclusive`. */
  is_all_inconclusive: boolean;
}

/** Letter grade displayed at the top of the report (spec §8). */
export type RiskGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Top-level scored report — the shape `score(EvidenceBundle)` returns and the
 * shape the app's `/audit/report/[id]` viewer renders.
 */
export interface ScoredReport {
  /** Overall 0..100, weighted across categories per spec §8. */
  overall_score: number;
  risk_grade: RiskGrade;
  /** Number of Critical-tier controls returning `fail` (drives the C-cap). */
  critical_fail_count: number;
  /**
   * Percentage of evaluated controls that returned `inconclusive`. Drives
   * the "X% of controls could not be evaluated" banner per spec §8.
   * Always shown when > 0.
   */
  inconclusive_percent: number;
  /** Per-category aggregates. */
  by_category: CategoryScoreOutput[];
  /** Per-control results, ordered by control_id. */
  control_results: ControlScoreResult[];
  /** SBS version + engine version snapshot, for report provenance. */
  sbs_version: string;
  engine_version: string;
}
