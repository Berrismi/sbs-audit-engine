// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Public entrypoint for @hellomavens/sbs-engine.
//
// Phase 3 ships:
//   - All 42 control evaluators (questionnaire-evidence path)
//   - score() — top-level scoring entrypoint (EvidenceBundle → ScoredReport)
//   - Category + overall scoring math; risk-grade A/B/C/D/F with the
//     "any critical fail caps grade at C" rule
//   - OWASP Top 10 + HIPAA + SOC 2 + ISO 27001 enrichments per control
//
// Phase 5 will add SOQL / Code Analyzer / Health Check evidence paths
// to individual evaluators alongside the consultant CLI.

export { ENGINE_VERSION, score } from './score';
export { EVALUATOR_REGISTRY } from './evaluator-registry';

export type {
  Control,
  ControlLibrary,
  ControlSource,
  ControlEnrichments,
  CategoryPrefix,
  RiskLevel,
  RemediationScope,
  Evidence,
  EvidenceBundle,
  EvidenceSource,
  EvidenceConfidence,
  QuestionnaireAnswer,
  CodeAnalyzerFinding,
  HealthCheckSetting,
  Evaluator,
  EvaluatorInput,
  EvaluatorResult,
  EvaluatorStatus,
  ControlScoreResult,
  CategoryScoreOutput,
  RiskGrade,
  ScoredReport,
} from './types';

export { evaluate as evaluateAcs004 } from './evaluators/acs-004';
export {
  categoryScore,
  overallScore,
  riskGrade,
  inconclusivePercent,
  type CategoryWeightInput,
} from './scoring';
