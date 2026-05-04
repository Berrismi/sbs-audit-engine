// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-SECCONF-002: Review and Remediate Salesforce Health Check Deviations.
//
// CLI evidence path: scan-core's Health Check API integration (Block C)
// returns the current high-risk settings list. The size of that list is
// circumstantial evidence of remediation cadence — a small list suggests
// active review, a large list suggests review is not happening — but the
// list size doesn't prove a repeatable PROCESS exists. The audit
// procedure is fundamentally about process: interview the owner, examine
// review artifacts, verify exceptions are documented.
//
// Classification: cli_corroborating. HC observations are surfaced for
// the consultant's report, but the questionnaire decides the verdict.

import { corroboratingHealthCheckEvaluator } from './_attestation';

export const evaluate = corroboratingHealthCheckEvaluator({
  questionId: 'Q-SECCONF-002',
  passFinding:
    'Respondent attests they regularly review Health Check results and either remediate deviations or document them as approved exceptions.',
  failFinding: 'Respondent attests Health Check results are NOT regularly reviewed and acted on.',
  observe: (hc) => {
    const count = hc.high_risk.length;
    if (count === 0) {
      return [
        `Health Check API: 0 high-risk settings currently flagged (score ${hc.risk_score}). ` +
          "Suggestive of active remediation, but doesn't prove a repeatable review process exists.",
      ];
    }
    return [
      `Health Check API: ${count} high-risk setting(s) currently flagged (score ${hc.risk_score}). ` +
        'The size of the list is circumstantial evidence about remediation cadence; the questionnaire arbitrates whether a repeatable review process is in place.',
    ];
  },
});
