// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Shared parsing of the `event-log-file-capability` SOQL result set used
// by SBS-MON-001 + SBS-MON-002 + SBS-INT-004. The query GROUPs by EventType
// and returns one row per distinct event type with COUNT + MIN(LogDate) +
// MAX(LogDate). The shape is identical across all three controls; what
// differs is the interpretation.
//
// Underscore prefix => internal helper, not exported via the package index.

/** One per-EventType row from the capability query. */
export interface EventLogTypeSummary {
  eventType: string;
  count: number;
  earliest: string | undefined;
  latest: string | undefined;
}

/**
 * Parse the raw SOQL rows into a normalized EventLogTypeSummary[]. Drops
 * rows missing EventType or with non-numeric count. Deterministic order
 * (sorted by eventType ascending). Pure: same input → same output. Never
 * throws.
 */
export function parseEventLogCapability(
  rows: ReadonlyArray<Record<string, unknown>>,
): EventLogTypeSummary[] {
  const out: EventLogTypeSummary[] = [];
  for (const row of rows) {
    const eventType = typeof row['EventType'] === 'string' ? row['EventType'] : null;
    if (!eventType) continue;
    const cnt = row['cnt'];
    const count = typeof cnt === 'number' ? cnt : Number(cnt);
    if (!Number.isFinite(count)) continue;
    const earliest = typeof row['earliest'] === 'string' ? row['earliest'] : undefined;
    const latest = typeof row['latest'] === 'string' ? row['latest'] : undefined;
    out.push({ eventType, count, earliest, latest });
  }
  out.sort((a, b) => a.eventType.localeCompare(b.eventType));
  return out;
}

/**
 * Days observed between the earliest and latest LogDate for a single
 * EventType. Returns 0 when either timestamp is missing or unparseable.
 * Inclusive of both endpoints — `earliest === latest` returns 1 (one day
 * of coverage), not 0.
 */
export function spanDays(earliest: string | undefined, latest: string | undefined): number {
  if (!earliest || !latest) return 0;
  const e = Date.parse(earliest);
  const l = Date.parse(latest);
  if (!Number.isFinite(e) || !Number.isFinite(l)) return 0;
  // Inclusive day count: same-day = 1, +1 day = 2, etc.
  const diffMs = l - e;
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

/**
 * Formats the per-type capability rollup into a "EventA (3 logs, 2 days),
 * EventB (10 logs, 5 days)" string. Caps at the first `topN` types
 * (default 5) with a "+N more" tail when there are more.
 */
export function formatTypeBreakdown(
  summaries: ReadonlyArray<EventLogTypeSummary>,
  topN = 5,
): string {
  if (summaries.length === 0) return '';
  const named = summaries.slice(0, topN);
  const moreCount = Math.max(0, summaries.length - named.length);
  const namedClause = named
    .map((s) => `${s.eventType} (${s.count} log(s), ${spanDays(s.earliest, s.latest)} day(s))`)
    .join(', ');
  return moreCount > 0 ? `${namedClause} (+${moreCount} more event type(s))` : namedClause;
}

// Free-tier event types that Salesforce ships without the Event Monitoring
// add-on (Enterprise/Unlimited/Performance edition baseline). Logs from
// these types alone strongly suggest the org has no add-on; the presence of
// any other type strongly suggests the add-on is licensed.
export const FREE_TIER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'Login',
  'Logout',
  'ApiTotalUsage',
]);

/**
 * Returns 'free-baseline' if all observed event types are in the free
 * baseline set, 'add-on-likely' if any non-baseline types are observed,
 * or 'no-activity' if the summaries array is empty.
 */
export function classifyTier(
  summaries: ReadonlyArray<EventLogTypeSummary>,
): 'no-activity' | 'free-baseline' | 'add-on-likely' {
  if (summaries.length === 0) return 'no-activity';
  for (const s of summaries) {
    if (!FREE_TIER_EVENT_TYPES.has(s.eventType)) return 'add-on-likely';
  }
  return 'free-baseline';
}
