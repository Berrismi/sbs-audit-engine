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
// 7. **Validate against a live org before merging.** Before opening a PR
//    that adds or modifies a query, run:
//
//      pnpm validate:soql --target-org hm-cli-validation
//
//    The script appends `LIMIT 0` to each query and dry-executes it via
//    `sf data query`. NO_SUCH_COLUMN / NO_SUCH_OBJECT errors are caught at
//    the Salesforce parser before the PR ships. Queries with `appliesWhen`
//    are allowed to fail with a shape error (the runtime gate would skip
//    them too); queries WITHOUT `appliesWhen` MUST pass on the target org.
//    This is the regression guard for the alpha.14 + alpha.15 fabricated-
//    field-name bug class fixed in alpha.16. CI doesn't run this — author
//    discipline. See `packages/scan-core/scripts/validate-soql.ts`.
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
//   - SBS-ACS-007   NHI inventory: API-Only-profile users with internal UserType,
//                   inline Profile broad-perm flags (also used by ACS-008)
//   - SBS-ACS-008   NHI broad-permset grants: explicit Permission Set /
//                   Permission Set Group assignments to NHIs that grant any
//                   of the 5 broad-privilege booleans
//   (SBS-ACS-012 used to live here as a SOQL query against Profile.LoginHours*
//    fields — alpha.32 migrated to Metadata API after multi-org verification
//    showed those columns are absent on every edition. See evaluators/acs-012.ts.)
//   - SBS-DATA-002  Long Text Area + Rich Text Area field inventory by entity
//                   (EntityDefinition.Fields subquery, customizable entities)
//   - SBS-DEP-001 +
//   - SBS-DEP-003   Recent SetupAuditTrail (180-day window, capped 2000 rows).
//                   Single shared query; per-control evaluators apply the
//                   high-risk Section filter client-side because Section is
//                   not server-filterable.
//   - SBS-MON-001 +
//   - SBS-MON-002 +
//   - SBS-INT-004   EventLogFile capability detection — distinct EventTypes
//                   with COUNT + MIN/MAX(LogDate) for tier inference (free
//                   baseline vs Event Monitoring add-on vs extended retention).
//   - SBS-FILE-001  ContentDistribution rows without expiry (file-share lifetime)
//   - SBS-FILE-002  ContentDistribution rows without password (sensitive-link auth)
//   - SBS-INT-002   Remote Site Settings inventory (tooling, RemoteProxy, field-gated)
//   - SBS-INT-003   Named Credentials inventory
//   - SBS-OAUTH-001 Connected Apps without managed-package namespace (tooling, field-gated)
//                   + (alpha.17) ECA equivalent: ExternalClientApplication.NamespacePrefix
//   - SBS-OAUTH-002 Connected Apps not requiring admin approval (tooling, field-gated)
//                   + (alpha.17) ECA equivalent: ExtlClntAppOauthPlcyCnfg.PermittedUsersPolicyType
//   - SBS-DEP-006   (alpha.17) Connected Apps + ECAs with token policies that fail the
//                   90-day refresh / 15-minute session audit thresholds (multi-query)

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
  // Field shape: RemoteProxy has 15 fields across DE + production orgs;
  // the human-readable label is `SiteName`, not `MasterLabel`. The original
  // F.4 Bug C widening (toolingObjectExists → toolingFieldsExist) hid an
  // authoring bug — `MasterLabel` doesn't exist on RemoteProxy on any tier,
  // so the gate field-skipped everywhere and INT-002 never produced CLI
  // evidence. Multi-org verification (hm-cli-validation, ProdProksel,
  // loan-maven, alpha.30) confirmed the 15-field schema is identical across
  // editions; `SiteName` is the correct label field.
  {
    id: 'int-002-remote-site-settings-inventory',
    controlIds: ['SBS-INT-002'],
    label: 'Active remote site settings (outbound endpoints from Apex)',
    source: 'tooling',
    soql: 'SELECT Id, EndpointUrl, IsActive, SiteName FROM RemoteProxy WHERE IsActive = true',
    appliesWhen: toolingFieldsExist('RemoteProxy', ['Id', 'EndpointUrl', 'IsActive', 'SiteName']),
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

  // SBS-ACS-012 was previously a SOQL query against Profile.LoginHours*Start
  // fields. alpha.31 multi-org verification (DE hm-cli-validation, prod
  // ProdProksel, prod loan-maven) confirmed those fields are NOT present on
  // Profile in any modern Salesforce org — Profile.describe returns 0
  // LoginHours* columns across editions. The previous fieldsExist gate
  // therefore field-skipped on every consumer scan since the original
  // authoring, silently degrading the control to questionnaire-only.
  // alpha.32 migrates ACS-012 to the Metadata API (Profile.loginHours
  // sub-element) — see packages/sbs-engine/src/evaluators/acs-012.ts.
  // No SOQL query remains for this control.

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

  // SBS-ACS-007 — Maintain Inventory of Non-Human Identities. Surfaces
  // active users whose Profile carries `PermissionsApiUserOnly = true`
  // (the canonical platform signal for "this user can only authenticate
  // via API — no UI sessions") and whose UserType is internal-shaped
  // (Standard or CsnOnly — excludes portal/community/external user types).
  //
  // Why API-only-profile rather than name-pattern heuristics: the
  // audit_procedure lists OR-clauses on username substrings ("integration",
  // "api", "bot", "automation", "service") and on Einstein Bot
  // associations. Substring matching is inherently noisy — orgs that name
  // integration users `crm_sync@...` or `marketo-conn@...` get missed,
  // and orgs that have a human user named `service.thompson@...` get false
  // positives. The API-Only profile flag is unambiguous: it's a platform
  // primitive and an org consciously toggles it on. Profile-API-Only
  // captures the high-precision NHI population; the questionnaire still
  // adjudicates whether the inventory is COMPLETE (e.g., bots, automation
  // users, OAuth-only integrations the customer manages out-of-band).
  //
  // Includes Profile-level broad-permission booleans inline so the
  // companion ACS-008 evaluator (which consumes BOTH this query and the
  // companion permset query below) can flag NHI users whose profile
  // already grants View All / Modify All / Manage Users / Author Apex /
  // Customize Application without needing a third roundtrip.
  //
  // Field-gate is defensive: PermissionsApiUserOnly + the 5 broad-perm
  // booleans are universal across editions today, but the gate matches
  // the F.4 Bug C pattern as a forward-looking shield.
  {
    id: 'acs-007-nhi-inventory',
    controlIds: ['SBS-ACS-007', 'SBS-ACS-008'],
    label: 'Active non-human identities (API-Only profile users with internal UserType)',
    soql:
      'SELECT Id, Username, Name, UserType, LastLoginDate, ' +
      'Profile.Name, Profile.PermissionsViewAllData, Profile.PermissionsModifyAllData, ' +
      'Profile.PermissionsManageUsers, Profile.PermissionsAuthorApex, ' +
      'Profile.PermissionsCustomizeApplication ' +
      'FROM User ' +
      'WHERE IsActive = true AND Profile.PermissionsApiUserOnly = true ' +
      "AND UserType IN ('Standard', 'CsnOnly') " +
      'ORDER BY Username',
    appliesWhen: fieldsExist('Profile', [
      'PermissionsApiUserOnly',
      'PermissionsViewAllData',
      'PermissionsModifyAllData',
      'PermissionsManageUsers',
      'PermissionsAuthorApex',
      'PermissionsCustomizeApplication',
    ]),
  },

  // SBS-ACS-008 — Restrict Broad Privileges for Non-Human Identities.
  // Companion to acs-007-nhi-inventory: enumerates explicit (non-profile-
  // owned) Permission Set / Permission Set Group assignments that grant
  // any of the 5 broad-privilege booleans (View All Data, Modify All Data,
  // Manage Users, Author Apex, Customize Application) to a user that
  // ALSO matches the NHI inventory criteria.
  //
  // Profile-level broad perms are surfaced by the inventory query above
  // (Profile.PermissionsViewAllData et al inline), so the evaluator
  // unions across both rows-sets. This split is necessary because the
  // inventory query returns one row per User while broad-permset grants
  // require relationship traversal on PermissionSetAssignment — different
  // root sObjects.
  //
  // `PermissionSet.IsOwnedByProfile = false` excludes the implicit
  // backing permset that every Profile has — those are already covered
  // by the inventory's Profile.* booleans. Counting them again here
  // would double-count.
  //
  // Field-gate is defensive (universal fields today). Same shape as
  // ACS-004's permset path, which is the reference for relationship-
  // traversal-not-semi-join queries.
  {
    id: 'acs-008-nhi-broad-permset-grants',
    controlIds: ['SBS-ACS-008'],
    label:
      'Permission Set / Permission Set Group grants of broad privileges to non-human identities',
    soql:
      'SELECT AssigneeId, Assignee.Username, Assignee.Profile.Name, ' +
      'PermissionSet.Label, ' +
      'PermissionSet.PermissionsViewAllData, PermissionSet.PermissionsModifyAllData, ' +
      'PermissionSet.PermissionsManageUsers, PermissionSet.PermissionsAuthorApex, ' +
      'PermissionSet.PermissionsCustomizeApplication ' +
      'FROM PermissionSetAssignment ' +
      'WHERE Assignee.IsActive = true ' +
      'AND Assignee.Profile.PermissionsApiUserOnly = true ' +
      "AND Assignee.UserType IN ('Standard', 'CsnOnly') " +
      'AND PermissionSet.IsOwnedByProfile = false ' +
      'AND (PermissionSet.PermissionsViewAllData = true ' +
      'OR PermissionSet.PermissionsModifyAllData = true ' +
      'OR PermissionSet.PermissionsManageUsers = true ' +
      'OR PermissionSet.PermissionsAuthorApex = true ' +
      'OR PermissionSet.PermissionsCustomizeApplication = true)',
    appliesWhen: fieldsExist('PermissionSet', [
      'PermissionsViewAllData',
      'PermissionsModifyAllData',
      'PermissionsManageUsers',
      'PermissionsAuthorApex',
      'PermissionsCustomizeApplication',
      'IsOwnedByProfile',
    ]),
  },

  // SBS-DATA-002 — Maintain an Inventory of Long Text Area Fields Containing
  // Regulated Data. Surfaces every (EntityDefinition × FieldDefinition) pair
  // where the field is a Long Text Area or Rich Text Area type. These two
  // DataTypes are the long-form free-text containers Salesforce admins
  // most often use to store unstructured commentary — exactly where PII
  // and other regulated data tends to leak in unmanaged-text flows
  // (Case.Description holding SSNs, custom Notes__c carrying birthdays,
  // EmailMessage.HtmlBody capturing copy-pasted account info, ...).
  //
  // ============================================================================
  // GOTCHA: FieldDefinition queries cannot run unbounded.
  // ============================================================================
  // Salesforce requires every FieldDefinition query to filter on
  // EntityDefinition (either via parent-relationship traversal as we do
  // here, or via WHERE EntityDefinition.QualifiedApiName = ...) — bare
  // `SELECT ... FROM FieldDefinition WHERE DataType LIKE '...'` returns
  // a Salesforce 400 ("filter operator is not valid for the filter field
  // EntityDefinitionId" or similar). We use the parent-side EntityDefinition
  // query with an inline `(SELECT ... FROM Fields ...)` subquery, which
  // is the supported pattern for cross-entity field inventory.
  //
  // GOTCHA: DataType is an OPAQUE STRING, not a normalized enum.
  // ============================================================================
  // The DataType column on FieldDefinition returns formatted strings like
  // `"Long Text Area(32000)"` and `"Rich Text Area(32000)"` — the length
  // is concatenated into the type label. Equality matching against
  // `'LongTextArea'` or `'Html'` (the metadata-API enum names) returns 0
  // rows. The empirical correct match is `LIKE 'Long Text Area%'` and
  // `LIKE 'Rich Text Area%'` (DE-validated). Salesforce does not expose
  // the DataType picklist via describe (the `picklistValues` array is
  // empty), so this is a discover-empirically situation — see the project
  // memory `feedback_describe_first_authoring.md` for the discipline rule.
  //
  // ============================================================================
  // Filter scope: `IsCustomizable = true` on EntityDefinition restricts to
  // entities admins can extend (standard objects + custom objects), excluding
  // platform-internal entities (audit trails, async-job tracking, system
  // log objects). On bare DE this returns 214 EntityDefinition rows, of
  // which 77 hold ≥1 LTA/Rich Text field (mostly the standard `.Description`
  // pattern). On a real production org with custom objects, expect the
  // count to expand to 100s of fields.
  //
  // The evaluator filters out entities with 0 LTA/Rich rows and reports
  // (entity_count, total_field_count) as the inventory size; the documented
  // inventory verification is questionnaire territory.
  {
    id: 'data-002-lta-rich-text-field-inventory',
    controlIds: ['SBS-DATA-002'],
    label: 'Inventory of Long Text Area + Rich Text Area fields by entity',
    soql:
      'SELECT QualifiedApiName, Label, ' +
      '(SELECT QualifiedApiName, Label, DataType, Length FROM Fields ' +
      "WHERE DataType LIKE 'Long Text Area%' OR DataType LIKE 'Rich Text Area%') " +
      'FROM EntityDefinition WHERE IsCustomizable = true',
    appliesWhen: fieldsExist('EntityDefinition', ['QualifiedApiName', 'Label', 'IsCustomizable']),
  },

  // SBS-DEP-001 + SBS-DEP-003 — Deployment-identity attribution + monitoring
  // of high-risk metadata changes. Both controls share the same SetupAuditTrail
  // window; the per-control evaluators differ only in how they interpret the
  // same row set.
  //
  // ============================================================================
  // GOTCHAS discovered against DE describe (record for future audit-trail work):
  // ============================================================================
  // - `Section` is **not filterable** server-side. SetupAuditTrail.Section
  //   carries the Setup-area name (e.g. "Apex Class", "Permission Set Group",
  //   "Manage Users") but the field is `filterable: false` in the describe.
  //   You CAN select it; you CANNOT WHERE-clause on it. Attempting
  //   `WHERE Section IN (...)` returns "field 'Section' can not be filtered
  //   in a query call". The supported pattern is to pull rows by date and
  //   filter the high-risk subset in the evaluator.
  // - `Action` looks like an enum but its describe is `type: string` with
  //   an empty `picklistValues` array. The internal action strings are
  //   stable ("createdApexClass", "PermSetCreate", "changedpassword", ...)
  //   but Salesforce does not expose the enum, so we cannot safely
  //   server-side-filter on Action either without a brittle hand-curated
  //   IN clause.
  // - Default retention varies by edition (180 days standard, longer with
  //   Field Audit Trail). LAST_N_DAYS:180 is the safe upper bound; the
  //   query LIMIT 2000 is the runtime safety cap (busy orgs have thousands
  //   of audit rows in 180 days). The evaluators surface a "result may be
  //   capped" caveat when the row count hits the limit.
  // ============================================================================
  //
  // The query is intentionally broad (no Section filter, no Action filter)
  // because both restrictions above force evaluator-side filtering anyway.
  // The high-risk Section list lives in the evaluator (`packages/sbs-engine/
  // src/evaluators/_high-risk-sections.ts`), shared by DEP-001 + DEP-003 so
  // the two controls always use the identical scope.
  {
    id: 'dep-setup-audit-trail-recent',
    controlIds: ['SBS-DEP-001', 'SBS-DEP-003'],
    label: 'Recent Setup Audit Trail entries (180-day window, capped at 2000 rows)',
    soql:
      'SELECT Id, Action, Section, CreatedById, CreatedBy.Username, CreatedDate ' +
      'FROM SetupAuditTrail ' +
      'WHERE CreatedDate = LAST_N_DAYS:180 ' +
      'ORDER BY CreatedDate DESC ' +
      'LIMIT 2000',
  },

  // SBS-MON-001 + SBS-MON-002 + SBS-INT-004 — EventLogFile capability
  // detection. Three controls share one query against the EventLogFile
  // dataset; per-control evaluators interpret the same row set differently.
  //
  // The capability tier model (per Salesforce Event Monitoring docs):
  //
  //   Free baseline (Enterprise/Unlimited/Performance edition, no add-on):
  //     - Event types: Login, Logout, ApiTotalUsage (limited set)
  //     - Retention: 1 day (logs purged after 24h)
  //
  //   Event Monitoring add-on:
  //     - Event types: 50+ including ApexExecution, ReportExport, FileDownload,
  //       URI, LightningInteraction, etc.
  //     - Retention: 30 days standard, up to 1 year with extended retention
  //
  //   Edition-gated (e.g. Essentials, Professional without add-on):
  //     - EventLogFile object may not be queryable at all
  //
  // The query GROUPs by EventType and returns COUNT + MIN(LogDate) +
  // MAX(LogDate). Three signals fall out:
  //   1. Number of distinct EventTypes (1-3 = free; 5+ = add-on)
  //   2. LogDate spread per EventType (~1 day = free; 30+ days = add-on)
  //   3. Presence/absence of specific high-value EventTypes (ApiTotalUsage
  //      for INT-004; LightningInteraction et al for MON-001)
  //
  // The query carries no WHERE filter so we get the complete inventory of
  // what's been generated + retained. Bare DE returns 0 rows (no API
  // activity); a busy org returns one row per EventType. The aggregate
  // GROUP BY caps the result at the number of distinct event types
  // (~50 max), so no LIMIT is needed.
  //
  // Field-gate is defensive: EventLogFile + EventType are universal where
  // EventLogFile exists, but the gate matches the F.4 Bug C pattern as a
  // forward-looking shield against edition-gated field changes.
  {
    id: 'event-log-file-capability',
    controlIds: ['SBS-MON-001', 'SBS-MON-002', 'SBS-INT-004'],
    label: 'Event Monitoring capability detection — EventType counts + retention spread',
    soql:
      'SELECT EventType, COUNT(Id) cnt, MIN(LogDate) earliest, MAX(LogDate) latest ' +
      'FROM EventLogFile ' +
      'GROUP BY EventType ' +
      'ORDER BY EventType',
    appliesWhen: fieldsExist('EventLogFile', ['EventType', 'LogDate']),
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

  // ============================================================================
  // ECA layer (alpha.17) — External Client Apps are Salesforce's modern
  // replacement for Connected Apps; net-new integrations from Spring '26 are
  // expected to use ECAs. Token policies, admin-gating, and IP restrictions
  // live on a separate set of standard SOQL entities (`ExternalClientApplication`
  // + `ExtlClntApp*`), NOT on the legacy Tooling `ConnectedApplication` surface.
  //
  // Architectural note: every ECA entity here is queryable via the STANDARD
  // SOQL endpoint, not Tooling. We mistakenly went through `--use-tooling-api`
  // initially and got "sObject type not supported" errors for every
  // ExtlClntApp* entity — the EntityDefinition catalog lists them as
  // `IsQueryable = true`, but only via the standard endpoint. `source:
  // 'tooling'` is intentionally NOT set on these queries.
  //
  // Validated against the `ProdProksel` org alias, which carries 1 live ECA
  // ("Wengrow CRM Sync") with a 24-year refresh token and self-service
  // authorization — exactly the kind of misconfiguration the OAUTH/DEP audits
  // target. DE returns 0 rows for every ECA query (no apps installed), which
  // is the correct trivially-compliant outcome.
  //
  // Authoring rule: every existing OAUTH/DEP control with a Connected
  // Application query SHOULD ship a parallel ECA query so customer migrations
  // from CA → ECA don't regress evidence coverage.
  // ============================================================================

  // SBS-OAUTH-001 (ECA path) — Require Formal Installation of Connected Apps,
  // applied to External Client Applications. Same shape as the
  // ConnectedApplication query above: enumerate entries WITHOUT a managed-
  // package namespace (`NamespacePrefix = null` = ad-hoc / org-local). Pass =
  // 0 rows; fail = N rows. The evaluator merges this with the Tooling
  // ConnectedApplication query for a unified ad-hoc inventory finding.
  {
    id: 'oauth-001-ad-hoc-external-client-apps',
    controlIds: ['SBS-OAUTH-001'],
    label: 'External Client Applications without a managed-package namespace (ad-hoc)',
    soql:
      'SELECT Id, MasterLabel, DeveloperName, NamespacePrefix ' +
      'FROM ExternalClientApplication WHERE NamespacePrefix = null',
    appliesWhen: fieldsExist('ExternalClientApplication', [
      'Id',
      'MasterLabel',
      'DeveloperName',
      'NamespacePrefix',
    ]),
  },

  // SBS-OAUTH-002 (ECA path) — Require Profile or Permission Set Access
  // Control for External Client Applications. The ECA equivalent of
  // `ConnectedApplication.OptionsAllowAdminApprovedUsersOnly` is
  // `ExtlClntAppOauthPlcyCnfg.PermittedUsersPolicyType`, a picklist:
  //   - `AllSelfAuthorized` — any user can self-authorize → fails the audit
  //   - `AdminApprovedPreAuthorized` — only assigned profiles/permsets →
  //     passes the audit
  //
  // The query surfaces ECAs in the AllSelfAuthorized state and joins back to
  // the parent ECA for naming. Evaluator merges with the Tooling
  // ConnectedApplication query for a unified inconclusive finding.
  {
    id: 'oauth-002-eca-without-admin-approval',
    controlIds: ['SBS-OAUTH-002'],
    label: 'External Client Apps not requiring admin approval (self-service authorization allowed)',
    soql:
      'SELECT Id, ExternalClientApplicationId, PermittedUsersPolicyType ' +
      "FROM ExtlClntAppOauthPlcyCnfg WHERE PermittedUsersPolicyType = 'AllSelfAuthorized'",
    appliesWhen: fieldsExist('ExtlClntAppOauthPlcyCnfg', [
      'Id',
      'ExternalClientApplicationId',
      'PermittedUsersPolicyType',
    ]),
  },

  // SBS-DEP-006 (legacy ConnectedApplication path) — Configure Salesforce
  // CLI Connected App with Token Expiration Policies. Audit asks that
  // refresh-token validity be ≤90 days and session timeout ≤15 minutes.
  //
  // The Tooling `ConnectedApplication.RefreshTokenValidityPeriod` field is
  // an `int` with no separate unit field exposed via SOQL. Salesforce
  // ConnectedApp metadata XML uses `<refreshTokenValidityPeriodUnit>` (days
  // by default), but the SOQL int doesn't surface that unit, so we cannot
  // safely emit a numeric "exceeds 90 days" comparison from this field
  // alone — the unit could be hours, days, months depending on the app's
  // metadata. Conservative semantic: enumerate apps where the field IS
  // NULL (unambiguous "no explicit expiry policy") and let the consultant
  // verify numeric values in Setup. The evaluator surfaces this caveat in
  // the finding.
  //
  // The corresponding ECA query below DOES surface a precise unit + period
  // pair, so for ECA-only customers this control is fully numeric.
  {
    id: 'dep-006-connected-apps-without-token-expiry',
    controlIds: ['SBS-DEP-006'],
    label: 'Connected Applications with no explicit refresh-token expiry policy set',
    source: 'tooling',
    soql: 'SELECT Id, Name FROM ConnectedApplication WHERE RefreshTokenValidityPeriod = null',
    appliesWhen: toolingFieldsExist('ConnectedApplication', [
      'Id',
      'Name',
      'RefreshTokenValidityPeriod',
    ]),
  },

  // SBS-DEP-006 (ECA path) — pull every ECA's OAuth policy configuration so
  // the evaluator can classify each against the audit thresholds:
  //   - `RefreshTokenPolicyType = 'Infinite'` → fails (never expires)
  //   - `RefreshTokenPolicyType = 'SpecificLifetime'` AND validity > 90 days
  //     (after `RefreshTokenValidityUnit` conversion) → fails
  //   - `SessionTimeoutInMinutes > 15` → fails
  //
  // No WHERE clause filtering: pull every policy config and let the
  // evaluator do the threshold logic. This makes the inventory complete and
  // lets us also enumerate compliant apps in the finding when useful.
  {
    id: 'dep-006-eca-token-policies',
    controlIds: ['SBS-DEP-006'],
    label: 'External Client App OAuth policy configurations (refresh-token + session timeout)',
    soql:
      'SELECT Id, ExternalClientApplicationId, RefreshTokenPolicyType, ' +
      'RefreshTokenValidityPeriod, RefreshTokenValidityUnit, SessionTimeoutInMinutes ' +
      'FROM ExtlClntAppOauthPlcyCnfg',
    appliesWhen: fieldsExist('ExtlClntAppOauthPlcyCnfg', [
      'Id',
      'ExternalClientApplicationId',
      'RefreshTokenPolicyType',
      'RefreshTokenValidityPeriod',
      'RefreshTokenValidityUnit',
      'SessionTimeoutInMinutes',
    ]),
  },

  // SBS-CPORTAL-002 — Restrict Guest User Record Access. Surfaces every
  // ObjectPermissions row whose Parent profile is a Guest profile (UserType
  // = 'Guest') and grants any permission (Read/Create/Edit/Delete/ViewAll/
  // ModifyAll) on a business object.
  //
  // Audit_procedure: guest user profiles must have all business-object
  // permissions disabled, with permissions exclusively for authentication
  // flows (login, registration, password reset). The "business-related"
  // distinction is customer-policy territory (auth-flow objects vary by
  // implementation: some orgs use Account/Contact for self-service
  // registration, which is a permitted exception). CLI surfaces the
  // inventory of guest-profile object permissions; questionnaire confirms
  // which are necessary for auth flows vs. over-broad.
  //
  // Pass = 0 rows (no guest profile grants any object permission).
  // Inconclusive = N rows (defer to questionnaire whether each is an
  // intentional auth-flow exception or an over-broad grant).
  //
  // ObjectPermissions parents to PermissionSet (the implicit one backing
  // every Profile); we traverse Parent.Profile.UserType = 'Guest' to
  // restrict to guest profiles only.
  //
  // The query is bounded by the Guest UserType filter — bare DE returns 0
  // rows (no community installed); production orgs with communities have
  // a small fixed set of guest profiles, so the result set stays tractable.
  {
    id: 'cportal-002-guest-profile-object-permissions',
    controlIds: ['SBS-CPORTAL-002'],
    label: 'Object permissions granted to Guest profiles (Experience Cloud guest users)',
    soql:
      'SELECT Id, Parent.Profile.Name, SobjectType, ' +
      'PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, ' +
      'PermissionsViewAllRecords, PermissionsModifyAllRecords ' +
      'FROM ObjectPermissions ' +
      "WHERE Parent.Profile.UserType = 'Guest' " +
      'AND (PermissionsRead = true OR PermissionsCreate = true OR PermissionsEdit = true ' +
      'OR PermissionsDelete = true OR PermissionsViewAllRecords = true ' +
      'OR PermissionsModifyAllRecords = true)',
  },

  // SBS-MON-003 — Monitor for Suspicious Logins. Inventory of
  // TransactionSecurityPolicy (Tooling) records, with EventType filter
  // surfacing whether login-event monitoring is configured at the platform
  // layer.
  //
  // The audit_procedure asks for a continuous SIEM/analytics solution
  // monitoring login anomalies (impossible travel, suspicious networks,
  // off-hours patterns, brute-force precursors). External SIEM integration
  // is questionnaire territory; the CLI evidence path surfaces Salesforce's
  // INTERNAL Transaction Security Policy as a corroborating signal:
  //   - 0 TSPs configured → no internal monitoring policies (defer to
  //     questionnaire whether external SIEM exists)
  //   - N TSPs configured but none for EventType='Login' → internal
  //     monitoring exists for other event types but not specifically
  //     for login anomalies
  //   - N TSPs with EventType='Login' → internal login monitoring exists
  //     at the platform layer; questionnaire confirms external SIEM
  //     scope + investigation procedures
  //
  // EventType picklist (verified via DE describe): AuditTrail, Login,
  // Entity, DataExport, AccessResource. Pull all 5 — the evaluator
  // separates the Login-specific count from the rest.
  //
  // TransactionSecurityPolicy is queryable via Tooling on every edition
  // that ships TSP infrastructure (Enterprise+); the appliesWhen gate
  // covers edition-stripped DE/Essentials.
  {
    id: 'mon-003-transaction-security-policies',
    controlIds: ['SBS-MON-003'],
    label: 'Transaction Security Policies (internal anomaly-monitoring infrastructure)',
    source: 'tooling',
    soql:
      'SELECT Id, DeveloperName, MasterLabel, Type, State, EventType, EventName ' +
      'FROM TransactionSecurityPolicy',
    appliesWhen: toolingFieldsExist('TransactionSecurityPolicy', [
      'Id',
      'DeveloperName',
      'Type',
      'State',
      'EventType',
    ]),
  },
];
