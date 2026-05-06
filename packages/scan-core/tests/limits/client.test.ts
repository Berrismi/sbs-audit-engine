// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import { fetchLimits } from '../../src/limits/client';
import type { ConnectionLike } from '../../src/types';

describe('fetchLimits', () => {
  it('returns ok with parsed limits when request resolves with the expected shape', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      request: vi.fn().mockResolvedValue({
        DailyApiRequests: { Max: 100000, Remaining: 95000 },
        DailyBulkApiBatches: { Max: 15000, Remaining: 14999 },
        HourlyAsyncReportRuns: { Max: 1200, Remaining: 1198 },
      }),
    };
    const result = await fetchLimits(conn);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.apiVersion).toBe('60.0');
      expect(result.limits['DailyApiRequests']).toEqual({ max: 100000, remaining: 95000 });
      expect(result.limits['DailyBulkApiBatches']).toEqual({ max: 15000, remaining: 14999 });
      expect(Object.keys(result.limits)).toHaveLength(3);
    }
  });

  it('returns unsupported when the connection has no request method', async () => {
    const conn: ConnectionLike = { query: vi.fn() };
    const result = await fetchLimits(conn);
    expect(result.kind).toBe('unsupported');
    if (result.kind === 'unsupported') {
      expect(result.reason).toBe('no_request_method');
    }
  });

  it('returns failed when request() rejects', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      request: vi.fn().mockRejectedValue(new Error('Network unreachable')),
    };
    const result = await fetchLimits(conn);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toBe('Network unreachable');
    }
  });

  it('skips entries that do not have the expected { Max, Remaining } shape', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      request: vi.fn().mockResolvedValue({
        DailyApiRequests: { Max: 100000, Remaining: 95000 },
        UnexpectedMetadataField: 'some-string',
        AnotherWeirdEntry: { not_max: 1 },
        PartiallyShapedEntry: { Max: 1000 }, // missing Remaining
      }),
    };
    const result = await fetchLimits(conn);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(Object.keys(result.limits)).toEqual(['DailyApiRequests']);
    }
  });

  it('uses the provided apiVersion when set', async () => {
    const requestSpy = vi.fn().mockResolvedValue({});
    const conn: ConnectionLike = { query: vi.fn(), request: requestSpy };
    const result = await fetchLimits(conn, '59.0');
    expect(requestSpy).toHaveBeenCalledWith('/services/data/v59.0/limits');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.apiVersion).toBe('59.0');
  });
});
