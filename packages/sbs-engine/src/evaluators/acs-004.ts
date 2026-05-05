// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004: Documented Justification for All Super Admin–Equivalent Users.
//
// CLI evidence path: scan-core query `acs-004-super-admin-equivalents`
// returns the active super-admin-equivalent user inventory (PermSet OR
// Profile-level grants). The evaluator surfaces the inventory size; the
// "is each justified?" verdict comes from questionnaire attestation.
// (Authoring rule: no __c custom-field assumptions in SOQL.)

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-004',
  passFinding:
    'Respondent attests that all super-admin-equivalent users have documented justification.',
  failFinding:
    'Respondent attests they do NOT have documented justification for super-admin-equivalent users.',
  soqlQueryId: 'acs-004-super-admin-equivalents',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users hold all of View All Data, Modify All Data, and Manage Users via permission set or profile.',
        ],
      };
    }
    const usernames = rows
      .map((row) => row['Username'])
      .filter((u): u is string => typeof u === 'string')
      .slice(0, 10);
    const moreCount = Math.max(0, rows.length - usernames.length);
    const sampleClause = usernames.length
      ? ` Sample: ${usernames.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`
      : '';
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active super-admin-equivalent user(s) inventoried.${sampleClause} ` +
          'Documented justification per user is adjudicated by the questionnaire (Q-ACS-004).',
      ],
    };
  },
});
