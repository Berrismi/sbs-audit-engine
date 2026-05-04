// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-012: Classify Users for Login Hours Restrictions.
//
// CLI evidence path: scan-core query `acs-012-profiles-with-login-hours`
// returns Profiles with at least one Login Hours window configured. The
// presence of any login-hours configuration suggests the org has
// implemented classification-driven restrictions; absence suggests the
// policy is not in use anywhere in the org.
//
// Classification: cli_primary. SOQL "any vs none" is a defensible verdict
// for the underlying policy; questionnaire (when SOQL absent) covers the
// classification-correctness nuance.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-012',
  passFinding:
    'Respondent attests they have identified user types that should be restricted to specific login hours (or have equivalent off-hours monitoring).',
  failFinding:
    'Respondent attests they have NOT identified user types for login-hour restrictions or equivalent off-hours monitoring.',
  soqlQueryId: 'acs-012-profiles-with-login-hours',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'fail',
        findings: [
          'No profiles in the org have Login Hours restrictions configured. ' +
            'The classification-driven login-hours policy is not in use anywhere.',
        ],
      };
    }
    return {
      status: 'pass',
      findings: [
        `${rows.length} profile(s) have Login Hours restrictions configured. ` +
          'Classification-driven restrictions are in use; the questionnaire is the place to validate which user types should also be restricted.',
      ],
    };
  },
});
