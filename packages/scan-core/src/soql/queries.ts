// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// The default SOQL query bundle for HelloMavens security review scans.
//
// Authoring rule (post Phase 5 Block E correction): every query MUST be
// validated against its control's `audit_procedure` field in
// `packages/sbs-engine/data/controls.json` before being added to this
// bundle. The earlier Block B + B.1 set was authored by control-id
// without per-control audit-procedure validation; that resulted in
// 13 of 16 queries being mapped to the wrong control. The PR that
// landed this comment removed the unverified queries and is the new
// foundation.
//
// Today's verified set (6 queries, three categories):
//   - SBS-ACS-004   Super-admin equivalent users (the spec §5 example)
//   - SBS-ACS-005   Active users on standard profiles (custom-profile policy)
//   - SBS-ACS-012   Profiles with Login Hours configured
//   - SBS-INT-002   Remote Site Settings inventory
//   - SBS-INT-003   Named Credentials inventory
//   - SBS-OAUTH-001 Connected Apps without a managed-package namespace
//                   (i.e., ad-hoc connected apps)
//
// All three queries enumerate the population a control measures (super-
// admin equivalents, outbound endpoints, integration credentials).
// Per-row "is this justified?" verdicts come from custom-field
// inspection (ACS-004) or questionnaire attestation (INT-002, INT-003)
// in the evaluator layer.
//
// The expansion path: each new query lands in a dedicated PR that cites
// the audit_procedure it satisfies, plus the evaluator extension that
// consumes it. No bulk additions.

import { fieldsExist, toolingObjectExists } from './applies-when';
import type { SoqlQueryDef } from '../types';

export const DEFAULT_SOQL_QUERIES: readonly SoqlQueryDef[] = [
  // SBS-ACS-004 — Documented Justification for All Super Admin–Equivalent
  // Users. Active users carrying ViewAllData + ModifyAllData + ManageUsers
  // via permission sets. Per spec §5 the JustificationDoc__c custom field
  // is the documentation mechanism; the evaluator inspects each row.
  {
    id: 'acs-004-super-admin-equivalents',
    controlIds: ['SBS-ACS-004'],
    label: 'Active users with super-admin equivalent permission set assignments',
    soql:
      'SELECT Id, Username, JustificationDoc__c FROM User WHERE IsActive = true ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsViewAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsModifyAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsManageUsers = true)',
  },

  // SBS-INT-002 — Inventory and Justification of Remote Site Settings.
  // RemoteSiteSetting is Tooling-API-only; its Tooling sObject equivalent is
  // RemoteProxy. The active list is the inventory; the audit procedure asks
  // the consultant to verify each is documented + justified (questionnaire).
  {
    id: 'int-002-remote-site-settings-inventory',
    controlIds: ['SBS-INT-002'],
    label: 'Active remote site settings (outbound endpoints from Apex)',
    source: 'tooling',
    soql: 'SELECT Id, EndpointUrl, IsActive, MasterLabel FROM RemoteProxy WHERE IsActive = true',
    appliesWhen: toolingObjectExists('RemoteProxy'),
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

  // SBS-OAUTH-001 — Require Formal Installation of Connected Apps.
  // ConnectedApplication is a Tooling-API entity. Connected apps without a
  // managed-package namespace are org-local (ad-hoc), not formally installed
  // via a managed/unmanaged package. Pass = 0 rows; fail = N ad-hoc apps.
  {
    id: 'oauth-001-ad-hoc-connected-apps',
    controlIds: ['SBS-OAUTH-001'],
    label: 'Connected applications without a managed-package namespace (ad-hoc)',
    source: 'tooling',
    soql: 'SELECT Id, Name, NamespacePrefix FROM ConnectedApplication WHERE NamespacePrefix = null',
    appliesWhen: toolingObjectExists('ConnectedApplication'),
  },
];
