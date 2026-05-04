// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { fetchHealthCheck } from '../../src/health-check/client';
import type { ConnectionLike } from '../../src/types';

describe('fetchHealthCheck', () => {
  const okTooling: ConnectionLike = {
    query: async () => ({ records: [], totalSize: 0, done: true }),
    tooling: {
      query: async (soql) => {
        if (soql.includes('SecurityHealthCheck ')) {
          return { records: [{ Score: 75 }], totalSize: 1, done: true };
        }
        // Risks query
        return {
          records: [
            {
              RiskType: 'Session Settings',
              Setting: 'Session timeout value',
              OrgValue: '8 hours',
              StandardValue: '15 minutes',
            },
            {
              RiskType: 'Password Policies',
              Setting: 'Minimum password length',
              OrgValue: '5',
              StandardValue: '8',
            },
          ],
          totalSize: 2,
          done: true,
        };
      },
    },
  };

  it('returns ok with riskScore + high-risk settings when tooling.query succeeds', async () => {
    const result = await fetchHealthCheck(okTooling);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.riskScore).toBe(75);
      expect(result.highRiskSettings).toHaveLength(2);
      expect(result.highRiskSettings[0]).toEqual({
        name: 'Session Settings',
        setting: 'Session timeout value',
        orgValue: '8 hours',
        recommended: '15 minutes',
      });
    }
  });

  it('returns unsupported when the connection has no tooling namespace', async () => {
    const noTooling: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
    };

    const result = await fetchHealthCheck(noTooling);

    expect(result.kind).toBe('unsupported');
    if (result.kind === 'unsupported') {
      expect(result.reason).toBe('no_tooling_namespace');
    }
  });

  it('returns failed when tooling.query throws (e.g., user lacks View Setup and Configuration)', async () => {
    const errTooling: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async () => {
          throw new Error('INSUFFICIENT_ACCESS_OR_READONLY');
        },
      },
    };

    const result = await fetchHealthCheck(errTooling);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toContain('INSUFFICIENT_ACCESS');
    }
  });

  it('treats missing SecurityHealthCheck overall record as riskScore=0 (no rows is OK)', async () => {
    const noOverall: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async (soql) => {
          if (soql.includes('SecurityHealthCheck ')) {
            return { records: [], totalSize: 0, done: true };
          }
          return { records: [], totalSize: 0, done: true };
        },
      },
    };

    const result = await fetchHealthCheck(noOverall);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.riskScore).toBe(0);
      expect(result.highRiskSettings).toEqual([]);
    }
  });

  it('coerces stringly-typed Score to a number (Salesforce returns "66" in some orgs)', async () => {
    const stringScore: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async (soql) => {
          if (soql.includes('SecurityHealthCheck ')) {
            return { records: [{ Score: '66' }], totalSize: 1, done: true };
          }
          return { records: [], totalSize: 0, done: true };
        },
      },
    };

    const result = await fetchHealthCheck(stringScore);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.riskScore).toBe(66);
      expect(typeof result.riskScore).toBe('number');
    }
  });

  it('coerces missing risk-row fields to empty strings (defensive against API drift)', async () => {
    const partialFields: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async (soql) => {
          if (soql.includes('SecurityHealthCheck ')) {
            return { records: [{ Score: 50 }], totalSize: 1, done: true };
          }
          // Risk row with every field absent — should not crash + should
          // produce a HealthCheckSetting with empty strings.
          return { records: [{}], totalSize: 1, done: true };
        },
      },
    };

    const result = await fetchHealthCheck(partialFields);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.highRiskSettings).toEqual([
        { name: '', setting: '', orgValue: '', recommended: '' },
      ]);
    }
  });

  it('returns failed with non-Error message when tooling.query throws a string', async () => {
    const stringErr: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
      tooling: {
        query: async () => {
          throw 'string-shaped error';
        },
      },
    };

    const result = await fetchHealthCheck(stringErr);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toBe('string-shaped error');
    }
  });
});
