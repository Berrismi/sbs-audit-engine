// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Guard rails for the SOQL query bundle. Authoring rule: every query MUST
// be validated against its control's audit_procedure before being added
// (see queries.ts header).

import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SOQL_QUERIES } from '../../src/soql/queries';
import type { AppliesWhenContext, ConnectionLike } from '../../src/types';

function makeCtx(): AppliesWhenContext {
  return {
    describeCache: new Map(),
    toolingDescribeCache: new Map(),
  };
}

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

  it('int-002 query targets RemoteProxy via tooling source with field gating', () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'int-002-remote-site-settings-inventory');
    expect(q).toBeDefined();
    expect(q!.source).toBe('tooling');
    expect(q!.soql).toContain('FROM RemoteProxy');
    expect(q!.soql).not.toContain('RemoteSiteSetting');
    expect(q!.appliesWhen).toBeDefined();
  });

  it('int-002 appliesWhen returns field_unavailable when SiteName is missing on RemoteProxy', async () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'int-002-remote-site-settings-inventory')!;
    // RemoteProxy exists but the SiteName field doesn't (simulating an org
    // where the object is described but the column we select isn't present).
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({
          name: 'RemoteProxy',
          fields: [{ name: 'Id' }, { name: 'EndpointUrl' }, { name: 'IsActive' }],
        }),
      },
    };
    const result = await q.appliesWhen!(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'field_unavailable' });
  });

  it('int-002 appliesWhen returns applies:true when all selected fields exist', async () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'int-002-remote-site-settings-inventory')!;
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({
          name: 'RemoteProxy',
          fields: [
            { name: 'Id' },
            { name: 'EndpointUrl' },
            { name: 'IsActive' },
            { name: 'SiteName' },
          ],
        }),
      },
    };
    const result = await q.appliesWhen!(conn, makeCtx());
    expect(result).toEqual({ applies: true });
  });

  it('oauth-001 query targets ConnectedApplication via tooling source with field gating', () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'oauth-001-ad-hoc-connected-apps');
    expect(q).toBeDefined();
    expect(q!.source).toBe('tooling');
    expect(q!.soql).toContain('FROM ConnectedApplication');
    expect(q!.appliesWhen).toBeDefined();
  });

  it('oauth-001 appliesWhen returns field_unavailable when NamespacePrefix is missing', async () => {
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'oauth-001-ad-hoc-connected-apps')!;
    const conn: ConnectionLike = {
      query: vi.fn(),
      tooling: {
        query: vi.fn(),
        describeSObject: vi.fn().mockResolvedValue({
          name: 'ConnectedApplication',
          fields: [{ name: 'Id' }, { name: 'Name' }],
        }),
      },
    };
    const result = await q.appliesWhen!(conn, makeCtx());
    expect(result).toEqual({ applies: false, reason: 'field_unavailable' });
  });

  it('acs-012 SOQL query was retired in alpha.32 — Profile.loginHours moved to Metadata API', () => {
    // Multi-org verification (DE + 2 prod) confirmed Profile.LoginHours*Start/End
    // SOQL columns are absent on every edition; alpha.32 migrated ACS-012 to the
    // Metadata API path (see packages/sbs-engine/src/evaluators/acs-012.ts). This
    // test guards against accidental reintroduction.
    const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'acs-012-profiles-with-login-hours');
    expect(q).toBeUndefined();
  });

  describe('acs-004 split into permset path + profile path (F.4 Bug C)', () => {
    it('exposes acs-004-super-admin-via-permsets — no semi-joins, selects assignee + the 3 perm booleans', () => {
      const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'acs-004-super-admin-via-permsets');
      expect(q).toBeDefined();
      // No nested SELECT (semi-join) — just relationship traversal on
      // PermissionSetAssignment.PermissionSet.* + Assignee.*. SOQL caps
      // semi-joins at 2; this restructure stays within the limit by avoiding
      // them entirely (one root SELECT, no parenthesized inner SELECT).
      expect(q!.soql.match(/\bSELECT\b/gi)?.length).toBe(1);
      expect(q!.soql).toContain('FROM PermissionSetAssignment');
      expect(q!.soql).toContain('AssigneeId');
      expect(q!.soql).toContain('Assignee.Username');
      expect(q!.soql).toContain('PermissionSet.PermissionsViewAllData');
      expect(q!.soql).toContain('PermissionSet.PermissionsModifyAllData');
      expect(q!.soql).toContain('PermissionSet.PermissionsManageUsers');
      expect(q!.soql).toContain('Assignee.IsActive');
      expect(q!.soql).not.toMatch(/__c/);
    });

    it('exposes acs-004-super-admin-via-profile — no semi-joins, all three Profile booleans in WHERE', () => {
      const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === 'acs-004-super-admin-via-profile');
      expect(q).toBeDefined();
      expect(q!.soql.match(/\bSELECT\b/gi)?.length).toBe(1);
      expect(q!.soql).toContain('FROM User');
      expect(q!.soql).toContain('IsActive = true');
      expect(q!.soql).toContain('Profile.PermissionsViewAllData');
      expect(q!.soql).toContain('Profile.PermissionsModifyAllData');
      expect(q!.soql).toContain('Profile.PermissionsManageUsers');
      expect(q!.soql).not.toMatch(/__c/);
    });

    it('removes the legacy combined acs-004-super-admin-equivalents query id', () => {
      const ids = new Set(DEFAULT_SOQL_QUERIES.map((q) => q.id));
      expect(ids.has('acs-004-super-admin-equivalents')).toBe(false);
    });

    it('both new acs-004 queries map to the SBS-ACS-004 control', () => {
      const ids = ['acs-004-super-admin-via-permsets', 'acs-004-super-admin-via-profile'];
      for (const id of ids) {
        const q = DEFAULT_SOQL_QUERIES.find((q) => q.id === id)!;
        expect(q.controlIds).toContain('SBS-ACS-004');
      }
    });
  });

  it('the verified set includes the Block E baseline queries (with acs-004 split)', () => {
    const ids = new Set(DEFAULT_SOQL_QUERIES.map((q) => q.id));
    // Block E.1 baseline (now with acs-004 split into two paths per F.4 Bug C):
    expect(ids.has('acs-004-super-admin-via-permsets')).toBe(true);
    expect(ids.has('acs-004-super-admin-via-profile')).toBe(true);
    expect(ids.has('int-002-remote-site-settings-inventory')).toBe(true);
    expect(ids.has('int-003-named-credentials-inventory')).toBe(true);
    // Block E.4 additions (3 more controls):
    expect(ids.has('acs-005-active-users-on-standard-profiles')).toBe(true);
    // acs-012 SOQL query was retired in alpha.32 — see retirement test above.
    expect(ids.has('oauth-001-ad-hoc-connected-apps')).toBe(true);
  });
});
