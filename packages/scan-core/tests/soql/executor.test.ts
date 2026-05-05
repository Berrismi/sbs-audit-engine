// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { executeSoqlQuery, executeSoqlBundle } from '../../src/soql/executor';
import type { ConnectionLike, ProgressEvent, SoqlQueryDef } from '../../src/types';

describe('executeSoqlQuery', () => {
  const okConnection: ConnectionLike = {
    query: async () => ({
      records: [{ Id: '00540000XXX', Name: 'Test User' }],
      totalSize: 1,
      done: true,
    }),
  };

  const baseQuery: SoqlQueryDef = {
    id: 'q-test',
    controlIds: ['SBS-ACS-001'],
    soql: 'SELECT Id, Name FROM User',
    label: 'Test query',
  };

  it('returns ok with rows when the query succeeds', async () => {
    const result = await executeSoqlQuery(okConnection, baseQuery);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.query).toBe(baseQuery);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ Id: '00540000XXX', Name: 'Test User' });
    }
  });

  it('returns skipped when appliesWhen predicate returns false (without running the query)', async () => {
    let queryWasCalled = false;
    const trackedConnection: ConnectionLike = {
      query: async () => {
        queryWasCalled = true;
        return { records: [], totalSize: 0, done: true };
      },
    };
    const queryWithPredicate: SoqlQueryDef = {
      ...baseQuery,
      appliesWhen: async () => ({ applies: false, reason: 'applies_when_false' }),
    };

    const result = await executeSoqlQuery(trackedConnection, queryWithPredicate);

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.reason).toBe('applies_when_false');
    }
    expect(queryWasCalled).toBe(false);
  });

  it('runs the query when appliesWhen predicate returns true', async () => {
    const queryWithPredicate: SoqlQueryDef = {
      ...baseQuery,
      appliesWhen: async () => ({ applies: true }),
    };

    const result = await executeSoqlQuery(okConnection, queryWithPredicate);

    expect(result.kind).toBe('ok');
  });

  it('returns failed without throwing when connection.query rejects', async () => {
    const errConnection: ConnectionLike = {
      query: async () => {
        throw new Error('INVALID_TYPE: sObject type Invalid does not exist');
      },
    };

    const result = await executeSoqlQuery(errConnection, baseQuery);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toContain('INVALID_TYPE');
    }
  });

  it('returns failed when the connection.query rejection is a non-Error value', async () => {
    const errConnection: ConnectionLike = {
      query: async () => {
        throw 'some string error';
      },
    };

    const result = await executeSoqlQuery(errConnection, baseQuery);

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toBe('some string error');
    }
  });
});

describe('executeSoqlBundle', () => {
  const userQuery: SoqlQueryDef = {
    id: 'q-users',
    controlIds: ['SBS-ACS-001'],
    soql: 'SELECT Id FROM User',
    label: 'List users',
  };
  const profileQuery: SoqlQueryDef = {
    id: 'q-profiles',
    controlIds: ['SBS-ACS-002'],
    soql: 'SELECT Id FROM Profile',
    label: 'List profiles',
  };

  it('runs every query in the bundle and returns results in input order', async () => {
    const conn: ConnectionLike = {
      query: async (soql) => ({
        records: soql.includes('User') ? [{ Id: 'u1' }] : [{ Id: 'p1' }],
        totalSize: 1,
        done: true,
      }),
    };

    const results = await executeSoqlBundle(conn, [userQuery, profileQuery]);

    expect(results).toHaveLength(2);
    expect(results[0]?.query).toBe(userQuery);
    expect(results[1]?.query).toBe(profileQuery);
  });

  it('emits query_start then query_ok for each successful query', async () => {
    const conn: ConnectionLike = {
      query: async () => ({ records: [{ Id: 'x' }], totalSize: 1, done: true }),
    };
    const events: ProgressEvent[] = [];

    await executeSoqlBundle(conn, [userQuery], (event) => events.push(event));

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('query_start');
    expect(events[1]?.type).toBe('query_ok');
    if (events[1]?.type === 'query_ok') {
      expect(events[1].rowCount).toBe(1);
    }
  });

  it('continues running subsequent queries even when one fails', async () => {
    let callIndex = 0;
    const conn: ConnectionLike = {
      query: async () => {
        callIndex++;
        if (callIndex === 1) throw new Error('first query bombs');
        return { records: [{ Id: 'p1' }], totalSize: 1, done: true };
      },
    };

    const results = await executeSoqlBundle(conn, [userQuery, profileQuery]);

    expect(results).toHaveLength(2);
    expect(results[0]?.kind).toBe('failed');
    expect(results[1]?.kind).toBe('ok');
  });

  it('emits query_skipped when a query has appliesWhen=false', async () => {
    const skipQuery: SoqlQueryDef = {
      ...userQuery,
      appliesWhen: async () => ({ applies: false, reason: 'applies_when_false' }),
    };
    const conn: ConnectionLike = {
      query: async () => ({ records: [], totalSize: 0, done: true }),
    };
    const events: ProgressEvent[] = [];

    await executeSoqlBundle(conn, [skipQuery], (event) => events.push(event));

    expect(events.map((e) => e.type)).toEqual(['query_start', 'query_skipped']);
  });

  it('emits query_failed when a query throws', async () => {
    const conn: ConnectionLike = {
      query: async () => {
        throw new Error('INVALID_TYPE');
      },
    };
    const events: ProgressEvent[] = [];

    await executeSoqlBundle(conn, [userQuery], (event) => events.push(event));

    const failedEvent = events.find((e) => e.type === 'query_failed');
    expect(failedEvent).toBeDefined();
    if (failedEvent?.type === 'query_failed') {
      expect(failedEvent.error.message).toContain('INVALID_TYPE');
    }
  });
});
