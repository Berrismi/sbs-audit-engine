// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-003: Inventory and Justification of Named Credentials.
//
// CLI evidence path: scan-core query `int-003-named-credentials-inventory`
// returns the NamedCredential list. Same pattern as INT-002 — SOQL confirms
// the inventory; documented justification per entry remains a process attest.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-INT-003',
  passFinding:
    'Respondent attests they maintain an up-to-date inventory of every Named Credential with documented justification for each.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory + justification list for Named Credentials. Forgotten Named Credentials with valid stored secrets are a hidden third-party access surface.',
  soqlQueryId: 'int-003-named-credentials-inventory',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: ['No Named Credentials found. Trivially compliant — the inventory is empty.'],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} Named Credential(s) inventoried. SOQL confirms the inventory; ` +
          'documented justification per entry must still be verified out-of-band (per-entry custom-field documentation or external register).',
      ],
    };
  },
});
