// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { Evidence, EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import type { HealthCheckResult } from './health-check/client';
import type { QueryResult } from './types';

export interface AssembleOptions {
  subjectId: string;
  queryResults: readonly QueryResult[];
  /** Health Check result, if collected. Omitted (or unsupported/failed) →
   * no health_check_api Evidence variant in the bundle (engine treats
   * absence as inconclusive). */
  healthCheck?: HealthCheckResult;
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
      rows: r.rows,
    }));

  const healthCheckEvidence: Evidence[] =
    opts.healthCheck?.kind === 'ok'
      ? [
          {
            source: 'health_check_api',
            risk_score: opts.healthCheck.riskScore,
            high_risk: opts.healthCheck.highRiskSettings.map((s) => ({
              name: s.name,
              value: s.orgValue,
              recommended: s.recommended,
            })),
          },
        ]
      : [];

  return {
    subject_id: opts.subjectId,
    collected_at: now().toISOString(),
    evidence: [...soqlEvidence, ...healthCheckEvidence],
  };
}
