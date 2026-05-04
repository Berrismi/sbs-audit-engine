// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-005: Only Use Custom Profiles for Active Users.
//
// CLI evidence path: scan-core query `acs-005-active-users-on-standard-profiles`
// returns active users assigned to well-known standard (non-custom) profiles.
// Pass = 0 rows; fail = N rows. The query intentionally excludes
// 'System Administrator' since keeping the standard sysadmin profile for
// break-glass + config is widely accepted practice; the questionnaire
// (when SOQL is absent) covers the broader policy nuance.
//
// Classification: cli_primary. The SOQL evidence directly verifies the
// policy.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-005',
  passFinding:
    'Respondent attests all active users are on custom profiles (not the out-of-the-box `Standard User` profile).',
  failFinding:
    'Respondent attests they have active users on the standard `Standard User` profile, which cannot be tightened safely without breaking other users on the same profile.',
  soqlQueryId: 'acs-005-active-users-on-standard-profiles',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users are assigned to standard (non-custom) profiles. Custom-profile policy verified.',
        ],
      };
    }
    return {
      status: 'fail',
      findings: [
        `${rows.length} active user(s) assigned to standard profiles. Custom-profile policy violated; ` +
          'create custom profile copies and reassign these users.',
      ],
    };
  },
});
