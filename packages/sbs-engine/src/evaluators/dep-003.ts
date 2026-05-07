// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-003: Monitor and Alert on Unauthorized Modifications to High-Risk
// Metadata.
//
// CLI evidence: shared scan-core query `dep-setup-audit-trail-recent`
// returns up to 2000 SetupAuditTrail rows from the last 180 days. The
// evaluator filters to high-risk Sections via `_high-risk-sections.ts` and
// reports the inventory size + distinct-user count.
//
// Classification: cli_corroborating. SOQL surfaces what high-risk changes
// happened in the window (the WHAT-needs-monitoring); the questionnaire
// adjudicates whether monitoring + alerting is actually in place
// (Q-DEP-003) — that capability is process + tooling, not queryable via
// the metadata API.
//
// Outcomes:
//   - 0 high-risk rows in window → pass (nothing to monitor in window;
//                                  trivially compliant on this dimension)
//   - N high-risk rows           → inconclusive (questionnaire confirms
//                                  whether monitoring + alerting is in
//                                  place; SOQL surfaces the inventory
//                                  size so customers can see why this
//                                  control matters)

import { cliAttestationEvaluator } from './_attestation';
import { filterHighRiskRows } from './_high-risk-sections';

const QUERY_ID = 'dep-setup-audit-trail-recent';
const ROW_CAP = 2000;

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-DEP-003',
  passFinding:
    'Respondent attests they receive alerts whenever high-risk metadata is changed in production by a user other than the designated deployment identity.',
  failFinding:
    'Respondent attests they do NOT receive alerts on unauthorized high-risk metadata changes in production. Without alerts, unauthorized changes go undetected.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const highRisk = filterHighRiskRows(rows);
    const capCaveat =
      rows.length >= ROW_CAP
        ? ` (note: SetupAuditTrail result was capped at ${ROW_CAP} rows; the actual window may include additional changes not surfaced here.)`
        : '';

    if (highRisk.length === 0) {
      return {
        status: 'pass',
        findings: [
          `No high-risk metadata changes in the last 180 days of SetupAuditTrail. Trivially compliant on the inventory dimension — there is nothing in the recent window that monitoring would need to detect. Confirm via questionnaire that monitoring is configured for future activity.${capCaveat}`,
        ],
      };
    }

    const userCount = countDistinctUsers(highRisk);
    const sectionBreakdown = summarizeSections(highRisk);
    return {
      status: 'inconclusive',
      findings: [
        `${highRisk.length} high-risk metadata change(s) by ${userCount} distinct user(s) in the last 180 days. Top sections: ${sectionBreakdown}.${capCaveat} SOQL surfaces the volume of in-scope changes; whether monitoring + alerting actually catches them is questionnaire territory (Q-DEP-003).`,
      ],
    };
  },
});

/**
 * Count distinct CreatedById values. Defensive against rows with missing
 * CreatedById (those are skipped).
 */
function countDistinctUsers(rows: ReadonlyArray<Record<string, unknown>>): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = typeof row['CreatedById'] === 'string' ? row['CreatedById'] : null;
    if (id) seen.add(id);
  }
  return seen.size;
}

/**
 * Bucket rows by Section, return a "Section A (n), Section B (m)" string
 * showing the top 5 sections by row count. Section names are the literal
 * Salesforce strings (case-sensitive). Defensive: tolerates rows with
 * missing/non-string Section by tallying them under "(unknown section)".
 */
function summarizeSections(rows: ReadonlyArray<Record<string, unknown>>): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const section = typeof row['Section'] === 'string' ? row['Section'] : '(unknown section)';
    counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const top = sorted.slice(0, 5).map(([s, n]) => `${s} (${n})`);
  const moreCount = Math.max(0, sorted.length - 5);
  return top.join(', ') + (moreCount > 0 ? ` (+${moreCount} more section(s))` : '');
}
