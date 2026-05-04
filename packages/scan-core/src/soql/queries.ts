// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// The default SOQL query bundle for HelloMavens security review scans.
// This is a Block B starter set of 5 queries — one per category — proving
// the pattern. Block B.1 fills in the remaining ~15 queries (ACS, OAUTH,
// INT, CPORTAL coverage to spec §7).
//
// Each query maps to one or more SBS controls via `controlIds`. Block E's
// per-evaluator extensions consume these by looking up the control_id from
// the QueryResult shape. Queries that depend on optional Salesforce
// features (e.g., Communities for CPORTAL) carry an `appliesWhen` predicate
// so they're skipped (na) on orgs that don't have them, not failed
// (inconclusive).

import type { SoqlQueryDef } from '../types';

export const DEFAULT_SOQL_QUERIES: readonly SoqlQueryDef[] = [
  // ACS — Active users with the System Administrator profile.
  // Maps to: SBS-ACS-001 (privileged user enumeration).
  {
    id: 'acs-001-active-system-admin-users',
    controlIds: ['SBS-ACS-001'],
    label: 'Active users with the System Administrator profile',
    soql: "SELECT Id, Username, Name, Profile.Name, IsActive FROM User WHERE Profile.Name = 'System Administrator' AND IsActive = true",
  },

  // ACS — Super-admin equivalent users (the spec §5 example query).
  // Active users carrying ViewAllData + ModifyAllData + ManageUsers via
  // permission sets. Maps to: SBS-ACS-004 (documented justification for
  // super-admin equivalents).
  {
    id: 'acs-004-super-admin-equivalents',
    controlIds: ['SBS-ACS-004'],
    label: 'Active users with super-admin equivalent permission set assignments',
    soql:
      'SELECT Id, Username FROM User WHERE IsActive = true ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsViewAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsModifyAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsManageUsers = true)',
  },

  // OAUTH — Connected applications + their OAuth scopes.
  // Maps to: SBS-OAUTH-001 (connected app inventory + scope review).
  {
    id: 'oauth-001-connected-apps',
    controlIds: ['SBS-OAUTH-001'],
    label: 'Connected applications and their OAuth admin-approval policies',
    soql: 'SELECT Id, Name, OptionsAllowAdminApprovedUsersOnly FROM ConnectedApplication',
  },

  // INT — Named credentials inventory.
  // Maps to: SBS-INT-001 (integration credential inventory).
  {
    id: 'int-001-named-credentials',
    controlIds: ['SBS-INT-001'],
    label: 'Named credentials inventory',
    soql: 'SELECT Id, MasterLabel, Endpoint FROM NamedCredential',
  },

  // CPORTAL — Experience Cloud / Customer Portal networks. Skips on orgs
  // without Communities enabled (the Network SObject either doesn't exist
  // or returns 0 rows). Maps to: SBS-CPORTAL-001 (community config review).
  {
    id: 'cportal-001-networks',
    controlIds: ['SBS-CPORTAL-001'],
    label: 'Experience Cloud / Customer Portal networks',
    soql: 'SELECT Id, Name, Status FROM Network',
    appliesWhen: async (conn) => {
      try {
        const res = await conn.query('SELECT Id FROM Network LIMIT 1');
        return res.totalSize > 0;
      } catch {
        // SObject doesn't exist (Communities not enabled) — skip cleanly.
        return false;
      }
    },
  },
];
