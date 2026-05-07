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
//   - SBS-ACS-001   Custom permission sets inventory (model documentation)
//   - SBS-ACS-002   Active users with API-Enabled (via permset assignment)
//   - SBS-ACS-003   Active users with Approve Uninstalled Connected Apps (via permset assignment)
//   - SBS-ACS-004   Super-admin equivalent users — split into two queries:
//                     • via-permsets (PermissionSetAssignment relationship)
//                     • via-profile  (Profile-level boolean perms)
//                   Evaluator merges. Avoids the 3-semi-join SOQL limit.
//   - SBS-ACS-005   Active users on standard profiles (custom-profile policy)
//   - SBS-ACS-006   Active users with Use Any API Client (via permset assignment)
//   - SBS-ACS-012   Profiles with Login Hours configured (gated on field presence)
//   - SBS-FILE-001  ContentDistribution rows without expiry (file-share lifetime)
//   - SBS-FILE-002  ContentDistribution rows without password (sensitive-link auth)
//   - SBS-INT-002   Remote Site Settings inventory (tooling, RemoteProxy, field-gated)
//   - SBS-INT-003   Named Credentials inventory
//   - SBS-OAUTH-001 Connected Apps without managed-package namespace (tooling, field-gated)
//   - SBS-OAUTH-002 Connected Apps not requiring admin approval (tooling, field-gated)

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

  // SBS-FILE-002 — Require Passwords on Public Content Links for Sensitive
  // Content. Same surface as FILE-001 (ContentDistribution); different signal:
  // `PreferencesPasswordRequired = false` rows are Public Content links a
  // recipient can open with the URL alone, no auth layer in front. Audit
  // procedure asks the consultant to verify that links to *sensitive* content
  // are password-protected — but "is this content sensitive?" is org-level
  // data classification (process), not a platform field. So this query
  // enumerates the WHO (links not requiring a password); the questionnaire
  // still adjudicates sensitivity. Classification is `cli_corroborating`,
  // not `cli_primary` — same shape as INT-002 / INT-003.
  //
  // Field choice rationale: `PreferencesPasswordRequired` (boolean preference)
  // is preferred over `WHERE Password = null` (the secret-value family) for
  // two reasons. (1) Consistency with FILE-001's `PreferencesExpires = false`:
  // both Public Content link controls now filter on the same Preferences*
  // boolean family, mirroring how the Salesforce admin UI exposes these
  // toggles. (2) The Password field's value is masked on read in some
  // contexts; the Preferences* boolean is a less access-sensitive surface
  // and a more direct expression of the audit question ("does this link
  // enforce password protection?").
  //
  // Edition gate: same `fieldsExist` pattern as FILE-001. ContentDocumentId
  // is intentionally NOT in the SELECT — same privacy posture as FILE-001:
  // count + flag, never surface which file each non-password-protected link
  // points to.
  {
    id: 'file-002-content-distributions-without-passwords',
    controlIds: ['SBS-FILE-002'],
    label: 'Public Content links lacking password protection',
    soql: 'SELECT Id FROM ContentDistribution WHERE PreferencesPasswordRequired = false',
    appliesWhen: fieldsExist('ContentDistribution', ['Id', 'PreferencesPasswordRequired']),
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

  // SBS-ACS-001 — Enforce a Documented Permission Set Model. Audit_procedure
  // step 2 says "Enumerate all Profiles, Permission Sets, and Permission Set
  // Groups." The platform can produce that inventory; "matches the documented
  // model" is process. We enumerate non-managed-package permission sets
  // (`IsCustom = true`) — managed-package perm sets are author-controlled
  // upstream and out of scope for the org's documentation discipline. Pass =
  // 0 rows (org has no custom perm sets — trivially compliant); ≥1 rows =
  // inconclusive, questionnaire confirms each is in the documented model.
  // Same shape as INT-002 / INT-003.
  {
    id: 'acs-001-custom-permission-sets-inventory',
    controlIds: ['SBS-ACS-001'],
    label: 'Custom (non-managed-package) permission sets inventory',
    soql: 'SELECT Id, Label, Name FROM PermissionSet WHERE IsCustom = true',
    appliesWhen: fieldsExist('PermissionSet', ['Id', 'Label', 'Name', 'IsCustom']),
  },

  // SBS-ACS-002 — Documented Justification for All API-Enabled Authorizations.
  // Audit_procedure step 1 enumerates profiles/permsets/permset-groups granting
  // `API Enabled`. We surface the WHO (active users with API-Enabled via
  // permset assignment); the questionnaire confirms each entry has documented
  // justification. Profile-direct grants are not enumerated here — that's a
  // known gap addressed by the `Profile.PermissionsApiEnabled` cross-check
  // the consultant performs out-of-band; the inventory we surface is the
  // permset-driven population (the more common modern grant pattern).
  {
    id: 'acs-002-api-enabled-via-permsets',
    controlIds: ['SBS-ACS-002'],
    label: 'Active users granted API Enabled via permission set',
    soql:
      'SELECT AssigneeId, Assignee.Username, PermissionSet.Label ' +
      'FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = true AND PermissionSet.PermissionsApiEnabled = true',
  },

  // SBS-ACS-003 — Documented Justification for Approve Uninstalled Connected
  // Apps Permission. Same pattern as ACS-002: surface the inventory of users
  // granted this permission via permset; questionnaire confirms each is
  // justified + restricted to admin/integration personas.
  //
  // The Salesforce metadata-API name for this permission is
  // `PermissionsCanApproveUninstalledApps` ("Approve Uninstalled Connected
  // Apps" in the Setup UI). alpha.14 shipped a fabricated name
  // (`PermissionsApprovedConnectedAppsAccess`) that doesn't exist on any
  // edition; the field-gate caught it everywhere → silent questionnaire
  // fallback for every consumer. Corrected in alpha.16 against the live DE
  // describe (557 PermissionSet fields enumerated).
  //
  // Field-gate retained as a defensive measure for future field-deprecation
  // events.
  {
    id: 'acs-003-approve-uninstalled-connected-apps-via-permsets',
    controlIds: ['SBS-ACS-003'],
    label: 'Active users granted Approve Uninstalled Connected Apps via permission set',
    soql:
      'SELECT AssigneeId, Assignee.Username, PermissionSet.Label ' +
      'FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = true AND PermissionSet.PermissionsCanApproveUninstalledApps = true',
    appliesWhen: fieldsExist('PermissionSet', ['Id', 'PermissionsCanApproveUninstalledApps']),
  },

  // SBS-ACS-006 — Documented Justification for Use Any API Client Permission.
  // Same pattern as ACS-002 / ACS-003. Surfacing the WHO; questionnaire
  // adjudicates the WHY. The Use Any API Client permission bypasses Connected
  // App allow-listing — misuse is high-impact integration risk.
  //
  // ============================================================================
  // CONDITIONAL FIELD — feature-gated, not edition-gated.
  // ============================================================================
  // The `PermissionsUseAnyApiClient` field only materializes on PermissionSet
  // when "API Access Control" is enabled on the org. API Access Control is
  // NOT a self-service Setup toggle — it requires a case to Salesforce
  // Support to turn on. When the feature is OFF, the permission cannot exist
  // anywhere on the org schema, so the field-gate skip is the CORRECT
  // semantic outcome: there is literally no inventory to maintain.
  //
  // (Salesforce briefly announced deprecation of "Use Any API Client" but
  // reversed course on 2025-11-19; the permission stays, with reduced
  // capability — it no longer permits connecting brand-new Connected Apps
  // for newly-created assignments.)
  //
  // Today the gate-skip degrades to questionnaire fallback like every other
  // skip reason. The richer "feature-not-enabled → N/A" UX is a future
  // SkipRule.kind enhancement (tracked separately).
  // ============================================================================
  //
  // Query shape: includes `PermissionSet.IsOwnedByProfile` so the evaluator
  // can separate profile-derived assignments (every profile has a backing
  // permission set, IsOwnedByProfile = true) from explicit Permission Set /
  // Permission Set Group assignments (false). Audit_procedure asks for both
  // pathways to be inventoried.
  //
  // Field-gate covers `IsOwnedByProfile` and `Assignee.Name` for completeness;
  // those are universal but defensive listing matches the F.4 Bug C pattern.
  // alpha.14 shipped this query but it never ran (right field name, but the
  // sample DE org had API Access Control off → gate-skipped silently);
  // alpha.16 enriched the SELECT and documented the conditional-field
  // semantics so future-us doesn't mistake "skip" for "broken."
  {
    id: 'acs-006-use-any-api-client-via-permsets',
    controlIds: ['SBS-ACS-006'],
    label: 'Active users granted Use Any API Client via permission set',
    soql:
      'SELECT AssigneeId, Assignee.Name, Assignee.Username, ' +
      'PermissionSet.Name, PermissionSet.Label, PermissionSet.IsOwnedByProfile ' +
      'FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = true AND PermissionSet.PermissionsUseAnyApiClient = true ' +
      'ORDER BY Assignee.Name',
    appliesWhen: fieldsExist('PermissionSet', [
      'Id',
      'PermissionsUseAnyApiClient',
      'IsOwnedByProfile',
    ]),
  },

  // SBS-OAUTH-002 — Require Profile or Permission Set Access Control for
  // Connected Apps. ConnectedApplication's `OptionsAllowAdminApprovedUsersOnly`
  // flag is the platform-side signal for "admin approved users are
  // pre-authorized" — when true, only assigned profiles/permsets can use
  // the app. When false, any authenticated user can self-authorize. The
  // audit_procedure step 2 asks the consultant to verify "access is
  // granted only through assigned profiles or permission sets" — that's
  // exactly what this flag enforces.
  //
  // Classification: cli_corroborating per the roadmap. SOQL surfaces apps
  // without admin-approval requirement; questionnaire confirms whether
  // those are intentional (e.g., a managed-package app intended for
  // self-service) or a real misconfiguration. Pass = 0 rows (every app
  // requires admin approval); ≥1 rows = inconclusive (deferring intent
  // verification to questionnaire).
  //
  // alpha.15 shipped this query against the field name
  // `OptionsAdminApprovalRequired` which doesn't exist on ConnectedApplication
  // (Tooling or standard); the field-gate caught it everywhere → silent
  // questionnaire fallback for every consumer. The actual field is
  // `OptionsAllowAdminApprovedUsersOnly`, verified via Tooling-API
  // ConnectedApplication describe (34 fields enumerated). Corrected in
  // alpha.16; field-gate retained as defensive shield against future Tooling
  // column drift.
  {
    id: 'oauth-002-connected-apps-without-admin-approval',
    controlIds: ['SBS-OAUTH-002'],
    label:
      'Connected applications not requiring admin approval (self-service authorization allowed)',
    source: 'tooling',
    soql: 'SELECT Id, Name FROM ConnectedApplication WHERE OptionsAllowAdminApprovedUsersOnly = false',
    appliesWhen: toolingFieldsExist('ConnectedApplication', [
      'Id',
      'Name',
      'OptionsAllowAdminApprovedUsersOnly',
    ]),
  },
];
