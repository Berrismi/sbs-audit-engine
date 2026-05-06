// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-002: Documented Justification for All `API-Enabled` Authorizations.
//
// CLI evidence path: scan-core query `acs-002-api-enabled-via-permsets`
// returns the active users granted API Enabled via permission-set
// assignment. The platform enumerates the WHO; the audit_procedure asks
// whether each entry has documented justification — that's process.
//
// Classification: cli_corroborating. Same shape as INT-002 / INT-003.
// 0 rows = pass (no permset-driven API-Enabled users to justify);
// ≥1 rows = inconclusive, deferring documentation to questionnaire.
// Profile-direct grants are not enumerated here — that gap is addressed
// by the consultant's out-of-band Profile inspection.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-002',
  passFinding:
    'Respondent attests every user with the `API Enabled` permission has documented business or technical justification.',
  failFinding:
    'Respondent attests they do NOT have documented justification for every `API Enabled` user. Programmatic access without documented need expands the attack surface.',
  soqlQueryId: 'acs-002-api-enabled-via-permsets',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users granted API Enabled via permission set. Trivially compliant — the inventory to justify is empty (verify Profile-direct grants out-of-band).',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active user-permset assignment(s) grant API Enabled. SOQL confirms the WHO; ` +
          'documented business/technical justification per assignment must be verified against the system of record. ' +
          'Cross-check Profile-direct grants out-of-band.',
      ],
    };
  },
});
