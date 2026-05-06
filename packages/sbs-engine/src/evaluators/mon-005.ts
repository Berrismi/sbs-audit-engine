// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-005: Monitor API Usage Against Limits.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-MON-005',
  passFinding:
    'Respondent attests current API consumption is continuously monitored against the daily Salesforce limit, with proactive alerts at a defined utilization threshold (e.g., 80-90%) and a documented incident-response plan.',
  failFinding:
    'Respondent attests no continuous API limit monitoring with proactive alerting exists. A runaway integration or compromised account can exhaust the daily quota and break core business processes before being detected.',
});
