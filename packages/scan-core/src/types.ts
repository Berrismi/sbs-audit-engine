// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

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
  /** Tooling API namespace. Optional in the structural type so tests don't
   * have to provide it when they only exercise the regular query() path.
   * The real @salesforce/core Connection always has it. */
  tooling?: {
    query(soql: string): Promise<SoqlQueryResponse>;
  };
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
  /** Optional predicate that, when present and returning false, marks the
   * query as `skipped` (engine will treat as `na`, not `inconclusive`).
   * Use for queries that depend on optional Salesforce features (e.g.,
   * Communities, Event Monitoring). */
  appliesWhen?: (connection: ConnectionLike) => Promise<boolean>;
}

/**
 * Result of executing one SoqlQueryDef. A discriminated union so consumers
 * can branch cleanly without optional-field gymnastics.
 */
export type QueryResult =
  | {
      kind: 'ok';
      query: SoqlQueryDef;
      rows: Record<string, unknown>[];
    }
  | {
      kind: 'skipped';
      query: SoqlQueryDef;
      reason: 'applies_when_false';
    }
  | {
      kind: 'failed';
      query: SoqlQueryDef;
      error: { message: string; cause?: string };
    };

/**
 * Lifecycle events emitted by the scan executor. Subscribe via the
 * `onProgress` option to collectEvidence.
 */
export type ProgressEvent =
  | { type: 'query_start'; query: SoqlQueryDef }
  | { type: 'query_ok'; query: SoqlQueryDef; rowCount: number }
  | { type: 'query_skipped'; query: SoqlQueryDef; reason: 'applies_when_false' }
  | { type: 'query_failed'; query: SoqlQueryDef; error: { message: string } };

export type ProgressListener = (event: ProgressEvent) => void;

/** Options accepted by collectEvidence(). */
export interface CollectEvidenceOptions {
  connection: ConnectionLike;
  /** Subject id (audit subject) — copied through to the EvidenceBundle. */
  subjectId: string;
  /** Restrict which evidence sources to collect. Defaults to all available
   * sources. SOQL is the only source available in Block B. */
  onlySources?: readonly ('soql' | 'health_check_api' | 'code_analyzer')[];
  /** Subscribe to per-query lifecycle events. */
  onProgress?: ProgressListener;
  /** Override the default SOQL query bundle (mainly for tests). */
  soqlQueries?: readonly SoqlQueryDef[];
}
