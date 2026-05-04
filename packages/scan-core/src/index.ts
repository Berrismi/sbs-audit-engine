// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// @hellomavens/security-review-for-salesforce-scan-core public entrypoint.
//
// One function: `collectEvidence`. Takes a Salesforce ConnectionLike + a
// subject id, runs the SOQL bundle (and, in later blocks, the Health Check
// API + Code Analyzer subprocess), assembles the result into an
// EvidenceBundle the engine can score, and returns both the bundle (for
// engine.score) + the raw QueryResult[] (for diagnostics + the report
// appendix).

import type { EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import { assembleEvidenceBundle } from './assemble';
import { executeSoqlBundle } from './soql/executor';
import { DEFAULT_SOQL_QUERIES } from './soql/queries';
import type { CollectEvidenceOptions, QueryResult } from './types';

export interface ScanResult {
  bundle: EvidenceBundle;
  queryResults: readonly QueryResult[];
}

export async function collectEvidence(opts: CollectEvidenceOptions): Promise<ScanResult> {
  const sourceAllowed = (source: 'soql' | 'health_check_api' | 'code_analyzer'): boolean =>
    !opts.onlySources || opts.onlySources.includes(source);

  let queryResults: QueryResult[] = [];

  if (sourceAllowed('soql')) {
    const queries = opts.soqlQueries ?? DEFAULT_SOQL_QUERIES;
    queryResults = await executeSoqlBundle(opts.connection, queries, opts.onProgress);
  }

  // Health Check API (Block C) + Code Analyzer (Block D) plug in here.

  const bundle = assembleEvidenceBundle({
    subjectId: opts.subjectId,
    queryResults,
  });

  return { bundle, queryResults };
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
