// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-SECCONF-001: Establish a Salesforce Health Check Baseline.
//
// CLI evidence path: scan-core's Salesforce Health Check API integration
// (Block C) returns the org's risk score + high-risk settings list. The
// presence of HC data confirms a baseline IS active, but the API cannot
// distinguish a deliberately-customized baseline from the Salesforce
// default — that distinction is the questionnaire's job.
//
// Classification: cli_corroborating. HC observations raise confidence
// when paired with questionnaire attestation; questionnaire alone is
// the verdict-bearing source.

import { corroboratingHealthCheckEvaluator } from './_attestation';

export const evaluate = corroboratingHealthCheckEvaluator({
  questionId: 'Q-SECCONF-001',
  passFinding:
    'Respondent attests they have a written Salesforce Health Check baseline (Salesforce default or customized).',
  failFinding:
    'Respondent attests they do NOT have a written Health Check baseline. Without one, configuration drift is invisible.',
  observe: (hc) => {
    const count = hc.high_risk.length;
    return [
      `Health Check API: org risk score ${hc.risk_score}, ${count} high-risk setting(s) flagged. ` +
        'A baseline IS active; whether it was deliberately customized vs left at the Salesforce default ' +
        'cannot be determined from the API alone.',
    ];
  },
});
