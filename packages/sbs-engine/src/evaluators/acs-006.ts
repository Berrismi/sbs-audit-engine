// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-006: Documented Justification for `Use Any API Client` Permission.
//
// CLI evidence path: scan-core query `acs-006-use-any-api-client-via-permsets`
// returns active users granted Use Any API Client via permset assignment.
// This permission bypasses Connected App allow-listing — high-impact misuse
// surface. Audit_procedure asks for documented justification + persona
// restriction per holder.
//
// Classification: cli_corroborating. Same shape as ACS-002 / ACS-003.
// Field-gated (`PermissionsUseAnyApiClient` may be absent on degraded
// editions); falls back to questionnaire when the gate fires.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-006',
  passFinding:
    'Respondent attests the `Use Any API Client` permission is restricted to a few highly-trusted users with documented justification.',
  failFinding:
    'Respondent attests the `Use Any API Client` permission is NOT restricted to a few highly-trusted users with documented justification. This permission bypasses Connected App allow-listing.',
  soqlQueryId: 'acs-006-use-any-api-client-via-permsets',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users granted Use Any API Client via permission set. Trivially compliant — the permission is unassigned at the permset layer.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active user-permset assignment(s) grant Use Any API Client. SOQL confirms the WHO; ` +
          'documented justification + persona restriction per assignment must be verified against the system of record. ' +
          'This permission bypasses Connected App allow-listing, so misuse is high-impact.',
      ],
    };
  },
});
