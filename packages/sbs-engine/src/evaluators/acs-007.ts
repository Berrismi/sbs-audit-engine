// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-007: Maintain Inventory of Non-Human Identities.
//
// CLI evidence path: scan-core query `acs-007-nhi-inventory` returns active
// users whose Profile carries `PermissionsApiUserOnly = true` and whose
// UserType is internal-shaped (Standard or CsnOnly). API-Only-profile is
// the high-precision platform signal for NHI; the noisier name-substring
// heuristics in the audit_procedure ("integration", "api", "bot", ...) are
// intentionally NOT used because they false-fire on human users with those
// substrings AND miss integration users named with custom conventions.
//
// Classification: cli_corroborating. SOQL surfaces the WHO; the
// questionnaire confirms the inventory is COMPLETE (e.g., bots,
// automation users, OAuth-only integrations the customer manages
// out-of-band that wouldn't show up via Profile-API-Only filtering).
//
// Pass shape: 0 NHI rows = pass+high (the org has no API-Only-profile
// users — trivially compliant on this dimension). N rows = inconclusive
// (deferring "is the documented inventory complete and current?" to the
// questionnaire).

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-007',
  passFinding:
    'Respondent attests they maintain a current inventory of non-human accounts (integration users, automation users, bots, API-only accounts).',
  failFinding:
    'Respondent attests they do NOT maintain a current inventory of non-human accounts. Without an inventory, no other NHI control can be enforced.',
  soqlQueryId: 'acs-007-nhi-inventory',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users on API-Only profiles with internal UserType. Trivially compliant — no platform-flagged non-human identities to inventory. Confirm via questionnaire that no NHIs exist out-of-band (bots, automation users, OAuth-only integrations).',
        ],
      };
    }
    const sample = sampleUsernames(rows);
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active non-human identity candidate(s) inventoried via API-Only profile + internal UserType.${sample}` +
          ' SOQL confirms the WHO; the documented inventory must be verified for completeness against bots, automation users, and OAuth-only integrations that this query does not enumerate.',
      ],
    };
  },
});

// Cap the username sample at 10 to keep the finding line PDF-friendly while
// still giving a consultant a real sense of who's on the list. Anything
// past 10 is summarized as "+N more". Returns "" (not "no sample") when no
// row carries a Username — never let the sample clause become noise.
function sampleUsernames(rows: ReadonlyArray<Record<string, unknown>>): string {
  const usernames = rows
    .map((r) => r['Username'])
    .filter((u): u is string => typeof u === 'string')
    .slice(0, 10);
  if (usernames.length === 0) return '';
  const moreCount = Math.max(0, rows.length - usernames.length);
  return ` Sample: ${usernames.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`;
}
