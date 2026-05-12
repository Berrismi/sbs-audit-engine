// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { RunCodeAnalyzerOptions } from './code-analyzer/runner';
import type { MetadataProbe } from './metadata/client';

/**
 * Structural subset of @salesforce/core's Connection that scan-core depends
 * on. Defining it here (rather than importing `Connection` from
 * @salesforce/core) keeps scan-core test-fast (no need to construct a real
 * Connection in unit tests) and lets the plugin pass either a real
 * Connection or a thin adapter.
 */
export interface SoqlQueryResponse {
  records: Record<string, unknown>[];
  totalSize: number;
  done: boolean;
}

export interface ConnectionLike {
  query(soql: string): Promise<SoqlQueryResponse>;
  /** Describe a regular sObject. Used by `appliesWhen` predicates to gate on
   *  field/object availability. Optional in the structural type so tests that
   *  only exercise `query()` paths don't have to provide it. */
  describeSObject?(name: string): Promise<DescribeSObjectResult>;
  /** Tooling API namespace. Optional in the structural type so tests don't
   * have to provide it when they only exercise the regular query() path.
   * The real @salesforce/core Connection always has it. */
  tooling?: {
    query(soql: string): Promise<SoqlQueryResponse>;
    describeSObject?(name: string): Promise<DescribeSObjectResult>;
  };
  /** Issue a REST GET against a Salesforce path (e.g., '/services/data/v60.0/limits').
   * Returns parsed JSON. Optional in the structural type so SOQL-only tests
   * don't have to provide it; the real @salesforce/core Connection always
   * has it (delegates to jsforce). Used by the limits-rest-api evidence
   * source. */
  request?<T = unknown>(url: string): Promise<T>;
  /** Metadata API namespace. Optional in the structural type so SOQL-only
   * tests don't have to provide it; the real @salesforce/core Connection
   * always has it (delegates to jsforce.metadata). Used by the metadata_api
   * evidence source (Phase 3c Track B). The two methods we need are
   * `list` (per-type fullName inventory) and `read` (retrieve N records by
   * type + fullNames). The full jsforce MetadataApi has many more methods
   * (create/update/delete/deploy/retrieve) — they are intentionally NOT
   * declared here so scan-core can't accidentally mutate org config. */
  metadata?: {
    list(query: { type: string; folder?: string }): Promise<MetadataFileProperties[]>;
    read<T = unknown>(type: string, fullNames: string | string[]): Promise<T | T[]>;
  };
}

/**
 * Subset of jsforce's `MetadataFileProperties` that scan-core uses. The
 * actual jsforce shape includes createdDate, lastModifiedDate, createdById,
 * etc — kept out of this declaration so the structural type stays minimal
 * and tests can fake it with `{ fullName, type }`.
 */
export interface MetadataFileProperties {
  fullName: string;
  type: string;
  /** Salesforce internal id; not stable across orgs. Optional in structural
   * type for ergonomics; jsforce always populates it. */
  id?: string;
}

/**
 * Why a query was skipped at predicate time. Stays a string union (not enum)
 * so it round-trips through JSON without coercion and can be widened later
 * without forcing consumers to update.
 */
export type SkipReason = 'applies_when_false' | 'object_unavailable' | 'field_unavailable';

/**
 * Result of an `appliesWhen` predicate. Discriminated union: `applies: true`
 * means run the query; `applies: false` carries the reason for telemetry +
 * progress UI surfacing.
 */
export type AppliesWhenResult = { applies: true } | { applies: false; reason: SkipReason };

export type AppliesWhenFn = (
  connection: ConnectionLike,
  ctx: AppliesWhenContext,
) => Promise<AppliesWhenResult>;

/**
 * Per-bundle execution context passed to `appliesWhen` predicates. Carries
 * the describe cache so a single object referenced by N queries is only
 * described once per scan.
 */
export interface AppliesWhenContext {
  describeCache: Map<string, Promise<DescribeSObjectResult>>;
  toolingDescribeCache: Map<string, Promise<DescribeSObjectResult>>;
}

/**
 * Minimal structural shape of a Salesforce describeSObject response. We only
 * care about whether the object/field exists, not the full describe payload
 * (which is large and noisy in tests). Real `Connection.describeSObject`
 * returns a superset of this — structural typing accepts it.
 */
export interface DescribeSObjectResult {
  name: string;
  fields: ReadonlyArray<{ name: string }>;
}

/**
 * One SOQL query in the scan bundle. Each query maps to one (or more) SBS
 * controls; the engine's evaluators in Block E will consume the evidence by
 * looking up the control_id on the QueryResult shape we emit.
 */
export interface SoqlQueryDef {
  /** Stable id for this query within the bundle (used as the React key in
   * progress UIs and in the evidence assembler's lookups). */
  id: string;
  /** SBS control(s) this query produces evidence for. Most queries map to
   * one control; some (e.g. user enumeration) feed several evaluators. */
  controlIds: readonly string[];
  /** The SOQL itself. Plain string — no parameter substitution; build
   * dynamic queries by composing strings before adding to the bundle. */
  soql: string;
  /** Human-readable label surfaced in progress events + report appendix. */
  label: string;
  /** 'regular' (default) routes through `connection.query`. 'tooling' routes
   *  through `connection.tooling.query` for Tooling-API-only entities like
   *  RemoteProxy, ConnectedApplication, ApexClass, etc. */
  source?: 'regular' | 'tooling';
  /** Optional predicate evaluated before the query runs. When it returns
   *  `applies: false`, the query is reported as `kind: 'skipped'` with the
   *  predicate's `reason`. Receives a context carrying a per-bundle describe
   *  cache so multiple queries against the same object share one describe call. */
  appliesWhen?: AppliesWhenFn;
}

/**
 * Result of executing one SoqlQueryDef. A discriminated union so consumers
 * can branch cleanly without optional-field gymnastics.
 */
export type QueryResult =
  | { kind: 'ok'; query: SoqlQueryDef; rows: Record<string, unknown>[] }
  | { kind: 'skipped'; query: SoqlQueryDef; reason: SkipReason }
  | { kind: 'failed'; query: SoqlQueryDef; error: { message: string; cause?: string } };

/**
 * Lifecycle events emitted by the scan executor. Subscribe via the
 * `onProgress` option to collectEvidence.
 */
export type EvidenceSourcePhase =
  | 'soql'
  | 'health_check_api'
  | 'limits_rest_api'
  | 'metadata_api'
  | 'code_analyzer';

export type ProgressEvent =
  | { type: 'phase_start'; source: EvidenceSourcePhase }
  | { type: 'phase_done'; source: EvidenceSourcePhase; durationMs: number }
  | { type: 'phase_skipped'; source: EvidenceSourcePhase; reason: string }
  | { type: 'query_start'; query: SoqlQueryDef }
  | { type: 'query_ok'; query: SoqlQueryDef; rowCount: number }
  | { type: 'query_skipped'; query: SoqlQueryDef; reason: SkipReason }
  | { type: 'query_failed'; query: SoqlQueryDef; error: { message: string } }
  | {
      type: 'metadata_probe_start';
      probeId: string;
      probeType: string;
      index: number;
      total: number;
    }
  | {
      type: 'metadata_probe_done';
      probeId: string;
      probeType: string;
      index: number;
      total: number;
      durationMs: number;
      recordsRetrieved: number;
    };

export type ProgressListener = (event: ProgressEvent) => void;

/** Options accepted by collectEvidence(). */
export interface CollectEvidenceOptions {
  connection: ConnectionLike;
  /** Subject id (audit subject) — copied through to the EvidenceBundle. */
  subjectId: string;
  /** Restrict which evidence sources to collect. Defaults to all available
   * sources. SOQL + Health Check API + Limits REST API + Metadata API run
   * with just a Connection; Code Analyzer also requires the `codeAnalyzer`
   * option to be set. */
  onlySources?: readonly (
    | 'soql'
    | 'health_check_api'
    | 'code_analyzer'
    | 'limits_rest_api'
    | 'metadata_api'
  )[];
  /** Subscribe to per-query lifecycle events. */
  onProgress?: ProgressListener;
  /** Override the default SOQL query bundle (mainly for tests). */
  soqlQueries?: readonly SoqlQueryDef[];
  /** Override the default Metadata API probe registry (mainly for tests).
   * When unset, scan-core uses `DEFAULT_METADATA_PROBES`. An empty array
   * skips Metadata API collection without disabling the source. */
  metadataProbes?: readonly MetadataProbe[];
  /** Code Analyzer options (alias + spawner + tmpdir). When unset, the
   * code_analyzer source is skipped even if it's in onlySources. The
   * plugin (Block A's run command) wires the production execa spawner +
   * node fs tmpdir here; tests pass fakes. */
  codeAnalyzer?: RunCodeAnalyzerOptions;
}
