// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// @hellomavens/security-review-for-salesforce-scan-core public entrypoint.
//
// One function: `collectEvidence`. Takes a Salesforce ConnectionLike + a
// subject id, runs evidence collection (SOQL bundle in Block B, Health
// Check API in Block C, Code Analyzer subprocess in Block D), assembles
// the result into an EvidenceBundle the engine can score, and returns
// both the bundle (for engine.score) + the raw QueryResult[] +
// HealthCheckResult (for diagnostics + the report appendix).

import type { EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import { assembleEvidenceBundle } from './assemble';
import { fetchHealthCheck, type HealthCheckResult } from './health-check/client';
import { executeSoqlBundle } from './soql/executor';
import { DEFAULT_SOQL_QUERIES } from './soql/queries';
import type { CollectEvidenceOptions, QueryResult } from './types';

export interface ScanResult {
  bundle: EvidenceBundle;
  queryResults: readonly QueryResult[];
  healthCheck?: HealthCheckResult;
}

export async function collectEvidence(opts: CollectEvidenceOptions): Promise<ScanResult> {
  const sourceAllowed = (source: 'soql' | 'health_check_api' | 'code_analyzer'): boolean =>
    !opts.onlySources || opts.onlySources.includes(source);

  let queryResults: QueryResult[] = [];
  let healthCheck: HealthCheckResult | undefined;

  if (sourceAllowed('soql')) {
    const queries = opts.soqlQueries ?? DEFAULT_SOQL_QUERIES;
    queryResults = await executeSoqlBundle(opts.connection, queries, opts.onProgress);
  }

  if (sourceAllowed('health_check_api')) {
    healthCheck = await fetchHealthCheck(opts.connection);
  }

  // Code Analyzer (Block D) plugs in here.

  const bundle = assembleEvidenceBundle({
    subjectId: opts.subjectId,
    queryResults,
    ...(healthCheck && { healthCheck }),
  });

  return {
    bundle,
    queryResults,
    ...(healthCheck && { healthCheck }),
  };
}

// Re-export the public type surface so consumers can import everything from
// the package root.
export type {
  CollectEvidenceOptions,
  ConnectionLike,
  ProgressEvent,
  ProgressListener,
  QueryResult,
  SoqlQueryDef,
} from './types';

export { DEFAULT_SOQL_QUERIES } from './soql/queries';
export type { HealthCheckResult, HealthCheckSetting } from './health-check/client';
