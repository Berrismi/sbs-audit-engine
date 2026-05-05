// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type {
  AppliesWhenContext,
  ConnectionLike,
  ProgressListener,
  QueryResult,
  SoqlQueryDef,
} from '../types';

/**
 * Build a fresh AppliesWhenContext. `executeSoqlBundle` creates one and
 * threads it through every query so describes are shared across the bundle;
 * ad-hoc single-query callers can rely on the default and skip the ceremony.
 */
export function createAppliesWhenContext(): AppliesWhenContext {
  return {
    describeCache: new Map(),
    toolingDescribeCache: new Map(),
  };
}

export async function executeSoqlQuery(
  connection: ConnectionLike,
  query: SoqlQueryDef,
  ctx: AppliesWhenContext = createAppliesWhenContext(),
): Promise<QueryResult> {
  if (query.appliesWhen) {
    const result = await query.appliesWhen(connection, ctx);
    if (!result.applies) {
      return { kind: 'skipped', query, reason: result.reason };
    }
  }

  try {
    const target =
      query.source === 'tooling'
        ? connection.tooling
        : { query: connection.query.bind(connection) };

    if (!target) {
      return {
        kind: 'failed',
        query,
        error: {
          message: `Tooling API namespace unavailable — query '${query.id}' requires source: 'tooling' but connection.tooling is absent.`,
        },
      };
    }

    const result = await target.query(query.soql);
    return { kind: 'ok', query, rows: result.records };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'failed', query, error: { message } };
  }
}

export async function executeSoqlBundle(
  connection: ConnectionLike,
  queries: readonly SoqlQueryDef[],
  onProgress?: ProgressListener,
): Promise<QueryResult[]> {
  const ctx = createAppliesWhenContext();

  const results: QueryResult[] = [];
  for (const query of queries) {
    onProgress?.({ type: 'query_start', query });
    const result = await executeSoqlQuery(connection, query, ctx);
    results.push(result);
    if (result.kind === 'ok') {
      onProgress?.({ type: 'query_ok', query, rowCount: result.rows.length });
    } else if (result.kind === 'skipped') {
      onProgress?.({ type: 'query_skipped', query, reason: result.reason });
    } else {
      onProgress?.({ type: 'query_failed', query, error: { message: result.error.message } });
    }
  }
  return results;
}
