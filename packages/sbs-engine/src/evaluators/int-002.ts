// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-002: Inventory and Justification of Remote Site Settings.
//
// CLI evidence path: scan-core query `int-002-remote-site-settings-inventory`
// returns the active RemoteSiteSetting list. The evaluator surfaces the
// inventory size in findings — "all justified?" is process-only, so SOQL
// presence alone moves the control from "no inventory" to "inventory
// confirmed" but the questionnaire still adjudicates whether each entry
// has documented justification.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-INT-002',
  passFinding:
    'Respondent attests they maintain an up-to-date inventory of every Remote Site Setting with documented justification for each.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory + justification list for Remote Site Settings. Stale Remote Site Settings are a canonical SSRF / data-egress vector.',
  soqlQueryId: 'int-002-remote-site-settings-inventory',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active Remote Site Settings found. Trivially compliant — the inventory is empty.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active Remote Site Setting(s) inventoried. SOQL confirms the inventory; ` +
          'documented justification per entry must still be verified out-of-band (per-entry custom-field documentation or external register).',
      ],
    };
  },
});
