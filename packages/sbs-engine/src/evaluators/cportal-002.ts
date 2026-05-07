// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-002: Restrict Guest User Record Access.
//
// CLI evidence: scan-core query `cportal-002-guest-profile-object-permissions`
// returns every ObjectPermissions row whose Parent profile is a Guest
// profile (UserType = 'Guest') and grants at least one permission
// (Read/Create/Edit/Delete/ViewAll/ModifyAll) on a business object.
//
// The audit_procedure desired state: guest user profiles must have all
// business-object permissions disabled, with permissions exclusively for
// authentication flows (login, registration, password reset). The
// "business-related" distinction is customer-policy territory (auth-flow
// objects vary by implementation: some orgs use Account/Contact for
// self-service registration, which is a permitted exception).
//
// Classification: cli_corroborating. CLI surfaces the inventory of
// guest-profile object permissions; questionnaire confirms which are
// necessary for auth flows vs. over-broad. The pass condition is bright
// and platform-observable (zero permissions = trivially compliant).
//
// Outcomes:
//   - 0 rows → pass+high (no guest profile grants any object permission;
//     trivially compliant on the inventory dimension. Note: a guest
//     profile that doesn't exist at all also yields 0 rows. This is
//     correct — the control's pass condition is "guest users restricted
//     to auth flows only", and "no guest users at all" trivially satisfies)
//   - N rows → inconclusive+high (guest profile object permissions exist;
//     defer to questionnaire which are intentional auth-flow exceptions
//     and which are over-broad)

import { cliAttestationEvaluator } from './_attestation';

const QUERY_ID = 'cportal-002-guest-profile-object-permissions';

interface GuestObjectPerm {
  profileName: string;
  sobjectType: string;
  /** Concise summary of which CRUD/View/Modify perms are granted. */
  perms: string[];
}

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-CPORTAL-002',
  passFinding:
    'Respondent attests guest users are limited to login and signup pages only — no access to business data queries or Apex methods that touch data.',
  failFinding:
    'Respondent attests guest users are NOT properly restricted to login/signup-only access. Guest user breaches are the most public class of Salesforce data leaks.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No object permissions granted to any Guest profile. Trivially compliant on the inventory dimension — guest users have no business-object access at the platform layer. Note: this also yields true when no guest profiles exist (no Experience Cloud sites configured); confirm via questionnaire whether the org runs any communities.',
        ],
      };
    }

    const grants = collectGrants(rows);
    const sample = formatGrantSample(grants);
    const profileCount = new Set(grants.map((g) => g.profileName)).size;
    const objectCount = new Set(grants.map((g) => g.sobjectType)).size;
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} object permission grant(s) on Guest profiles across ${profileCount} guest profile(s) and ${objectCount} object type(s). ${sample} The audit_procedure permits limited exceptions for authentication-flow objects (login, registration, password reset). Defer to questionnaire (Q-CPORTAL-002) to confirm which grants are intentional auth-flow exceptions vs. over-broad.`,
      ],
    };
  },
});

/**
 * Walk ObjectPermissions rows and extract a normalized per-grant view
 * with the granted permissions summarized as a string list. Defensive
 * against missing Parent / Profile / SobjectType fields.
 */
function collectGrants(rows: ReadonlyArray<Record<string, unknown>>): GuestObjectPerm[] {
  const out: GuestObjectPerm[] = [];
  for (const row of rows) {
    const parent = isRecord(row['Parent']) ? row['Parent'] : undefined;
    const profile = parent && isRecord(parent['Profile']) ? parent['Profile'] : undefined;
    const profileName =
      profile && typeof profile['Name'] === 'string' ? profile['Name'] : '(unknown profile)';
    const sobjectType =
      typeof row['SobjectType'] === 'string' ? row['SobjectType'] : '(unknown object)';
    const perms: string[] = [];
    if (row['PermissionsRead'] === true) perms.push('R');
    if (row['PermissionsCreate'] === true) perms.push('C');
    if (row['PermissionsEdit'] === true) perms.push('E');
    if (row['PermissionsDelete'] === true) perms.push('D');
    if (row['PermissionsViewAllRecords'] === true) perms.push('ViewAll');
    if (row['PermissionsModifyAllRecords'] === true) perms.push('ModifyAll');
    out.push({ profileName, sobjectType, perms });
  }
  out.sort((a, b) => {
    const pn = a.profileName.localeCompare(b.profileName);
    if (pn !== 0) return pn;
    return a.sobjectType.localeCompare(b.sobjectType);
  });
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Format the first 5 grants as "Profile / SobjectType (R,C,E)" lines.
 * Caps at 5 with "+N more grant(s)".
 */
function formatGrantSample(grants: ReadonlyArray<GuestObjectPerm>): string {
  const named = grants
    .slice(0, 5)
    .map((g) => `${g.profileName} / ${g.sobjectType} (${g.perms.join(',')})`);
  const moreCount = Math.max(0, grants.length - named.length);
  return `Sample: ${named.join('; ')}${moreCount > 0 ? ` (+${moreCount} more grant(s))` : ''}.`;
}
