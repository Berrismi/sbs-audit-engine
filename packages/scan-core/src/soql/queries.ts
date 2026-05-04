// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// The default SOQL query bundle for HelloMavens security review scans.
// Block B shipped 5 starter queries (one per category). Block B.1 (this
// file) brings the count to 15 — full coverage of the SOQL-amenable
// controls in ACS, OAUTH, INT, and CPORTAL.
//
// Tooling API queries (e.g., DEP packages, AUTH security settings) require
// Connection.tooling.query() and land alongside Block C's Health Check
// integration. Code Analyzer findings (CODE-*) land in Block D. Process-
// attestation controls (incident response plan, vendor review cadence)
// stay questionnaire-only.
//
// Each query maps to one or more SBS controls via `controlIds`. Block E's
// per-evaluator extensions consume these by looking up the control_id from
// the QueryResult shape. Queries that depend on optional Salesforce
// features (e.g., Communities for CPORTAL) carry an `appliesWhen`
// predicate so they're skipped (na) on orgs that don't have them, not
// failed (inconclusive).
//
// All queries here are plausible SOQL based on standard Salesforce
// SObjects + field names; full validation against a real Developer
// Edition org happens in Block G's smoke test (master prompt §Checkpoint
// 5). Where field names are uncertain, the query is structured so that
// missing-field errors surface as `failed` (handled by the executor) — no
// silent wrong answers.

import type { ConnectionLike, SoqlQueryDef } from '../types';

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
    appliesWhen: networksExist,
  },

  // ACS — Frozen-but-still-active users. A frozen user can no longer log
  // in but their permission set assignments + record ownership remain;
  // best practice is to deactivate and reassign. Maps to: SBS-ACS-002
  // (user lifecycle hygiene).
  {
    id: 'acs-002-frozen-but-active-users',
    controlIds: ['SBS-ACS-002'],
    label: 'Frozen users that still have IsActive = true',
    soql:
      'SELECT Id, Username, Name FROM User WHERE IsActive = true ' +
      'AND Id IN (SELECT UserId FROM UserLogin WHERE IsFrozen = true)',
  },

  // ACS — Profile inventory. Foundation for several downstream checks
  // (ACS-003 documents profile-by-profile review cadence; the inventory
  // alone is the evidence). Maps to: SBS-ACS-003.
  {
    id: 'acs-003-profile-inventory',
    controlIds: ['SBS-ACS-003'],
    label: 'All profiles in the org (inventory for review)',
    soql: 'SELECT Id, Name, UserType, Description FROM Profile',
  },

  // ACS — Custom permission sets (excluding profile-owned permission
  // sets). Maps to: SBS-ACS-005 (permission set inventory + review).
  {
    id: 'acs-005-custom-permission-sets',
    controlIds: ['SBS-ACS-005'],
    label: 'Custom permission sets (excluding profile-owned)',
    soql: 'SELECT Id, Name, Label, Description FROM PermissionSet WHERE IsOwnedByProfile = false',
  },

  // ACS — User role hierarchy inventory. Maps to: SBS-ACS-006 (role
  // hierarchy review).
  {
    id: 'acs-006-user-roles',
    controlIds: ['SBS-ACS-006'],
    label: 'User role hierarchy inventory',
    soql: 'SELECT Id, Name, ParentRoleId, DeveloperName FROM UserRole',
  },

  // ACS — Inactive users still carrying permission set assignments. These
  // assignments should be removed when a user is deactivated. Maps to:
  // SBS-ACS-008 (deprovisioning hygiene).
  {
    id: 'acs-008-inactive-users-with-permsets',
    controlIds: ['SBS-ACS-008'],
    label: 'Inactive users with active permission set assignments',
    soql:
      'SELECT AssigneeId, PermissionSet.Name, Assignee.Username FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = false',
  },

  // ACS — Permission sets granting Modify All Data. The "blast radius" of
  // each MAD-granting permset is a critical access-controls signal. Maps
  // to: SBS-ACS-010.
  {
    id: 'acs-010-modify-all-data-permsets',
    controlIds: ['SBS-ACS-010'],
    label: 'Permission sets granting Modify All Data',
    soql:
      'SELECT Id, Name, Label FROM PermissionSet ' +
      'WHERE PermissionsModifyAllData = true AND IsOwnedByProfile = false',
  },

  // ACS — Permission sets granting Manage Users. MU is a high-trust
  // permission; assignments should be tightly controlled. Maps to:
  // SBS-ACS-012.
  {
    id: 'acs-012-manage-users-permsets',
    controlIds: ['SBS-ACS-012'],
    label: 'Permission sets granting Manage Users',
    soql:
      'SELECT Id, Name, Label FROM PermissionSet ' +
      'WHERE PermissionsManageUsers = true AND IsOwnedByProfile = false',
  },

  // OAUTH — Connected app refresh-token policies. The policies-info on
  // ConnectedApplication captures whether refresh tokens are persistent,
  // expire after N days, or get revoked on session end. Maps to:
  // SBS-OAUTH-002.
  {
    id: 'oauth-002-connected-app-refresh-policies',
    controlIds: ['SBS-OAUTH-002'],
    label: 'Connected app refresh-token policies',
    soql:
      'SELECT Id, Name, OptionsAllowAdminApprovedUsersOnly, OptionsRefreshTokenValidityMetric ' +
      'FROM ConnectedApplication',
  },

  // INT — Auth providers (SSO + OAuth federation endpoints). Each
  // AuthProvider that's active can be a trust path into the org. Maps to:
  // SBS-INT-002.
  {
    id: 'int-002-auth-providers',
    controlIds: ['SBS-INT-002'],
    label: 'Auth providers (SSO / OAuth federation)',
    soql: 'SELECT Id, DeveloperName, FriendlyName, ProviderType FROM AuthProvider',
  },

  // INT — Active remote site settings. RemoteSiteSetting whitelists
  // outbound HTTP destinations from Apex; stale entries are an integration
  // hygiene concern. Maps to: SBS-INT-003.
  {
    id: 'int-003-remote-site-settings',
    controlIds: ['SBS-INT-003'],
    label: 'Active remote site settings (outbound endpoints from Apex)',
    soql: 'SELECT Id, EndpointUrl, IsActive, SiteName FROM RemoteSiteSetting WHERE IsActive = true',
  },

  // CPORTAL — Network member status configuration. Members of an
  // Experience Cloud site inherit profile-based access; this query
  // surfaces which profiles are configured per network. Maps to:
  // SBS-CPORTAL-002 (community access review). Same Communities-presence
  // gate as CPORTAL-001.
  {
    id: 'cportal-002-network-member-groups',
    controlIds: ['SBS-CPORTAL-002'],
    label: 'Profiles configured to access each Experience Cloud network',
    soql: 'SELECT NetworkId, ParentId FROM NetworkMemberGroup ORDER BY NetworkId',
    appliesWhen: networksExist,
  },
];

// Shared appliesWhen predicate used by CPORTAL queries. Returns false when
// the Network SObject either doesn't exist (no Communities licence) or
// returns zero rows (Communities licensed but no networks created).
async function networksExist(conn: ConnectionLike): Promise<boolean> {
  try {
    const res = await conn.query('SELECT Id FROM Network LIMIT 1');
    return res.totalSize > 0;
  } catch {
    // SObject doesn't exist on this org — skip cleanly.
    return false;
  }
}
