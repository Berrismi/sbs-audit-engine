// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-001: Require Formal Installation of Connected Apps.
//
// CLI evidence path: scan-core query `oauth-001-ad-hoc-connected-apps`
// returns Connected Apps without a managed-package namespace — these are
// org-local (ad-hoc), not formally installed via a managed/unmanaged
// package. Pass = 0 rows; fail = N rows.
//
// Classification: cli_primary. NamespacePrefix is null for org-local
// apps and non-null for apps that came from a packaged install — the
// SOQL directly verifies the policy.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-OAUTH-001',
  passFinding:
    'Respondent attests every Connected App is formally installed by an admin, never authorized ad-hoc by individual users.',
  failFinding:
    'Respondent attests at least some Connected Apps are authorized ad-hoc by individual users rather than formally installed. Ad-hoc OAuth grants bypass admin oversight.',
  soqlQueryId: 'oauth-001-ad-hoc-connected-apps',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No ad-hoc Connected Apps detected. Every Connected App in the org came from a managed or unmanaged package install.',
        ],
      };
    }
    return {
      status: 'fail',
      findings: [
        `${rows.length} ad-hoc Connected App(s) detected (no NamespacePrefix). ` +
          'These were created in-org rather than installed via a package — review whether each represents an approved integration.',
      ],
    };
  },
});
