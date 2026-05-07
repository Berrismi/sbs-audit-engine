// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-004: Enforce Strong MFA for External Users with Substantial
// Access to Sensitive Data.
//
// Note: upstream YAML omits risk_level for this control at v0.4.1; the
// HelloMavens override pins it to Critical. See data/control-overrides.json.
//
// CLI evidence: scan-core supplies two SOQL queries that together identify
// active external users (UserType IN portal/community-shaped values) and
// determine effective MFA enforcement.
//
//   - auth-004-external-users-mfa — one row per active external user
//     with Profile-level `PermissionsForceTwoFactor` flag inline.
//   - auth-004-external-users-mfa-via-permsets — explicit (non-profile-
//     owned) permission set / PSG assignments that grant
//     `PermissionsForceTwoFactor` to those same external users.
//
// Either path can be present alone, both, or neither. Users whose
// effective MFA enforcement is true via either path count as "MFA-
// enforced". Users where neither path enforces MFA are "MFA-missing"
// and surfaced in the finding.
//
// Classification: cli_corroborating. The audit_procedure scopes to
// "external human users with SUBSTANTIAL ACCESS to sensitive data". The
// substantial-access classification is customer-defined (their data
// taxonomy + access policy) and stays in the questionnaire. CLI surfaces
// the inventory of external users + their MFA enforcement state;
// questionnaire confirms whether the inventory population matches the
// in-scope user definition the customer has documented.
//
// Outcomes:
//   - 0 external users → inconclusive (no portal/community population
//     to score; defer to questionnaire whether external users exist
//     under unusual UserType values)
//   - All external users have MFA enforced (Profile or PermSet) →
//     pass+high (questionnaire confirms substantial-access scope)
//   - N external users without MFA → inconclusive+high with sample
//     (Critical risk surface — questionnaire confirms which N are in
//     scope per the customer's substantial-access classification)

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-AUTH-004';
const INVENTORY_QUERY_ID = 'auth-004-external-users-mfa';
const PERMSET_QUERY_ID = 'auth-004-external-users-mfa-via-permsets';

const PASS_FINDING =
  'Respondent attests external users (customers, partners) with access to sensitive data must use multi-factor authentication with a strong second factor.';
const FAIL_FINDING =
  'Respondent attests external users with access to sensitive data are NOT required to use strong multi-factor authentication. External-user MFA gaps are a frequent source of customer data breaches.';

interface ExternalUser {
  id: string;
  username: string | undefined;
  userType: string | undefined;
  profileName: string | undefined;
  /** True when Profile-level PermissionsForceTwoFactor is true. */
  profileForcesMfa: boolean;
  /** True when at least one assigned PermissionSet (non-profile-owned)
   *  has PermissionsForceTwoFactor = true. Set by the second-pass
   *  permset query. */
  permsetForcesMfa: boolean;
}

const baseAttestation = attestationEvaluator({
  questionId: QUESTION_ID,
  passFinding: PASS_FINDING,
  failFinding: FAIL_FINDING,
});

export const evaluate: Evaluator = (input) => {
  const { evidence } = input;

  const inventory = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === INVENTORY_QUERY_ID,
  );
  const permsetGrants = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === PERMSET_QUERY_ID,
  );

  if (inventory || permsetGrants) {
    const users = unionMfaSignals(inventory?.rows ?? [], permsetGrants?.rows ?? []);
    return buildSoqlResult(users);
  }

  return baseAttestation(input);
};

/**
 * Walk the inventory rows (one per external user, with Profile-level
 * MFA flag inline) and the permset rows (one per (user, permset) pair
 * granting MFA), and return the merged per-user view. Users that
 * appear only in the permset query (no inventory entry) are dropped —
 * they're not active external users, just permset assignments to other
 * user types we don't care about.
 */
function unionMfaSignals(
  inventoryRows: ReadonlyArray<Record<string, unknown>>,
  permsetRows: ReadonlyArray<Record<string, unknown>>,
): ExternalUser[] {
  const byId = new Map<string, ExternalUser>();

  for (const row of inventoryRows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const username = typeof row['Username'] === 'string' ? row['Username'] : undefined;
    const userType = typeof row['UserType'] === 'string' ? row['UserType'] : undefined;
    const profile = isRecord(row['Profile']) ? row['Profile'] : undefined;
    const profileName =
      profile && typeof profile['Name'] === 'string' ? profile['Name'] : undefined;
    const profileForcesMfa = profile?.['PermissionsForceTwoFactor'] === true;
    byId.set(id, {
      id,
      username,
      userType,
      profileName,
      profileForcesMfa,
      permsetForcesMfa: false,
    });
  }

  for (const row of permsetRows) {
    const id = typeof row['AssigneeId'] === 'string' ? row['AssigneeId'] : null;
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      existing.permsetForcesMfa = true;
    }
    // Permset-only rows (no matching inventory entry) are dropped —
    // they belong to non-external users we don't care about for this
    // control's scope.
  }

  return [...byId.values()].sort((a, b) => (a.username ?? a.id).localeCompare(b.username ?? b.id));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function buildSoqlResult(users: ExternalUser[]): EvaluatorResult {
  if (users.length === 0) {
    return {
      status: 'inconclusive',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No active external users (UserType IN PowerCustomerSuccess / CustomerSuccess / CspLitePortal / PowerPartner) found. No portal/community population to score; defer to questionnaire whether external users exist under unusual UserType values that this query did not enumerate.',
      ],
    };
  }

  const missingMfa = users.filter((u) => !u.profileForcesMfa && !u.permsetForcesMfa);
  if (missingMfa.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        `All ${users.length} active external user(s) have MFA enforcement via Profile or Permission Set (PermissionsForceTwoFactor = true). MFA is enforced at the platform layer for the entire external population; questionnaire confirms whether this matches the customer's documented "substantial access to sensitive data" in-scope user definition.`,
      ],
    };
  }

  const sample = formatMissingSample(missingMfa);
  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${missingMfa.length} of ${users.length} active external user(s) do NOT have MFA enforcement via Profile or Permission Set. ${sample} The audit_procedure flags this for Critical-tier review — questionnaire (Q-AUTH-004) confirms which of these users qualify as "substantial access to sensitive data" per the customer's documented classification.`,
    ],
  };
}

/**
 * Format the first 5 MFA-missing users for the finding line, including
 * profile name for context. Caps at 5 with "+N more".
 */
function formatMissingSample(users: ReadonlyArray<ExternalUser>): string {
  const named = users.slice(0, 5).map((u) => {
    const profileClause = u.profileName ? `, profile=${u.profileName}` : '';
    return `${u.username ?? u.id}${profileClause}`;
  });
  const moreCount = Math.max(0, users.length - named.length);
  return `Sample: ${named.join('; ')}${moreCount > 0 ? ` (+${moreCount} more user(s))` : ''}.`;
}
