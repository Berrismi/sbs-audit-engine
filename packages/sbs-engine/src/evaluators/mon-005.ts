// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-005: Monitor API Usage Against Limits.
//
// CLI evidence path: scan-core's Limits REST API client calls
// `GET /services/data/v{N}/limits` and surfaces the org's daily / hourly
// limit utilization snapshot. The audit_procedure step 1 ("Review the
// organization's daily API limit and current 24-hour usage in the Salesforce
// System Overview in Setup") is a direct map to this endpoint's
// `DailyApiRequests` entry. Steps 2-5 (alerting setup, IR plan, breach
// history) are process-level and stay questionnaire territory.
//
// Classification: cli_corroborating. Same shape as INT-002 / INT-003 +
// SECCONF-001 / SECCONF-002 — CLI surfaces the quantitative snapshot;
// questionnaire adjudicates the process layer (whether monitoring is
// actively configured, whether a documented IR plan exists, whether
// breach-response history is on file). When Limits evidence is present
// alongside a questionnaire answer, confidence bumps to 'high' and the
// finding includes the utilization observation.

import type { Evidence } from '../types';
import { corroboratingLimitsApiEvaluator } from './_attestation';

function utilizationLine(e: Extract<Evidence, { source: 'limits_rest_api' }>): readonly string[] {
  const daily = e.limits['DailyApiRequests'];
  if (!daily) {
    return [
      'Limits REST API responded but no DailyApiRequests entry was returned. Salesforce typically includes this on every edition; investigate the connection or the API version.',
    ];
  }
  const used = daily.max - daily.remaining;
  const pct = daily.max > 0 ? (used / daily.max) * 100 : 0;
  const pctFormatted = pct.toFixed(1);
  return [
    `Daily API requests at scan time: ${used.toLocaleString()} / ${daily.max.toLocaleString()} consumed (${pctFormatted}% utilization). The control's recommended proactive alerting threshold is 80-90%.`,
  ];
}

export const evaluate = corroboratingLimitsApiEvaluator({
  questionId: 'Q-MON-005',
  passFinding:
    'Respondent attests current API consumption is continuously monitored against the daily Salesforce limit, with proactive alerts at a defined utilization threshold (e.g., 80-90%) and a documented incident-response plan.',
  failFinding:
    'Respondent attests no continuous API limit monitoring with proactive alerting exists. A runaway integration or compromised account can exhaust the daily quota and break core business processes before being detected.',
  observe: utilizationLine,
});
