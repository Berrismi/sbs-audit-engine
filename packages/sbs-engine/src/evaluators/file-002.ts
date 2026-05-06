// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-FILE-002: Require Passwords on Public Content Links for Sensitive
// Content.
//
// CLI evidence path: scan-core query
// `file-002-content-distributions-without-passwords` returns
// ContentDistribution rows where `Password = null` — Public Content links a
// recipient can open with the URL alone, no auth layer in front. Pass = 0
// rows (every link is password-protected, or the org has no Public Content
// links at all). ≥1 rows = inconclusive: the platform tells us *which*
// links lack passwords, but the audit_procedure asks whether the linked
// content is *sensitive* — that classification is org-level process, not
// a platform field.
//
// Classification: cli_corroborating. Same shape as INT-002 / INT-003 —
// SOQL confirms the inventory + flags the exposed surface; questionnaire
// adjudicates the process layer (sensitivity). When SOQL is present the
// evaluator returns `inconclusive` with high confidence; questionnaire is
// the fallback when the edition gate skips the query (Salesforce Files /
// Content not enabled, e.g. on DE).

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-FILE-002',
  passFinding:
    'Respondent attests Public Content links to sensitive content are password-protected, with the password communicated to recipients through a separate secure channel.',
  failFinding:
    'Respondent attests sensitive Public Content links are not password-protected. Anyone obtaining the link — through interception, accidental sharing, or harvesting — can immediately access the data.',
  soqlQueryId: 'file-002-content-distributions-without-passwords',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No Public Content links lack password protection. Either every ContentDistribution has a Password set, or the org has no Public Content links — both are compliant with the password-on-sensitive-link policy.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} Public Content link(s) without password protection detected. ` +
          'SOQL confirms the inventory of unprotected links; whether each links to sensitive content remains a process attestation. ' +
          'Verify sensitivity classification per link out-of-band, or set a password on every link to sensitive content.',
      ],
    };
  },
});
