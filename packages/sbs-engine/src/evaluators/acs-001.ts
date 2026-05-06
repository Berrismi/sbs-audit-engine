// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-001: Enforce a Documented Permission Set Model.
//
// CLI evidence path: scan-core query
// `acs-001-custom-permission-sets-inventory` returns the inventory of
// non-managed-package permission sets (`IsCustom = true`). The platform
// enumerates the population; the audit_procedure asks the consultant to
// compare each entry to the documented model — that comparison is process,
// not platform.
//
// Classification: cli_corroborating. Same shape as INT-002 / INT-003 — SOQL
// confirms the inventory; questionnaire adjudicates whether each entry maps
// to the documented model. 0 rows = trivially compliant (no custom perm
// sets to document); ≥1 rows = inconclusive, deferring documentation
// verification to the questionnaire.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-001',
  passFinding:
    'Respondent attests they maintain a documented permission set model in a system of record.',
  failFinding:
    'Respondent attests they do NOT maintain a documented permission set model. Auditors expect a written, enforced model in a system of record.',
  soqlQueryId: 'acs-001-custom-permission-sets-inventory',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No custom permission sets found. Trivially compliant — the inventory to document is empty.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} custom permission set(s) inventoried. SOQL confirms the population; ` +
          'whether each maps to the documented model + naming conventions remains a process attestation. ' +
          'Provide the model document for cross-walk, or confirm via questionnaire.',
      ],
    };
  },
});
