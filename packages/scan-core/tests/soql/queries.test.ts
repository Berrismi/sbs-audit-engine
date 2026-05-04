// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// These tests act as a guard rail for the SOQL query bundle. New queries
// added in Block B.1 (and beyond) must satisfy the same invariants.

import { describe, it, expect } from 'vitest';
import { DEFAULT_SOQL_QUERIES } from '../../src/soql/queries';

describe('DEFAULT_SOQL_QUERIES', () => {
  it('every query has a non-empty unique id', () => {
    const ids = DEFAULT_SOQL_QUERIES.map((q) => q.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every query maps to at least one SBS control id (SBS-* prefix)', () => {
    for (const query of DEFAULT_SOQL_QUERIES) {
      expect(query.controlIds.length).toBeGreaterThan(0);
      for (const controlId of query.controlIds) {
        expect(controlId).toMatch(/^SBS-[A-Z]+-\d+$/);
      }
    }
  });

  it('every query has a non-empty SOQL string starting with SELECT', () => {
    for (const query of DEFAULT_SOQL_QUERIES) {
      expect(query.soql.length).toBeGreaterThan(0);
      expect(query.soql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
    }
  });

  it('every query has a non-empty human-readable label', () => {
    for (const query of DEFAULT_SOQL_QUERIES) {
      expect(query.label.length).toBeGreaterThan(0);
    }
  });

  it('Block B starter set covers ACS, OAUTH, INT, and CPORTAL categories', () => {
    const allControlIds = new Set(DEFAULT_SOQL_QUERIES.flatMap((q) => q.controlIds));
    const categories = new Set(
      [...allControlIds].map((id) => id.split('-')[1]).filter((cat): cat is string => Boolean(cat)),
    );
    expect(categories).toContain('ACS');
    expect(categories).toContain('OAUTH');
    expect(categories).toContain('INT');
    expect(categories).toContain('CPORTAL');
  });

  it('cportal appliesWhen returns false when the Network SObject query throws (org without Communities)', async () => {
    const cportalQuery = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'cportal-001-networks');
    expect(cportalQuery?.appliesWhen).toBeDefined();
    const throwingConn = {
      query: async () => {
        throw new Error("INVALID_TYPE: sObject type 'Network' is not supported");
      },
    };

    const applies = await cportalQuery?.appliesWhen?.(throwingConn);

    expect(applies).toBe(false);
  });
});
