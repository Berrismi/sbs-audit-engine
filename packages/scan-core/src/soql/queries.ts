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
// Today's verified set:
//   - SBS-ACS-004   Super-admin equivalent users (PermSet OR Profile)
//   - SBS-ACS-005   Active users on standard profiles (custom-profile policy)
//   - SBS-ACS-012   Profiles with Login Hours configured (gated on field presence)
//   - SBS-INT-002   Remote Site Settings inventory (tooling, RemoteProxy)
//   - SBS-INT-003   Named Credentials inventory
//   - SBS-OAUTH-001 Connected Apps without managed-package namespace (tooling)

import { fieldsExist, toolingObjectExists } from './applies-when';
import type { SoqlQueryDef } from '../types';

export const DEFAULT_SOQL_QUERIES: readonly SoqlQueryDef[] = [
  // SBS-ACS-004 — Documented Justification for All Super Admin–Equivalent
  // Users. Enumerates active users carrying View All Data + Modify All Data
  // + Manage Users from EITHER a permission set OR their profile. The
  // evaluator uses this as inventory; the questionnaire adjudicates whether
  // each user has documented justification (authoring rule: don't search for
  // hypothetical __c fields — see file header).
  {
    id: 'acs-004-super-admin-equivalents',
    controlIds: ['SBS-ACS-004'],
    label: 'Active users with super-admin-equivalent permissions (PermSet or Profile)',
    // Two paths combined with OR inside the WHERE:
    //   Path A — permission-set-driven super-admin grants (assignee holds all
    //            three perms via permission sets, possibly different sets).
    //   Path B — profile-level super-admin grants (catches System Administrator
    //            and any custom profile cloned from it).
    soql:
      'SELECT Id, Username, Profile.Name FROM User WHERE IsActive = true AND (' +
      '(Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsViewAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsModifyAllData = true) ' +
      'AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.PermissionsManageUsers = true)) ' +
      'OR (Profile.PermissionsViewAllData = true AND Profile.PermissionsModifyAllData = true AND Profile.PermissionsManageUsers = true))',
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
