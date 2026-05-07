// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-001: Enable Event Monitoring Log Storage.
//
// CLI evidence: shared scan-core query `event-log-file-capability` returns
// one row per distinct EventType present on EventLogFile. The evaluator
// classifies the org's tier (no-activity / free-baseline / add-on-likely)
// from the EventType inventory.
//
// Classification: cli_corroborating. The "is storage enabled for all
// REQUIRED event types?" question depends on the customer's policy and is
// not knowable from SOQL alone — but the OBSERVED inventory is a strong
// corroborating signal. If only Login/Logout/ApiTotalUsage rows exist,
// the org is on the free baseline (and likely missing add-on event types
// the policy may require). If LightningInteraction/ReportExport/etc are
// present, log storage is clearly enabled.

import { cliAttestationEvaluator } from './_attestation';
import {
  classifyTier,
  formatTypeBreakdown,
  parseEventLogCapability,
} from './_event-log-file-capability';

const QUERY_ID = 'event-log-file-capability';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-MON-001',
  passFinding:
    "Respondent attests Event Monitoring log storage is enabled for all event types required by the organization's security monitoring and compliance policies.",
  failFinding:
    'Respondent attests Event Monitoring log storage is not enabled for required event types. Salesforce logs cannot be retroactively generated — telemetry is permanently lost.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const summaries = parseEventLogCapability(rows);
    const tier = classifyTier(summaries);

    if (tier === 'no-activity') {
      return {
        status: 'inconclusive',
        findings: [
          'No EventLogFile rows present. Either the org has no recent API/UI activity (unlikely on a production org), Event Log generation is disabled, or the edition does not include EventLogFile. Defer to questionnaire to confirm storage is enabled per policy.',
        ],
      };
    }

    const totalLogs = summaries.reduce((acc, s) => acc + s.count, 0);
    const breakdown = formatTypeBreakdown(summaries);

    if (tier === 'free-baseline') {
      return {
        status: 'inconclusive',
        findings: [
          `${summaries.length} EventType(s) observed totaling ${totalLogs} log file(s) — all from the free baseline (Login / Logout / ApiTotalUsage). No Event Monitoring add-on event types observed. Inventory: ${breakdown}. Defer to questionnaire to confirm whether the add-on is licensed and storage is enabled for all required types.`,
        ],
      };
    }

    return {
      status: 'inconclusive',
      findings: [
        `${summaries.length} EventType(s) observed totaling ${totalLogs} log file(s) — Event Monitoring add-on event types present (storage clearly enabled at the platform level). Inventory: ${breakdown}. Defer to questionnaire to confirm storage covers all event types required by the organization's policy.`,
      ],
    };
  },
});
