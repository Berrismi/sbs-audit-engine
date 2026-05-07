// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-006: Documented Justification for `Use Any API Client` Permission.
//
// CLI evidence path: scan-core query `acs-006-use-any-api-client-via-permsets`
// returns active users granted Use Any API Client via permset assignment.
// This permission bypasses Connected App allow-listing — high-impact misuse
// surface. Audit_procedure asks for documented justification + persona
// restriction per holder.
//
// Classification: cli_corroborating. Same shape as ACS-002 / ACS-003.
//
// Field-gating semantics: `PermissionsUseAnyApiClient` is feature-gated, not
// edition-gated — it only materializes on PermissionSet when "API Access
// Control" is enabled by Salesforce Support (a per-org case, not a Setup
// toggle). When the gate skips, the org doesn't have API Access Control on,
// which means the permission cannot exist anywhere on the schema → there is
// nothing to inventory. Today this still degrades to questionnaire
// fallback; the richer "feature-not-enabled → N/A" UX is a future SkipRule
// enhancement.
//
// Row shape includes `PermissionSet.IsOwnedByProfile` so the inventory
// distinguishes profile-derived assignments (every profile has a backing
// permission set with IsOwnedByProfile = true) from explicit Permission
// Set / Permission Set Group assignments. Audit_procedure asks for both.

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-ACS-006',
  passFinding:
    'Respondent attests the `Use Any API Client` permission is restricted to a few highly-trusted users with documented justification.',
  failFinding:
    'Respondent attests the `Use Any API Client` permission is NOT restricted to a few highly-trusted users with documented justification. This permission bypasses Connected App allow-listing.',
  soqlQueryId: 'acs-006-use-any-api-client-via-permsets',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No active users granted Use Any API Client via permission set. Trivially compliant — the permission is unassigned at the permset layer.',
        ],
      };
    }
    const { profileDerived, permsetDerived } = countByOwnership(rows);
    const breakdown =
      profileDerived === 0
        ? `${permsetDerived} via Permission Set / Permission Set Group`
        : permsetDerived === 0
          ? `${profileDerived} via Profile (backing permission set)`
          : `${profileDerived} via Profile (backing permission set), ${permsetDerived} via Permission Set / Permission Set Group`;
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} active user-permset assignment(s) grant Use Any API Client (${breakdown}). ` +
          'SOQL confirms the WHO; documented justification + persona restriction per assignment must be ' +
          'verified against the system of record. This permission bypasses Connected App allow-listing, ' +
          'so misuse is high-impact.',
      ],
    };
  },
});

// Tally rows by their PermissionSet.IsOwnedByProfile flag. A profile-derived
// row is one whose PermissionSet is the implicit set backing a Profile (every
// Profile in Salesforce has one); a permset-derived row is an explicit
// Permission Set or Permission Set Group assignment. Returns zeros for rows
// whose ownership flag is missing rather than throwing — matches the
// "degrade gracefully" posture across the evaluator family.
function countByOwnership(rows: Record<string, unknown>[]): {
  profileDerived: number;
  permsetDerived: number;
} {
  let profileDerived = 0;
  let permsetDerived = 0;
  for (const row of rows) {
    const ps = row['PermissionSet'];
    const ownedByProfile =
      ps && typeof ps === 'object' && 'IsOwnedByProfile' in ps
        ? (ps as Record<string, unknown>)['IsOwnedByProfile']
        : undefined;
    if (ownedByProfile === true) profileDerived++;
    else if (ownedByProfile === false) permsetDerived++;
  }
  return { profileDerived, permsetDerived };
}
