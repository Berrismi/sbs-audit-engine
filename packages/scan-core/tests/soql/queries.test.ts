// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Guard rails for the SOQL query bundle. Authoring rule: every query MUST
// be validated against its control's audit_procedure before being added
// (see queries.ts header).

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

  it('int-002 query targets RemoteProxy via tooling source with object gating', () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'int-002-remote-site-settings-inventory');
    expect(q).toBeDefined();
    expect(q!.source).toBe('tooling');
    expect(q!.soql).toContain('FROM RemoteProxy');
    expect(q!.soql).not.toContain('RemoteSiteSetting');
    expect(q!.appliesWhen).toBeDefined();
  });

  it('oauth-001 query targets ConnectedApplication via tooling source', () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'oauth-001-ad-hoc-connected-apps');
    expect(q).toBeDefined();
    expect(q!.source).toBe('tooling');
    expect(q!.soql).toContain('FROM ConnectedApplication');
    expect(q!.appliesWhen).toBeDefined();
  });

  it('acs-012 query gates on Profile login-hours field availability', () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'acs-012-profiles-with-login-hours');
    expect(q).toBeDefined();
    expect(q!.source ?? 'regular').toBe('regular');
    expect(q!.appliesWhen).toBeDefined();
  });

  it('the verified set includes the Block E baseline queries', () => {
    const ids = new Set(DEFAULT_SOQL_QUERIES.map((q) => q.id));
    // Block E.1 baseline (3 controls):
    expect(ids.has('acs-004-super-admin-equivalents')).toBe(true);
    expect(ids.has('int-002-remote-site-settings-inventory')).toBe(true);
    expect(ids.has('int-003-named-credentials-inventory')).toBe(true);
    // Block E.4 additions (3 more controls):
    expect(ids.has('acs-005-active-users-on-standard-profiles')).toBe(true);
    expect(ids.has('acs-012-profiles-with-login-hours')).toBe(true);
    expect(ids.has('oauth-001-ad-hoc-connected-apps')).toBe(true);
  });
});
