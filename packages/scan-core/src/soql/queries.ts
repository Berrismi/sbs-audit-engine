// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// The default SOQL query bundle for HelloMavens security review scans.
//
// Authoring rules:
//
// 1. **No custom (`__c`) fields.** The "do you document justification for X?"
//    question is questionnaire territory. Most orgs that DO track such
//    justifications use Word/Excel/Confluence, not custom fields; orgs that
//    do use custom fields name them anything (`Justification__c`,
//    `Documentation_URL__c`, ...). Searching for a specific name produces
//    near-zero hit rate and false-fail noise on the rest. SOQL evidence
//    enumerates the WHO (super-admin-equivalent users, ad-hoc connected
//    apps, profiles with login-hours, etc.) on standard objects + Tooling
//    entities. The WHETHER-IT'S-JUSTIFIED check stays in the questionnaire.
//
// 2. **Validate against `audit_procedure`.** Every query MUST be validated
//    against its control's `audit_procedure` field in
//    `packages/sbs-engine/data/controls.json` before being added. Earlier
//    Block B authoring (pre-correction) mapped 13 of 16 queries to the wrong
//    control because they were authored by control-id without per-control
//    audit-procedure validation. The post-correction set is the foundation.
//
// 3. **Gate edition-specific assumptions.** Use `appliesWhen` from
//    `./applies-when.ts` to skip queries that reference fields/objects not
//    present on every edition. DE has limited Tooling sObjects, conditional
//    Profile fields, etc. Skipped queries become `kind: 'skipped'` results
//    and the evaluator falls back to questionnaire attestation.
//
// 4. **Tooling vs regular SOQL.** Set `source: 'tooling'` on queries against
//    Tooling-API-only entities (RemoteProxy, ConnectedApplication, ApexClass,
//    EntityDefinition, FieldDefinition, etc.). The executor branches on this
//    automatically. Regular SOQL is the default — no `source` field needed.
//
// 5. **Multi-query controls.** Some controls map to multiple SOQL queries
//    (e.g. SBS-ACS-004 splits into via-permsets + via-profile to fit within
//    the SOQL semi-join limit of 2). Evaluators that consume multiple
//    queries handle the merge — see `packages/sbs-engine/src/evaluators/acs-004.ts`.
//
// 6. **Field-level vs object-level gates.** Use `toolingFieldsExist` (or
//    `fieldsExist`) over `toolingObjectExists` (or `objectExists`) when the
//    SELECT references a field that's conditional on org tier — DE in
//    particular has the Tooling object but not every column. Object-only
//    gates pass at runtime then fail mid-query with NO_SUCH_COLUMN. F.4 Bug
//    C tightened this for int-002 + oauth-001.
//
// Today's verified set:
//   - SBS-ACS-004   Super-admin equivalent users — split into two queries:
//                     • via-permsets (PermissionSetAssignment relationship)
//                     • via-profile  (Profile-level boolean perms)
//                   Evaluator merges. Avoids the 3-semi-join SOQL limit.
//   - SBS-ACS-005   Active users on standard profiles (custom-profile policy)
//   - SBS-ACS-012   Profiles with Login Hours configured (gated on field presence)
//   - SBS-FILE-001  ContentDistribution rows without expiry (file-share lifetime)
//   - SBS-INT-002   Remote Site Settings inventory (tooling, RemoteProxy, field-gated)
//   - SBS-INT-003   Named Credentials inventory
//   - SBS-OAUTH-001 Connected Apps without managed-package namespace (tooling, field-gated)

import { fieldsExist, toolingFieldsExist } from './applies-when';
import type { SoqlQueryDef } from '../types';

export const DEFAULT_SOQL_QUERIES: readonly SoqlQueryDef[] = [
  // SBS-ACS-004 — Documented Justification for All Super Admin–Equivalent
  // Users (path A: permission-set-driven super-admin grants).
  //
  // F.4 Bug C: split from a single combined query that hit "Maximum 2 semi
  // join sub-selects allowed" against DE. The combined version chained 3 IN
  // sub-selects (one per perm) plus a Profile OR clause. SOQL caps semi-joins
  // at 2 — over the limit by one. The fix uses relationship traversal on
  // PermissionSetAssignment instead of semi-joins, returning one row per
  // (assignee, permission_set) pair where the set carries any of the 3
  // super-admin perms. The evaluator unions per-user perms across rows and
  // verifies coverage of all 3. This captures cross-permset composition
  // (a user with ViewAll from set X + Modify from set Y) which a
  // single-set semi-join would silently miss.
  {
    id: 'acs-004-super-admin-via-permsets',
    controlIds: ['SBS-ACS-004'],
    label: 'Permission-set-driven super-admin permissions per active user',
    soql:
      'SELECT AssigneeId, Assignee.Username, Assignee.Profile.Name, ' +
      'PermissionSet.PermissionsViewAllData, PermissionSet.PermissionsModifyAllData, PermissionSet.PermissionsManageUsers ' +
      'FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = true AND (' +
      'PermissionSet.PermissionsViewAllData = true OR ' +
      'PermissionSet.PermissionsModifyAllData = true OR ' +
      'PermissionSet.PermissionsManageUsers = true)',
  },

  // SBS-ACS-004 (path B: profile-level super-admin grants — System
  // Administrator and any custom profile cloned from it). Combined with
  // path A for full coverage; evaluator dedupes users that appear in both.
  {
    id: 'acs-004-super-admin-via-profile',
    controlIds: ['SBS-ACS-004'],
    label: 'Profile-level super-admin users',
    soql:
      'SELECT Id, Username, Profile.Name FROM User WHERE IsActive = true AND ' +
      'Profile.PermissionsViewAllData = true AND ' +
      'Profile.PermissionsModifyAllData = true AND ' +
      'Profile.PermissionsManageUsers = true',
  },

  // SBS-INT-002 — Inventory and Justification of Remote Site Settings.
  // RemoteSiteSetting is Tooling-API-only; its Tooling sObject equivalent is
  // RemoteProxy. The active list is the inventory; the audit procedure asks
  // the consultant to verify each is documented + justified (questionnaire).
  //
  // F.4 Bug C: gate widened from `toolingObjectExists` to `toolingFieldsExist`
  // because some org tiers expose the RemoteProxy object but not the
  // MasterLabel column we select.
  {
    id: 'int-002-remote-site-settings-inventory',
    controlIds: ['SBS-INT-002'],
    label: 'Active remote site settings (outbound endpoints from Apex)',
    source: 'tooling',
    soql: 'SELECT Id, EndpointUrl, IsActive, MasterLabel FROM RemoteProxy WHERE IsActive = true',
    appliesWhen: toolingFieldsExist('RemoteProxy', [
      'Id',
      'EndpointUrl',
      'IsActive',
      'MasterLabel',
    ]),
  },

  // SBS-INT-003 — Inventory and Justification of Named Credentials.
  // Same pattern as INT-002: enumerate the inventory, evaluator returns
  // size + flags whether attestation backs it.
  {
    id: 'int-003-named-credentials-inventory',
    controlIds: ['SBS-INT-003'],
    label: 'Named credentials inventory',
    soql: 'SELECT Id, MasterLabel, Endpoint FROM NamedCredential',
  },

  // SBS-ACS-005 — Only Use Custom Profiles for Active Users. Active users
  // assigned to well-known standard (non-custom) profiles. Pass = 0 rows
  // (every active user is on a custom profile). Standard profile names
  // are stable across orgs (Salesforce ships these by name); the named
  // list excludes 'System Administrator' because keeping the standard
  // sysadmin profile for break-glass + cofig is widely accepted practice
  // even in shops that otherwise enforce custom-profile-only.
  {
    id: 'acs-005-active-users-on-standard-profiles',
    controlIds: ['SBS-ACS-005'],
    label: 'Active users assigned to standard (non-custom) profiles',
    soql:
      'SELECT Id, Username, Profile.Name FROM User WHERE IsActive = true ' +
      "AND Profile.Name IN ('Standard User', 'Marketing User', 'Solution Manager', 'Contract Manager', 'Read Only')",
  },

  // SBS-ACS-012 — Classify Users for Login Hours Restrictions. Profiles
  // with at least one Login Hours window configured. The seven LoginHours*Start
  // fields are conditional across editions (DE doesn't have them). When the
  // fields are absent the query is skipped → evaluator falls back to
  // questionnaire attestation.
  {
    id: 'acs-012-profiles-with-login-hours',
    controlIds: ['SBS-ACS-012'],
    label: 'Profiles with Login Hours restrictions configured',
    soql:
      'SELECT Id, Name FROM Profile ' +
      'WHERE LoginHoursMondayStart != null OR LoginHoursTuesdayStart != null ' +
      'OR LoginHoursWednesdayStart != null OR LoginHoursThursdayStart != null ' +
      'OR LoginHoursFridayStart != null OR LoginHoursSaturdayStart != null ' +
      'OR LoginHoursSundayStart != null',
    appliesWhen: fieldsExist('Profile', [
      'LoginHoursMondayStart',
      'LoginHoursTuesdayStart',
      'LoginHoursWednesdayStart',
      'LoginHoursThursdayStart',
      'LoginHoursFridayStart',
      'LoginHoursSaturdayStart',
      'LoginHoursSundayStart',
    ]),
  },

  // SBS-FILE-001 — Require Expiry Dates on Public Content Links.
  //
  // ContentDistribution is a regular SOQL object (not Tooling). Each row
  // represents a Public Content link to a file in Salesforce Files / Content.
  // `PreferencesExpires = false` means the link has no expiry date set —
  // the audit_procedure asks to enumerate exactly these rows (step 2).
  // Pass = 0 rows (every Public Content link has expiry, or the org has no
  // Public Content links at all). Fail = N rows.
  //
  // Edition gate: Salesforce Files / Content must be enabled. `fieldsExist`
  // covers both shapes — object missing entirely (DE without Content
  // enabled → describeSObject rejects) AND object present but
  // `PreferencesExpires` field absent on a degraded edition. Either way the
  // executor reports `kind: 'skipped'` and the evaluator falls back to
  // questionnaire attestation. ContentDocumentId is intentionally NOT in
  // the SELECT — we count + flag, not surface the underlying content path.
  {
    id: 'file-001-content-distributions-without-expiry',
    controlIds: ['SBS-FILE-001'],
    label: 'Public Content links lacking expiry dates',
    soql: 'SELECT Id, PreferencesExpires FROM ContentDistribution WHERE PreferencesExpires = false',
    appliesWhen: fieldsExist('ContentDistribution', ['Id', 'PreferencesExpires']),
  },

  // SBS-OAUTH-001 — Require Formal Installation of Connected Apps.
  // ConnectedApplication is a Tooling-API entity. Connected apps without a
  // managed-package namespace are org-local (ad-hoc), not formally installed
  // via a managed/unmanaged package. Pass = 0 rows; fail = N ad-hoc apps.
  //
  // F.4 Bug C: field-gated. Some org tiers expose the ConnectedApplication
  // object but not the NamespacePrefix column.
  {
    id: 'oauth-001-ad-hoc-connected-apps',
    controlIds: ['SBS-OAUTH-001'],
    label: 'Connected applications without a managed-package namespace (ad-hoc)',
    source: 'tooling',
    soql: 'SELECT Id, Name, NamespacePrefix FROM ConnectedApplication WHERE NamespacePrefix = null',
    appliesWhen: toolingFieldsExist('ConnectedApplication', ['Id', 'Name', 'NamespacePrefix']),
  },
];
