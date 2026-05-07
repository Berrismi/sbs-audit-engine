// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-002: Govern and Document All Users Permitted to Bypass Single
// Sign-On.
//
// CLI evidence path: shared `profiles-priority-100` Metadata API probe
// returns each Profile's `userPermissions` array. The evaluator inspects
// the array for the `IsSsoEnabled` permission and identifies Profiles
// where it is NOT enabled — those Profiles' assigned users CAN authenticate
// with Salesforce credentials, bypassing SSO.
//
// Naming caveat: the Salesforce permission `IsSsoEnabled` is confusingly
// named. The audit_procedure clarifies the semantics:
//   - Permission = true  → user is REQUIRED to use SSO (no Salesforce
//                          credentials)
//   - Permission = false → user CAN still use Salesforce credentials =
//                          SSO bypass
// jsforce serializes Profile metadata with only enabled permissions in
// the userPermissions array; a Profile that omits `IsSsoEnabled` has it
// effectively false (= bypass-capable).
//
// Profile-level vs User-level scope: this evaluator surfaces Profiles
// that allow SSO bypass. A user could ALSO be granted IsSsoEnabled via
// permission set assignment, which would override the Profile-level
// state. The Profile-level inventory is a starting point for the
// questionnaire to verify; full User-level scope would require a
// PermissionSetAssignment SOQL join (deferred to a future PR if needed).
//
// Classification: cli_corroborating. SOQL/metadata surfaces the Profile
// surface; questionnaire (Q-AUTH-002) confirms whether each Profile's
// users have documented business reasons for the bypass.

import { metadataApiEvaluator } from './_metadata-api';

const PROFILE_TYPE = 'Profile';
const TARGET_PERMISSION = 'IsSsoEnabled';

interface BypassCapableProfile {
  fullName: string;
}

export const evaluate = metadataApiEvaluator({
  questionId: 'Q-AUTH-002',
  passFinding:
    'Respondent attests every user permitted to bypass single sign-on has a documented business reason on file.',
  failFinding:
    'Respondent attests there are users permitted to bypass single sign-on without documented business reasons. SSO-bypass accounts are the canonical break-glass attack target.',
  metadataType: PROFILE_TYPE,
  evaluateMetadata: (records) => {
    const bypassCapable = collectBypassCapableProfiles(records);
    if (bypassCapable.length === 0) {
      if (records.length === 0) {
        return {
          status: 'inconclusive',
          findings: [
            'No Profile metadata available to inspect for SSO-bypass capability. Defer to questionnaire.',
          ],
        };
      }
      return {
        status: 'pass',
        findings: [
          `All ${records.length} Profile(s) inspected enforce SSO via the IsSsoEnabled permission. No SSO-bypass-capable Profiles found at the Profile layer (note: a permission set could still grant IsSsoEnabled override, which is questionnaire territory).`,
        ],
      };
    }

    const sample = formatBypassSample(bypassCapable);
    return {
      status: 'inconclusive',
      findings: [
        `${bypassCapable.length} of ${records.length} Profile(s) do NOT enforce IsSsoEnabled — assigned users can authenticate with Salesforce credentials, bypassing SSO. ${sample} Whether each is a documented break-glass / approved exception is questionnaire territory (Q-AUTH-002).`,
      ],
    };
  },
});

/**
 * Walk Profile records and return those whose userPermissions does NOT
 * contain an enabled `IsSsoEnabled` entry. jsforce metadata XML serializes
 * only enabled permissions; absence is the canonical "permission not
 * granted" state for Profile metadata.
 */
function collectBypassCapableProfiles(
  records: ReadonlyArray<Record<string, unknown>>,
): BypassCapableProfile[] {
  const out: BypassCapableProfile[] = [];
  for (const record of records) {
    const fullName = typeof record['fullName'] === 'string' ? record['fullName'] : null;
    if (!fullName) continue;
    if (!hasEnabledPermission(record['userPermissions'], TARGET_PERMISSION)) {
      out.push({ fullName });
    }
  }
  out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return out;
}

/**
 * Check whether a userPermissions array contains an entry where
 * name === permName AND enabled === true. Tolerates:
 *   - Missing/undefined userPermissions (returns false)
 *   - Single-object userPermissions (jsforce one-element shape)
 *   - Entries with non-string name or non-boolean enabled (skipped)
 */
function hasEnabledPermission(raw: unknown, permName: string): boolean {
  if (!raw) return false;
  const items = Array.isArray(raw) ? raw : [raw];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o['name'] === permName && o['enabled'] === true) return true;
  }
  return false;
}

/**
 * Format the first 5 bypass-capable Profile names for the finding line.
 * Caps at 5 with a "+N more" tail. Same pacing as ACS-004 / ACS-007.
 */
function formatBypassSample(profiles: ReadonlyArray<BypassCapableProfile>): string {
  const named = profiles.slice(0, 5).map((p) => p.fullName);
  const moreCount = Math.max(0, profiles.length - named.length);
  return `Sample: ${named.join(', ')}${moreCount > 0 ? ` (+${moreCount} more profile(s))` : ''}.`;
}
