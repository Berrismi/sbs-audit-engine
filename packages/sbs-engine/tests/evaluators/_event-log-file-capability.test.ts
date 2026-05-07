// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
  classifyTier,
  formatTypeBreakdown,
  parseEventLogCapability,
  spanDays,
} from '../../src/evaluators/_event-log-file-capability';

describe('parseEventLogCapability', () => {
  it('returns empty array when input is empty', () => {
    expect(parseEventLogCapability([])).toEqual([]);
  });

  it('drops rows missing EventType or with non-numeric count', () => {
    const result = parseEventLogCapability([
      { EventType: 'Login', cnt: 5, earliest: '2026-01-01', latest: '2026-01-31' },
      { cnt: 3 }, // missing EventType
      { EventType: 'Logout', cnt: 'oops' }, // non-numeric count
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.eventType).toBe('Login');
  });

  it('coerces string-typed count to number', () => {
    // Salesforce sometimes returns aggregate count as a number, sometimes as
    // a string depending on the connector — test both.
    const result = parseEventLogCapability([
      { EventType: 'Login', cnt: '12' },
      { EventType: 'Logout', cnt: 4 },
    ]);
    expect(result).toEqual([
      { eventType: 'Login', count: 12, earliest: undefined, latest: undefined },
      { eventType: 'Logout', count: 4, earliest: undefined, latest: undefined },
    ]);
  });

  it('sorts by EventType ascending for deterministic output', () => {
    const result = parseEventLogCapability([
      { EventType: 'Logout', cnt: 1 },
      { EventType: 'ApiTotalUsage', cnt: 1 },
      { EventType: 'Login', cnt: 1 },
    ]);
    expect(result.map((r) => r.eventType)).toEqual(['ApiTotalUsage', 'Login', 'Logout']);
  });
});

describe('spanDays', () => {
  it('returns 0 when either timestamp is missing', () => {
    expect(spanDays(undefined, '2026-01-01')).toBe(0);
    expect(spanDays('2026-01-01', undefined)).toBe(0);
  });

  it('returns 0 when timestamps are unparseable', () => {
    expect(spanDays('not-a-date', '2026-01-01')).toBe(0);
  });

  it('returns 1 for same-day earliest + latest (inclusive coverage)', () => {
    expect(spanDays('2026-04-15', '2026-04-15')).toBe(1);
  });

  it('counts days inclusively (earliest 2026-01-01 → latest 2026-01-31 = 31 days)', () => {
    expect(spanDays('2026-01-01', '2026-01-31')).toBe(31);
  });

  it('handles partial-day timestamps correctly', () => {
    expect(spanDays('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(2);
  });
});

describe('classifyTier', () => {
  it('returns no-activity for empty input', () => {
    expect(classifyTier([])).toBe('no-activity');
  });

  it('returns free-baseline when only Login/Logout/ApiTotalUsage are present', () => {
    expect(
      classifyTier([
        { eventType: 'Login', count: 5, earliest: undefined, latest: undefined },
        { eventType: 'ApiTotalUsage', count: 1, earliest: undefined, latest: undefined },
      ]),
    ).toBe('free-baseline');
  });

  it('returns add-on-likely if any non-baseline event type is observed', () => {
    expect(
      classifyTier([
        { eventType: 'Login', count: 5, earliest: undefined, latest: undefined },
        { eventType: 'ReportExport', count: 2, earliest: undefined, latest: undefined },
      ]),
    ).toBe('add-on-likely');
  });
});

describe('formatTypeBreakdown', () => {
  it('returns empty string for empty input', () => {
    expect(formatTypeBreakdown([])).toBe('');
  });

  it('formats one entry per type with count + day-span', () => {
    const out = formatTypeBreakdown([
      {
        eventType: 'Login',
        count: 12,
        earliest: '2026-01-01',
        latest: '2026-01-30',
      },
    ]);
    expect(out).toBe('Login (12 log(s), 30 day(s))');
  });

  it('caps at the first 5 (default topN) with +N more summary', () => {
    const summaries = Array.from({ length: 7 }, (_, i) => ({
      eventType: `Type${i}`,
      count: 1,
      earliest: '2026-01-01',
      latest: '2026-01-01',
    }));
    const out = formatTypeBreakdown(summaries);
    expect(out).toContain('Type0 (1 log(s), 1 day(s))');
    expect(out).toContain('Type4 (1 log(s), 1 day(s))');
    expect(out).not.toContain('Type5');
    expect(out).toContain('(+2 more event type(s))');
  });
});
