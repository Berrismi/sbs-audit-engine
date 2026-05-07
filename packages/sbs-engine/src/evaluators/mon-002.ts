// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-002: Retaining Event Logs.
//
// CLI evidence: shared scan-core query `event-log-file-capability` returns
// per-EventType earliest + latest LogDate. The evaluator computes the
// observed retention window per event type and reports whether the
// platform retention itself meets common thresholds (1 day / 30 days / 1
// year). The "are logs ALSO exported externally to meet a longer retention
// policy?" question stays in the questionnaire — that's a process +
// tooling check, not a SOQL-observable property.
//
// Classification: cli_corroborating. The observed retention spread is the
// platform-side floor; the questionnaire confirms whether external export
// extends it to meet the customer's documented retention policy.

import { cliAttestationEvaluator } from './_attestation';
import {
  parseEventLogCapability,
  spanDays,
  type EventLogTypeSummary,
} from './_event-log-file-capability';

const QUERY_ID = 'event-log-file-capability';

const FREE_BASELINE_DAYS = 1;
const ADD_ON_STANDARD_DAYS = 30;

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-MON-002',
  passFinding:
    "Respondent attests event logs are retained to meet the organization's required retention period — exported to external systems where Salesforce native retention falls short, with the Delete Event Monitoring Data permission tightly controlled.",
  failFinding:
    "Respondent attests event log retention is not aligned with the organization's required retention period. Forensic data may be unavailable for slow-burn incident reconstruction.",
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const summaries = parseEventLogCapability(rows);

    if (summaries.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          'No EventLogFile rows present. Cannot infer platform retention from a quiet dataset. Defer to questionnaire to verify retention configuration meets policy.',
        ],
      };
    }

    const maxSpan = maxRetentionDays(summaries);

    let tierSummary: string;
    if (maxSpan >= ADD_ON_STANDARD_DAYS) {
      tierSummary = `Maximum observed retention ${maxSpan} day(s) across ${summaries.length} EventType(s) — consistent with the Event Monitoring add-on (30+ day native retention).`;
    } else if (maxSpan > FREE_BASELINE_DAYS) {
      tierSummary = `Maximum observed retention ${maxSpan} day(s) across ${summaries.length} EventType(s) — between the 1-day free baseline and the 30-day add-on standard. May indicate intermediate retention or limited recent activity.`;
    } else {
      tierSummary = `Maximum observed retention ${maxSpan} day(s) across ${summaries.length} EventType(s) — consistent with the free baseline (1-day native retention). External export is REQUIRED to meet any retention policy beyond 24 hours.`;
    }

    return {
      status: 'inconclusive',
      findings: [
        `${tierSummary} Platform-side retention is the floor; the questionnaire confirms whether external export (SIEM / archive) extends retention to the documented policy and whether the Delete Event Monitoring Data permission is tightly controlled.`,
      ],
    };
  },
});

/** Maximum spanDays across all summaries. Returns 0 when input is empty. */
function maxRetentionDays(summaries: ReadonlyArray<EventLogTypeSummary>): number {
  let max = 0;
  for (const s of summaries) {
    const span = spanDays(s.earliest, s.latest);
    if (span > max) max = span;
  }
  return max;
}
