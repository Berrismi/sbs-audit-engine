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
import { runCodeAnalyzer, type CodeAnalyzerExecution } from './code-analyzer/runner';
import { fetchHealthCheck, type HealthCheckResult } from './health-check/client';
import { fetchLimits, type LimitsResult } from './limits/client';
import { fetchMetadata, type MetadataFetchResult } from './metadata/client';
import { DEFAULT_METADATA_PROBES } from './metadata/probes';
import { executeSoqlBundle } from './soql/executor';
import { DEFAULT_SOQL_QUERIES } from './soql/queries';
import type { CollectEvidenceOptions, QueryResult } from './types';

export interface ScanResult {
  bundle: EvidenceBundle;
  queryResults: readonly QueryResult[];
  healthCheck?: HealthCheckResult;
  codeAnalyzer?: CodeAnalyzerExecution;
  limits?: LimitsResult;
  metadata?: MetadataFetchResult;
}

export async function collectEvidence(opts: CollectEvidenceOptions): Promise<ScanResult> {
  const sourceAllowed = (
    source: 'soql' | 'health_check_api' | 'code_analyzer' | 'limits_rest_api' | 'metadata_api',
  ): boolean => !opts.onlySources || opts.onlySources.includes(source);

  const emit = opts.onProgress;
  // Helper: time a phase, bracket it with phase_start / phase_done events
  // so consumers can render progress between SOQL and the silent sources
  // (health_check_api, limits_rest_api, metadata_api, code_analyzer).
  const runPhase = async <T>(
    source: 'soql' | 'health_check_api' | 'code_analyzer' | 'limits_rest_api' | 'metadata_api',
    fn: () => Promise<T>,
  ): Promise<T> => {
    emit?.({ type: 'phase_start', source });
    const start = Date.now();
    const result = await fn();
    emit?.({ type: 'phase_done', source, durationMs: Date.now() - start });
    return result;
  };

  let queryResults: QueryResult[] = [];
  let healthCheck: HealthCheckResult | undefined;
  let limits: LimitsResult | undefined;
  let metadata: MetadataFetchResult | undefined;

  if (sourceAllowed('soql')) {
    const queries = opts.soqlQueries ?? DEFAULT_SOQL_QUERIES;
    queryResults = await runPhase('soql', () =>
      executeSoqlBundle(opts.connection, queries, opts.onProgress),
    );
  }

  if (sourceAllowed('health_check_api')) {
    healthCheck = await runPhase('health_check_api', () => fetchHealthCheck(opts.connection));
  }

  if (sourceAllowed('limits_rest_api')) {
    limits = await runPhase('limits_rest_api', () => fetchLimits(opts.connection));
  }

  if (sourceAllowed('metadata_api')) {
    const probes = opts.metadataProbes ?? DEFAULT_METADATA_PROBES;
    if (probes.length > 0) {
      metadata = await runPhase('metadata_api', () =>
        fetchMetadata(opts.connection, probes, opts.onProgress),
      );
    } else {
      emit?.({ type: 'phase_skipped', source: 'metadata_api', reason: 'no_probes_configured' });
    }
  }

  let codeAnalyzer: CodeAnalyzerExecution | undefined;
  if (sourceAllowed('code_analyzer') && opts.codeAnalyzer) {
    codeAnalyzer = await runPhase('code_analyzer', () => runCodeAnalyzer(opts.codeAnalyzer!));
  }

  const bundle = assembleEvidenceBundle({
    subjectId: opts.subjectId,
    queryResults,
    ...(healthCheck && { healthCheck }),
    ...(codeAnalyzer && { codeAnalyzer }),
    ...(limits && { limits }),
    ...(metadata && { metadata }),
  });

  return {
    bundle,
    queryResults,
    ...(healthCheck && { healthCheck }),
    ...(codeAnalyzer && { codeAnalyzer }),
    ...(limits && { limits }),
    ...(metadata && { metadata }),
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
export {
  runCodeAnalyzer,
  type CodeAnalyzerExecution,
  type CodeAnalyzerSpawner,
  type RunCodeAnalyzerOptions,
  type SubprocessResult,
  type TmpdirManager,
} from './code-analyzer/runner';
export { makeExecaCodeAnalyzerSpawner } from './code-analyzer/spawner';
export { makeNodeTmpdirManager } from './code-analyzer/tmpdir';
export { parseCodeAnalyzerOutput } from './code-analyzer/parse';
export { fetchLimits, type LimitEntry, type LimitsResult } from './limits/client';
export {
  fetchMetadata,
  prioritizeProfileNames,
  type MetadataFetchResult,
  type MetadataFetchTypeResult,
  type MetadataProbe,
} from './metadata/client';
export { DEFAULT_METADATA_PROBES } from './metadata/probes';
