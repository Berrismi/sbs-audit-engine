// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { ConnectionLike, ProgressListener, QueryResult, SoqlQueryDef } from '../types';

export async function executeSoqlQuery(
  connection: ConnectionLike,
  query: SoqlQueryDef,
): Promise<QueryResult> {
  if (query.appliesWhen) {
    const applies = await query.appliesWhen(connection);
    if (!applies) {
      return { kind: 'skipped', query, reason: 'applies_when_false' };
    }
  }

  try {
    const result = await connection.query(query.soql);
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
  const results: QueryResult[] = [];
  for (const query of queries) {
    onProgress?.({ type: 'query_start', query });
    const result = await executeSoqlQuery(connection, query);
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
