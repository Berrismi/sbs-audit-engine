// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-FILE-001: Require Expiry Dates on Public Content Links.
//
// CLI evidence path: scan-core query
// `file-001-content-distributions-without-expiry` returns ContentDistribution
// rows where `PreferencesExpires = false` — Public Content links with no
// expiry. Pass = 0 rows (every link has expiry, or the org has no Public
// Content links at all). Fail = N rows. Empty inventory and all-have-expiry
// are indistinguishable by row count alone, but both outcomes are
// compliant with the control's intent ("links carry expiry appropriate to
// sensitivity").
//
// Classification: cli_primary. The audit_procedure step 2 directly maps
// to this query's WHERE clause — SOQL is ground truth here. Questionnaire
// remains the fallback when the org lacks Salesforce Files / Content
// (edition gate skips the query) or when the consultant runs the CLI
// without scan-core.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-FILE-001',
  passFinding:
    'Respondent attests Public Content links carry expiry dates appropriate to the sensitivity of the shared content, governed by an organizational lifetime policy.',
  failFinding:
    'Respondent attests Public Content links lack appropriate expiry dates. Permanent links extend exposure indefinitely if leaked, intercepted, or accidentally re-shared.',
  soqlQueryId: 'file-001-content-distributions-without-expiry',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No Public Content links lack expiry dates. Either every ContentDistribution has PreferencesExpires=true, or the org has no Public Content links — both are compliant with the lifetime-bounded sharing policy.',
        ],
      };
    }
    return {
      status: 'fail',
      findings: [
        `${rows.length} Public Content link(s) without expiry dates detected. ` +
          'These remain accessible indefinitely if the URL is leaked, intercepted, or re-shared. ' +
          'Set ExpiryDate per content classification (or PreferencesExpires=true with a default) on each ContentDistribution row.',
      ],
    };
  },
});
