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
// Today's verified set (3 queries, three categories):
//   - SBS-ACS-004   Super-admin equivalent users (the spec §5 example)
//   - SBS-INT-002   Remote Site Settings inventory
//   - SBS-INT-003   Named Credentials inventory
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
  // The active RemoteSiteSetting list is the inventory; the audit
  // procedure asks the consultant to verify each is documented + justified.
  // Evaluator returns inventory size; "all justified" is a process attest.
  {
    id: 'int-002-remote-site-settings-inventory',
    controlIds: ['SBS-INT-002'],
    label: 'Active remote site settings (outbound endpoints from Apex)',
    soql: 'SELECT Id, EndpointUrl, IsActive, SiteName FROM RemoteSiteSetting WHERE IsActive = true',
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
];
