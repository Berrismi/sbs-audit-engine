// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Salesforce Limits REST API client. Calls `GET /services/data/v{N}/limits`
// and returns a normalized snapshot of the org's daily/hourly limit
// utilization. Used by SBS-MON-005 (and any future control whose
// audit_procedure references "current API usage against the limit").
//
// Requires the connected user to have basic API access (no special perm).
// The endpoint is universally available across Salesforce editions.

import type { ConnectionLike } from '../types';

export interface LimitEntry {
  /** Maximum allowed for the rolling window the limit applies to (typically
   * 24h or hourly). */
  max: number;
  /** Remaining capacity at scan time. `max - remaining` is the consumed amount. */
  remaining: number;
}

/**
 * Discriminated result for a Limits API call. `unsupported` fires when the
 * connection adapter has no `request()` method (typically a misconfigured
 * test double — real @salesforce/core Connections always have it). `failed`
 * fires when the request rejects (network error, auth issue, etc.).
 */
export type LimitsResult =
  | { kind: 'ok'; apiVersion: string; limits: Record<string, LimitEntry> }
  | { kind: 'unsupported'; reason: 'no_request_method' }
  | { kind: 'failed'; error: { message: string } };

/** Default Salesforce REST API version. Bumped when we want new fields from
 * newer API versions; currently aligned with stable @salesforce/core releases. */
const DEFAULT_API_VERSION = '60.0';

export async function fetchLimits(
  connection: ConnectionLike,
  apiVersion?: string,
): Promise<LimitsResult> {
  if (!connection.request) {
    return { kind: 'unsupported', reason: 'no_request_method' };
  }
  const v = apiVersion ?? DEFAULT_API_VERSION;
  try {
    const raw = await connection.request<Record<string, unknown>>(`/services/data/v${v}/limits`);
    const limits: Record<string, LimitEntry> = {};
    for (const [key, value] of Object.entries(raw)) {
      // Defensive parse: skip entries that don't have the expected shape.
      // Salesforce occasionally returns extra metadata fields alongside
      // limit entries; better to silently skip than to corrupt the snapshot.
      if (
        value &&
        typeof value === 'object' &&
        'Max' in value &&
        'Remaining' in value &&
        typeof (value as { Max: unknown }).Max === 'number' &&
        typeof (value as { Remaining: unknown }).Remaining === 'number'
      ) {
        const e = value as { Max: number; Remaining: number };
        limits[key] = { max: e.Max, remaining: e.Remaining };
      }
    }
    return { kind: 'ok', apiVersion: v, limits };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'failed', error: { message } };
  }
}
