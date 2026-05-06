// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { Evidence, EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import type { CodeAnalyzerExecution } from './code-analyzer/runner';
import type { HealthCheckResult } from './health-check/client';
import type { LimitsResult } from './limits/client';
import type { QueryResult } from './types';

export interface AssembleOptions {
  subjectId: string;
  queryResults: readonly QueryResult[];
  /** Health Check result, if collected. Omitted (or unsupported/failed) →
   * no health_check_api Evidence variant in the bundle (engine treats
   * absence as inconclusive). */
  healthCheck?: HealthCheckResult;
  /** Code Analyzer execution result, if run. Omitted (or failed) → no
   * code_analyzer Evidence variant in the bundle. */
  codeAnalyzer?: CodeAnalyzerExecution;
  /** Limits REST API result, if collected. Omitted (or unsupported/failed) →
   * no limits_rest_api Evidence variant in the bundle. */
  limits?: LimitsResult;
  /** Injectable clock for deterministic testing. Defaults to `() => new Date()`. */
  now?: () => Date;
}

export function assembleEvidenceBundle(opts: AssembleOptions): EvidenceBundle {
  const now = opts.now ?? (() => new Date());

  const soqlEvidence: Evidence[] = opts.queryResults
    .filter((r): r is Extract<QueryResult, { kind: 'ok' }> => r.kind === 'ok')
    .map((r) => ({
      source: 'soql',
      query: r.query.soql,
      query_id: r.query.id,
      rows: r.rows,
    }));

  const healthCheckEvidence: Evidence[] =
    opts.healthCheck?.kind === 'ok'
      ? [
          {
            source: 'health_check_api',
            risk_score: opts.healthCheck.riskScore,
            // Engine's wire-format `name` is the human-readable setting label
            // (e.g., "Session timeout value"). scan-core's HealthCheckSetting
            // tracks the risk category in `name` (HIGH_RISK / MEDIUM_RISK /
            // MEETS_STANDARD) and the actual label in `setting`. Map so the
            // wire format gets the label.
            high_risk: opts.healthCheck.highRiskSettings.map((s) => ({
              name: s.setting || s.name,
              value: s.orgValue,
              recommended: s.recommended,
            })),
          },
        ]
      : [];

  const codeAnalyzerEvidence: Evidence[] =
    opts.codeAnalyzer?.kind === 'ok'
      ? [
          {
            source: 'code_analyzer',
            engine: opts.codeAnalyzer.engine,
            findings: opts.codeAnalyzer.findings,
          },
        ]
      : [];

  const limitsEvidence: Evidence[] =
    opts.limits?.kind === 'ok'
      ? [
          {
            source: 'limits_rest_api',
            api_version: opts.limits.apiVersion,
            limits: opts.limits.limits,
          },
        ]
      : [];

  return {
    subject_id: opts.subjectId,
    collected_at: now().toISOString(),
    evidence: [...soqlEvidence, ...healthCheckEvidence, ...codeAnalyzerEvidence, ...limitsEvidence],
  };
}
