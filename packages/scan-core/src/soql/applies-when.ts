// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Helpers for `SoqlQueryDef.appliesWhen` predicates. Each helper returns a
// closure that the executor calls with `(connection, ctx)` per query. The
// `ctx.describeCache` (and `ctx.toolingDescribeCache`) memoize describe
// calls so N queries against the same object cost one describe per scan.
//
// Authoring rule: SOQL queries in this codebase MUST NOT reference any
// custom (`__c`) field. The "do you have justification documented?" question
// is questionnaire territory. SOQL enumerates the population on standard
// objects + Tooling entities; `appliesWhen` gates with these helpers when an
// org tier (DE) doesn't carry a referenced object/field at all.

import type { AppliesWhenFn, ConnectionLike, DescribeSObjectResult } from '../types';

function getDescribe(
  connection: ConnectionLike,
  cache: Map<string, Promise<DescribeSObjectResult>>,
  objectName: string,
  describer: (name: string) => Promise<DescribeSObjectResult>,
): Promise<DescribeSObjectResult> {
  const cached = cache.get(objectName);
  if (cached) return cached;
  const fresh = describer(objectName);
  cache.set(objectName, fresh);
  // If describer rejects, drop the cache entry so a future caller can retry.
  // (Real-world: transient network blips. Tests verify cache behavior on success.)
  fresh.catch(() => cache.delete(objectName));
  return fresh;
}

function hasField(describe: DescribeSObjectResult, fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return describe.fields.some((f) => f.name.toLowerCase() === lower);
}

export function objectExists(objectName: string): AppliesWhenFn {
  return async (connection, ctx) => {
    if (!connection.describeSObject) {
      return { applies: false, reason: 'object_unavailable' };
    }
    try {
      await getDescribe(connection, ctx.describeCache, objectName, (name) =>
        connection.describeSObject!(name),
      );
      return { applies: true };
    } catch {
      return { applies: false, reason: 'object_unavailable' };
    }
  };
}

export function fieldsExist(objectName: string, fieldNames: readonly string[]): AppliesWhenFn {
  return async (connection, ctx) => {
    if (!connection.describeSObject) {
      return { applies: false, reason: 'object_unavailable' };
    }
    let describe: DescribeSObjectResult;
    try {
      describe = await getDescribe(connection, ctx.describeCache, objectName, (name) =>
        connection.describeSObject!(name),
      );
    } catch {
      return { applies: false, reason: 'object_unavailable' };
    }
    const allPresent = fieldNames.every((f) => hasField(describe, f));
    return allPresent ? { applies: true } : { applies: false, reason: 'field_unavailable' };
  };
}

export function toolingObjectExists(objectName: string): AppliesWhenFn {
  return async (connection, ctx) => {
    const describer = connection.tooling?.describeSObject;
    if (!describer) {
      return { applies: false, reason: 'object_unavailable' };
    }
    try {
      await getDescribe(connection, ctx.toolingDescribeCache, objectName, (name) =>
        describer.call(connection.tooling, name),
      );
      return { applies: true };
    } catch {
      return { applies: false, reason: 'object_unavailable' };
    }
  };
}

export function toolingFieldsExist(
  objectName: string,
  fieldNames: readonly string[],
): AppliesWhenFn {
  return async (connection, ctx) => {
    const describer = connection.tooling?.describeSObject;
    if (!describer) {
      return { applies: false, reason: 'object_unavailable' };
    }
    let describe: DescribeSObjectResult;
    try {
      describe = await getDescribe(connection, ctx.toolingDescribeCache, objectName, (name) =>
        describer.call(connection.tooling, name),
      );
    } catch {
      return { applies: false, reason: 'object_unavailable' };
    }
    const allPresent = fieldNames.every((f) => hasField(describe, f));
    return allPresent ? { applies: true } : { applies: false, reason: 'field_unavailable' };
  };
}
