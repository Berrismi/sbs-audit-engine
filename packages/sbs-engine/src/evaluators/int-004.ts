// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-004: Retain API Total Usage Event Logs for 30 Days.
//
// CLI evidence: shared scan-core query `event-log-file-capability` returns
// per-EventType earliest + latest LogDate. The evaluator looks specifically
// at the `ApiTotalUsage` event type and computes its observed retention
// window.
//
// Classification: cli_corroborating. The audit_procedure allows two paths
// to compliance: (a) Salesforce-native retention ≥30 days (Event Monitoring
// add-on with extended retention), or (b) external export covering 30+
// days when native retention is insufficient. SOQL can prove (a) directly;
// (b) is questionnaire territory.
//
// Outcomes:
//   - ApiTotalUsage retention ≥30 days observed → pass+high (native
//     retention is sufficient; questionnaire confirmation not required for
//     the scoring decision)
//   - ApiTotalUsage present with <30 days observed → inconclusive
//     (questionnaire confirms whether external export covers the gap; the
//     1-day free-tier retention is COMPLIANT iff export exists)
//   - ApiTotalUsage absent (no rows for that type) → inconclusive (defer
//     to questionnaire whether retention is delivered via external export
//     or whether the org's edition + Event Monitoring config is missing
//     ApiTotalUsage entirely)

import { cliAttestationEvaluator } from './_attestation';
import { parseEventLogCapability, spanDays } from './_event-log-file-capability';

const QUERY_ID = 'event-log-file-capability';
const REQUIRED_DAYS = 30;
const TARGET_EVENT_TYPE = 'ApiTotalUsage';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-INT-004',
  passFinding:
    'Respondent attests at least 30 days of `ApiTotalUsage` event logs are retained (in Salesforce or exported elsewhere).',
  failFinding:
    'Respondent attests they retain less than 30 days of `ApiTotalUsage` event logs. Without sufficient retention, anomalous API behavior is invisible after the fact.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const summaries = parseEventLogCapability(rows);
    const apiTotalUsage = summaries.find((s) => s.eventType === TARGET_EVENT_TYPE);

    if (!apiTotalUsage) {
      return {
        status: 'inconclusive',
        findings: [
          `No \`${TARGET_EVENT_TYPE}\` EventLogFile rows observed. Either the org has no recent API activity, the event type is not enabled, or this edition does not include it. Defer to questionnaire to confirm whether ${REQUIRED_DAYS}-day retention is delivered via external export covering this event type.`,
        ],
      };
    }

    const observedDays = spanDays(apiTotalUsage.earliest, apiTotalUsage.latest);

    if (observedDays >= REQUIRED_DAYS) {
      return {
        status: 'pass',
        findings: [
          `\`${TARGET_EVENT_TYPE}\` is retained natively for at least ${observedDays} day(s) (observed earliest ${apiTotalUsage.earliest} → latest ${apiTotalUsage.latest}, ${apiTotalUsage.count} log file(s)). Meets the ${REQUIRED_DAYS}-day audit threshold from Salesforce-native retention alone.`,
        ],
      };
    }

    return {
      status: 'inconclusive',
      findings: [
        `\`${TARGET_EVENT_TYPE}\` retention observed: ${observedDays} day(s) of ${apiTotalUsage.count} log file(s) (${apiTotalUsage.earliest} → ${apiTotalUsage.latest}) — below the ${REQUIRED_DAYS}-day audit threshold from Salesforce-native retention alone. The 1-day free-tier baseline is COMPLIANT iff an external export covers the gap. Defer to questionnaire to confirm export is configured + delivering ${REQUIRED_DAYS}+ days of retention.`,
      ],
    };
  },
});
