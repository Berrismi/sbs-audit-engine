// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import { fetchMetadata, prioritizeProfileNames } from '../../src/metadata/client';
import type { ConnectionLike, MetadataFileProperties } from '../../src/types';

function makeFakeConnection(opts: {
  list?: (q: { type: string; folder?: string }) => Promise<MetadataFileProperties[]>;
  read?: (type: string, fullNames: string | string[]) => Promise<unknown>;
  metadataPresent?: boolean;
}): ConnectionLike {
  const conn: ConnectionLike = {
    query: async () => ({ records: [], totalSize: 0, done: true }),
  };
  if (opts.metadataPresent !== false) {
    type MetadataNs = NonNullable<ConnectionLike['metadata']>;
    conn.metadata = {
      list: opts.list ?? (async () => []),
      read: (opts.read ?? (async () => ({}))) as MetadataNs['read'],
    };
  }
  return conn;
}

describe('fetchMetadata', () => {
  it('returns unsupported when connection.metadata is absent', async () => {
    const conn = makeFakeConnection({ metadataPresent: false });
    const result = await fetchMetadata(conn, [{ id: 'p', type: 'Profile' }]);
    expect(result.kind).toBe('unsupported');
    if (result.kind === 'unsupported') {
      expect(result.reason).toBe('no_metadata_namespace');
    }
  });

  it('skips probes with explicit fullNames bypass list()', async () => {
    const list = vi.fn(async () => []);
    const read = vi.fn(async () => [{ fullName: 'SecuritySettings', sessionSettings: {} }]);
    const conn = makeFakeConnection({ list, read });
    const result = await fetchMetadata(conn, [
      { id: 'security-settings', type: 'SecuritySettings', fullNames: ['SecuritySettings'] },
    ]);
    expect(result.kind).toBe('ok');
    expect(list).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledOnce();
    if (result.kind === 'ok') {
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.type).toBe('SecuritySettings');
      expect(result.results[0]?.records).toHaveLength(1);
    }
  });

  it('lists + caps + reads when fullNames are not provided', async () => {
    const allProfiles: MetadataFileProperties[] = Array.from({ length: 12 }, (_, i) => ({
      fullName: `Profile-${i}`,
      type: 'Profile',
    }));
    const list = vi.fn(async () => allProfiles);
    const read = vi.fn(async (_type: string, names: string | string[]) =>
      (Array.isArray(names) ? names : [names]).map((n) => ({ fullName: n, loginIpRanges: [] })),
    );
    const conn = makeFakeConnection({ list, read });
    const result = await fetchMetadata(conn, [{ id: 'profiles', type: 'Profile', cap: 5 }]);
    expect(result.kind).toBe('ok');
    expect(list).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    if (result.kind === 'ok') {
      expect(result.results[0]?.records).toHaveLength(5);
      expect(result.results[0]?.cap).toEqual({ available: 12, retrieved: 5 });
    }
  });

  it('does NOT set the cap caveat when retrieval is below the cap', async () => {
    const list = vi.fn(async () =>
      Array.from({ length: 3 }, (_, i) => ({ fullName: `P-${i}`, type: 'Profile' })),
    );
    const read = vi.fn(async (_t: string, names: string | string[]) =>
      (Array.isArray(names) ? names : [names]).map((n) => ({ fullName: n })),
    );
    const conn = makeFakeConnection({ list, read });
    const result = await fetchMetadata(conn, [{ id: 'profiles', type: 'Profile', cap: 100 }]);
    if (result.kind === 'ok') {
      expect(result.results[0]?.cap).toBeUndefined();
    }
  });

  it('returns failed when read() throws', async () => {
    const conn = makeFakeConnection({
      list: async () => [{ fullName: 'Admin', type: 'Profile' }],
      read: async () => {
        throw new Error('Salesforce returned INVALID_TYPE');
      },
    });
    const result = await fetchMetadata(conn, [{ id: 'profiles', type: 'Profile', cap: 5 }]);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.message).toContain('profiles:');
      expect(result.error.message).toContain('INVALID_TYPE');
    }
  });

  it('coerces single-object read response into a one-element array', async () => {
    // Salesforce's metadata.read returns a bare object when given a single
    // fullName, not a one-element array. Client normalizes both into arrays.
    const conn = makeFakeConnection({
      read: async () => ({ fullName: 'SecuritySettings', sessionSettings: {} }),
    });
    const result = await fetchMetadata(conn, [
      { id: 'sec', type: 'SecuritySettings', fullNames: ['SecuritySettings'] },
    ]);
    if (result.kind === 'ok') {
      expect(result.results[0]?.records).toHaveLength(1);
    }
  });

  it('chunks reads into batches of 10 to respect the Metadata API record limit', async () => {
    // Regression test for the alpha.30 chunking fix. The Salesforce Metadata
    // API caps each `read()` call at 10 fullNames; larger batches return
    // EXCEEDED_ID_LIMIT. Inventory probes (Profile, CustomObject) need to
    // chunk reads when the cap is >10.
    const callBatches: number[] = [];
    const allProfiles: MetadataFileProperties[] = Array.from({ length: 25 }, (_, i) => ({
      fullName: `Profile-${i}`,
      type: 'Profile',
    }));
    const conn = makeFakeConnection({
      list: async () => allProfiles,
      read: async (_type: string, names: string | string[]) => {
        const namesArr = Array.isArray(names) ? names : [names];
        callBatches.push(namesArr.length);
        return namesArr.map((n) => ({ fullName: n }));
      },
    });
    const result = await fetchMetadata(conn, [{ id: 'profiles', type: 'Profile', cap: 25 }]);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // 25 records returned across 3 chunks (10 + 10 + 5)
      expect(result.results[0]?.records).toHaveLength(25);
      expect(callBatches).toEqual([10, 10, 5]);
    }
  });

  it('chunks explicit-fullNames probes the same way (not just discovered ones)', async () => {
    // SecuritySettings is a singleton (fullNames = ['SecuritySettings']) so
    // it never trips the cap, but a probe with explicit fullNames > 10
    // would. Defensive against future probes that hardcode large lists.
    const callBatches: number[] = [];
    const fullNames = Array.from({ length: 17 }, (_, i) => `Item-${i}`);
    const conn = makeFakeConnection({
      read: async (_type: string, names: string | string[]) => {
        const namesArr = Array.isArray(names) ? names : [names];
        callBatches.push(namesArr.length);
        return namesArr.map((n) => ({ fullName: n }));
      },
    });
    const result = await fetchMetadata(conn, [
      { id: 'big-explicit', type: 'CustomObject', fullNames },
    ]);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.results[0]?.records).toHaveLength(17);
      expect(callBatches).toEqual([10, 7]);
    }
  });
});

describe('prioritizeProfileNames', () => {
  it('orders Standard User first, then System Administrator, then Admin', () => {
    const out = prioritizeProfileNames([
      'Marketing User',
      'Admin',
      'System Administrator',
      'Standard User',
    ]);
    expect(out).toEqual(['Standard User', 'System Administrator', 'Admin', 'Marketing User']);
  });

  it('groups integration-shaped names ahead of remaining alphabetical', () => {
    const out = prioritizeProfileNames([
      'Marketing User',
      'Custom Profile A',
      'API Integration User',
      'Read Only',
    ]);
    // API Integration User matches the 'Integration' pattern (group 4)
    // before 'API' pattern; both rank ahead of Custom/Marketing/Read Only.
    expect(out[0]).toBe('API Integration User');
    expect(out.slice(-3)).toEqual(['Custom Profile A', 'Marketing User', 'Read Only']);
  });

  it('returns a sorted copy without mutating the input', () => {
    const input = ['Z', 'A'];
    const out = prioritizeProfileNames(input);
    expect(input).toEqual(['Z', 'A']);
    expect(out).toEqual(['A', 'Z']);
  });

  it('returns deterministic alphabetical when no patterns match', () => {
    expect(prioritizeProfileNames(['Zeta Custom', 'Alpha Custom', 'Gamma Custom'])).toEqual([
      'Alpha Custom',
      'Gamma Custom',
      'Zeta Custom',
    ]);
  });
});
