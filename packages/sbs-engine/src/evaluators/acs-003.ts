// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-003: Documented Justification for `Approve Uninstalled Connected Apps` Permission.
//
// CLI evidence path: scan-core query
// `acs-003-approve-uninstalled-connected-apps-via-permsets` returns active
// users granted this permission via permset assignment. The audit_procedure
// asks whether each entry is justified + restricted to admin/integration
// personas — that's process.
//
// Classification: cli_corroborating. Same shape as ACS-002 — surface the
// inventory; questionnaire confirms documented justification + persona fit.
// Field-gated on `PermissionsCanApproveUninstalledApps` (defensive — the
// field is universal but the gate guards against future Salesforce field
// drift; alpha.14 originally shipped a fabricated field name, alpha.16
// corrected after live DE validation).

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-003',
  passFinding:
    'Respondent attests the `Approve Uninstalled Connected Apps` permission is restricted to a few highly-trusted admins, each with written justification.',
  failFinding:
    'Respondent attests the `Approve Uninstalled Connected Apps` permission is NOT properly restricted with documented justification per holder. End-users with this permission can self-approve OAuth grants.',
  soqlQueryId: 'acs-003-approve-uninstalled-connected-apps-via-permsets',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users granted Approve Uninstalled Connected Apps via permission set. Trivially compliant — the permission is unassigned at the permset layer.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active user-permset assignment(s) grant Approve Uninstalled Connected Apps. SOQL confirms the WHO; ` +
          'documented justification + admin/integration persona fit per assignment must be verified against the system of record.',
      ],
    };
  },
});
