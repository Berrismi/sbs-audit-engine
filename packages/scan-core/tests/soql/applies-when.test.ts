// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import {
  objectExists,
  fieldsExist,
  toolingObjectExists,
  toolingFieldsExist,
} from '../../src/soql/applies-when';
import type { AppliesWhenContext, ConnectionLike } from '../../src/types';

function makeCtx(): AppliesWhenContext {
  return {
    describeCache: new Map(),
    toolingDescribeCache: new Map(),
  };
}

describe('objectExists', () => {
  it('returns applies:true when describeSObject succeeds', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockResolvedValue({ name: 'Account', fields: [] }),
    };
    const result = await objectExists('Account')(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });

  it('returns applies:false with object_unavailable when describeSObject rejects', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockRejectedValue(new Error('NOT_FOUND: Object not available')),
    };
    const result = await objectExists('NotARealObject')(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });

  it('returns applies:false with object_unavailable when connection lacks describeSObject', async () => {
    const conn: ConnectionLike = { query: vi.fn() };
    const result = await objectExists('Account')(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });

  it('caches describe results — second call against same object reuses the first', async () => {
    const describeSObject = vi.fn().mockResolvedValue({ name: 'Account', fields: [] });
    const conn: ConnectionLike = { query: vi.fn(), describeSObject };
    const ctx = makeCtx();
    await objectExists('Account')(conn, ctx);
    await objectExists('Account')(conn, ctx);
    expect(describeSObject).toHaveBeenCalledTimes(1);
  });
});

describe('fieldsExist', () => {
  it('returns applies:true when all named fields are present', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockResolvedValue({
        name: 'User',
        fields: [{ name: 'Id' }, { name: 'Username' }, { name: 'IsActive' }],
      }),
    };
    const result = await fieldsExist('User', ['Id', 'Username'])(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });

  it('returns applies:false with field_unavailable when any field is missing', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockResolvedValue({
        name: 'User',
        fields: [{ name: 'Id' }, { name: 'Username' }],
      }),
    };
    const result = await fieldsExist('User', ['Id', 'JustificationDoc__c'])(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'field_unavailable' });
  });

  it('returns applies:false with object_unavailable when describeSObject fails entirely', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockRejectedValue(new Error('NOT_FOUND')),
    };
    const result = await fieldsExist('NotARealObject', ['Id'])(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });

  it('field check is case-insensitive (Salesforce describe is case-insensitive)', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockResolvedValue({
        name: 'User',
        fields: [{ name: 'IsActive' }],
      }),
    };
    const result = await fieldsExist('User', ['isactive'])(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });
});

describe('toolingObjectExists', () => {
  it('returns applies:true when tooling.describeSObject succeeds', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({ name: 'RemoteProxy', fields: [] }),
      },
    };
    const result = await toolingObjectExists('RemoteProxy')(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });

  it('returns applies:false with object_unavailable when tooling namespace missing', async () => {
    const conn: ConnectionLike = { query: vi.fn() };
    const result = await toolingObjectExists('RemoteProxy')(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });

  it('returns applies:false with object_unavailable when tooling.describeSObject rejects', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockRejectedValue(new Error('Not found')),
      },
    };
    const result = await toolingObjectExists('NotARealToolingObject')(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });

  it('uses the toolingDescribeCache (not the regular cache)', async () => {
    const describeSObject = vi.fn().mockResolvedValue({ name: 'RemoteProxy', fields: [] });
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: { query: vi.fn(), describeSObject },
    };
    const ctx = makeCtx();
    await toolingObjectExists('RemoteProxy')(conn, ctx);
    await toolingObjectExists('RemoteProxy')(conn, ctx);
    expect(describeSObject).toHaveBeenCalledTimes(1);
    expect(ctx.toolingDescribeCache.has('RemoteProxy')).toBe(true);
    expect(ctx.describeCache.has('RemoteProxy')).toBe(false);
  });
});

describe('toolingFieldsExist', () => {
  it('returns applies:true when all tooling fields present', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({
          name: 'ConnectedApplication',
          fields: [{ name: 'Id' }, { name: 'Name' }, { name: 'NamespacePrefix' }],
        }),
      },
    };
    const result = await toolingFieldsExist('ConnectedApplication', ['Id', 'NamespacePrefix'])(
      conn,
      makeCtx(),
    );
    expect(result).toEqual({ applies: true });
  });

  it('returns applies:false with field_unavailable when any tooling field missing', async () => {
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({
          name: 'ConnectedApplication',
          fields: [{ name: 'Id' }],
        }),
      },
    };
    const result = await toolingFieldsExist('ConnectedApplication', ['NamespacePrefix'])(
      conn,
      makeCtx(),
    );
    expect(result).toEqual({ applies: false, reason: 'field_unavailable' });
  });

  it('returns applies:false with object_unavailable when tooling namespace is present but describeSObject is absent', async () => {
    // Guards against a regression making `describeSObject` non-optional in the
    // ConnectionLike type — the helpers must keep tolerating partial adapters.
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: { query: vi.fn() },
    };
    const result = await toolingFieldsExist('ConnectedApplication', ['NamespacePrefix'])(
      conn,
      makeCtx(),
    );
    expect(result).toEqual({ applies: false, reason: 'object_unavailable' });
  });
});

describe('fieldsExist edge cases', () => {
  it('vacuously returns applies:true for an empty fieldNames array (documents the contract)', async () => {
    // Empty list = no fields to require = predicate is satisfied. Surprising
    // for an authoring mistake, but defensible — Array.prototype.every is
    // vacuously true. This test pins the behavior so a future "guard against
    // empty list" change is a deliberate API decision, not a silent flip.
    const conn: ConnectionLike = {
      query: vi.fn(),
      describeSObject: vi.fn().mockResolvedValue({ name: 'User', fields: [] }),
    };
    const result = await fieldsExist('User', [])(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });
});
