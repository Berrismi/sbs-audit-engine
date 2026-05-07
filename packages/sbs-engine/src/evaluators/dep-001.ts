// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-001: Require a Designated Deployment Identity for Metadata Changes.
//
// CLI evidence: shared scan-core query `dep-setup-audit-trail-recent`
// returns up to 2000 SetupAuditTrail rows from the last 180 days. The
// evaluator filters to high-risk Sections (the audit-trail surface for
// metadata deployments) via `_high-risk-sections.ts`, then counts the
// distinct CreatedById values.
//
// Classification: cli_corroborating. The single-deployment-identity
// invariant is observable: 1 distinct user touching high-risk metadata
// in the window is consistent with a designated deployment identity;
// >1 means humans are deploying alongside automation. The questionnaire
// confirms that the single user IS the designated deploy id (vs e.g.
// a single human admin who happens to be the only one making changes
// in a quiet window).
//
// Outcomes:
//   - 0 high-risk rows in window     → inconclusive (defer to questionnaire;
//                                      no recent deployment activity to score)
//   - exactly 1 distinct CreatedById → pass (single identity for the window;
//                                      questionnaire confirms which one)
//   - 2+ distinct CreatedById        → inconclusive (multiple identities;
//                                      defer to questionnaire whether one is
//                                      the designated deploy id and others
//                                      are documented exceptions)

import { cliAttestationEvaluator } from './_attestation';
import { filterHighRiskRows } from './_high-risk-sections';

const QUERY_ID = 'dep-setup-audit-trail-recent';
const ROW_CAP = 2000;

interface UserSummary {
  id: string;
  username: string | undefined;
  rowCount: number;
}

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-DEP-001',
  passFinding:
    'Respondent attests all automated metadata deployments go through a single dedicated identity, not individual admin accounts.',
  failFinding:
    'Respondent attests deployments are spread across individual admin accounts. A designated deployment identity is needed for clean change attribution.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const highRisk = filterHighRiskRows(rows);
    const capCaveat =
      rows.length >= ROW_CAP
        ? ` (note: SetupAuditTrail result was capped at ${ROW_CAP} rows; the actual window may include additional changes not surfaced here.)`
        : '';

    if (highRisk.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          `No high-risk metadata changes in the last 180 days of SetupAuditTrail (filtered to ${highRiskScopeLabel()}).${capCaveat} Cannot infer a deployment-identity pattern from a quiet window — defer to the questionnaire.`,
        ],
      };
    }

    const users = summarizeUsers(highRisk);
    if (users.length === 1) {
      const u = users[0]!;
      return {
        status: 'pass',
        findings: [
          `All ${highRisk.length} high-risk metadata change(s) in the last 180 days were performed by a single user: ${u.username ?? u.id}.${capCaveat} Consistent with a designated deployment identity; the questionnaire confirms it IS the designated deploy id (vs. a single human admin who happens to be the only one making changes).`,
        ],
      };
    }

    const sample = users
      .slice(0, 5)
      .map((u) => `${u.username ?? u.id} (${u.rowCount})`)
      .join(', ');
    const moreCount = Math.max(0, users.length - 5);
    const moreClause = moreCount > 0 ? ` (+${moreCount} more)` : '';
    return {
      status: 'inconclusive',
      findings: [
        `${users.length} distinct user(s) performed ${highRisk.length} high-risk metadata change(s) in the last 180 days. Top contributors: ${sample}${moreClause}.${capCaveat} Multiple deployment identities — defer to the questionnaire whether one is the designated deploy id and the others are documented exceptions.`,
      ],
    };
  },
});

/**
 * Bucket the high-risk rows by CreatedById; one entry per distinct user
 * with a rowCount tally and the first-seen username. Sort by rowCount desc
 * (then by username/id asc for stable order). Defensive against rows with
 * missing CreatedById.
 */
function summarizeUsers(rows: ReadonlyArray<Record<string, unknown>>): UserSummary[] {
  const byId = new Map<string, UserSummary>();
  for (const row of rows) {
    const id = typeof row['CreatedById'] === 'string' ? row['CreatedById'] : null;
    if (!id) continue;
    const createdBy = row['CreatedBy'];
    const username =
      createdBy &&
      typeof createdBy === 'object' &&
      !Array.isArray(createdBy) &&
      typeof (createdBy as Record<string, unknown>)['Username'] === 'string'
        ? ((createdBy as Record<string, unknown>)['Username'] as string)
        : undefined;
    const existing = byId.get(id);
    if (existing) {
      existing.rowCount++;
      if (!existing.username && username) existing.username = username;
    } else {
      byId.set(id, { id, username, rowCount: 1 });
    }
  }
  const out = [...byId.values()];
  out.sort((a, b) => {
    if (b.rowCount !== a.rowCount) return b.rowCount - a.rowCount;
    return (a.username ?? a.id).localeCompare(b.username ?? b.id);
  });
  return out;
}

// Tight description of the high-risk scope used in findings, kept in sync
// with `_high-risk-sections.ts`.
function highRiskScopeLabel(): string {
  return 'Apex code, permissions, profiles, auth, user mgmt, outbound connectivity, sharing defaults';
}
