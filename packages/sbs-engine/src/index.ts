// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Public entrypoint for @hellomavens/sbs-engine.
//
// Phase 1 ships:
//   - Type definitions for the control library, evidence bundles, and evaluator results
//   - Reference evaluator for SBS-ACS-004
//
// Phase 3 will add:
//   - The other 41 evaluators
//   - score() — the top-level scoring entrypoint
//   - Risk-grade calculation (A/B/C/D/F + critical-fail-caps-at-C rule)

export const ENGINE_VERSION = '0.0.0-dev';

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
} from './types.ts';

export { evaluate as evaluateAcs004 } from './evaluators/acs-004.ts';
