// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-012: Classify Users for Login Hours Restrictions.
//
// CLI evidence path: shared `profiles-priority-100` Metadata API probe
// returns each Profile's `loginHours` sub-element when configured. The
// evaluator counts Profiles that carry any of the 14 day*Start/day*End
// values; presence of at least one such Profile suggests the org has
// implemented classification-driven login-hour restrictions.
//
// Why metadata, not SOQL: alpha.31 multi-org verification (DE
// hm-cli-validation, prod ProdProksel, prod loan-maven) confirmed that
// Profile.LoginHoursMondayStart and the other six LoginHours*Start /
// *End SOQL columns are NOT present on Profile in any modern Salesforce
// org. The previous SOQL query (acs-012-profiles-with-login-hours) was
// therefore field-gate-skipped on every consumer scan since alpha.X —
// the control silently degraded to questionnaire-only on every run. The
// information lives only in Profile metadata (XML / jsforce JSON), so
// the migration to the metadata_api evidence path is the only viable
// CLI signal for this control.
//
// Cap context: the profiles-priority-100 probe retrieves up to N Profiles
// per Q3 of the Track B design review, prioritized by
// `prioritizeProfileNames` (standard + integration-shaped names first).
// Login hours are typically configured on standard or named-Custom
// Profiles tied to specific user types — the population the prioritizer
// surfaces — so the cap is well-matched to this control's signal.
//
// Classification: cli_primary. Metadata "any vs none" is a defensible
// verdict for the underlying policy; questionnaire (when metadata
// absent) covers the classification-correctness nuance.

import { metadataApiEvaluator } from './_metadata-api';

const PROFILE_TYPE = 'Profile';

const LOGIN_HOURS_FIELDS = [
  'mondayStart',
  'mondayEnd',
  'tuesdayStart',
  'tuesdayEnd',
  'wednesdayStart',
  'wednesdayEnd',
  'thursdayStart',
  'thursdayEnd',
  'fridayStart',
  'fridayEnd',
  'saturdayStart',
  'saturdayEnd',
  'sundayStart',
  'sundayEnd',
] as const;

export const evaluate = metadataApiEvaluator({
  questionId: 'Q-ACS-012',
  passFinding:
    'Respondent attests they have identified user types that should be restricted to specific login hours (or have equivalent off-hours monitoring).',
  failFinding:
    'Respondent attests they have NOT identified user types for login-hour restrictions or equivalent off-hours monitoring.',
  metadataType: PROFILE_TYPE,
  evaluateMetadata: (records) => {
    if (records.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          'No Profile metadata available to inspect for Login Hours configuration. Defer to questionnaire.',
        ],
      };
    }

    const configured = collectProfilesWithLoginHours(records);
    if (configured.length === 0) {
      return {
        status: 'fail',
        findings: [
          `Inspected ${records.length} Profile(s); none have Login Hours restrictions configured. ` +
            'The classification-driven login-hours policy is not in use anywhere in the inspected set.',
        ],
      };
    }

    const sample = formatSample(configured);
    return {
      status: 'pass',
      findings: [
        `${configured.length} of ${records.length} Profile(s) have Login Hours restrictions configured. ${sample} ` +
          'Classification-driven restrictions are in use; the questionnaire is the place to validate which user types should also be restricted.',
      ],
    };
  },
});

/**
 * Walk Profile records and return those whose `loginHours` element carries
 * at least one non-empty day*Start / day*End value. jsforce serializes the
 * Profile metadata XML element as a nested object; absence of the element
 * (the canonical "no login hours configured" state) means the field is
 * undefined on the record.
 */
function collectProfilesWithLoginHours(
  records: ReadonlyArray<Record<string, unknown>>,
): Array<{ fullName: string }> {
  const out: Array<{ fullName: string }> = [];
  for (const record of records) {
    const fullName = typeof record['fullName'] === 'string' ? record['fullName'] : null;
    if (!fullName) continue;
    if (hasAnyLoginHourField(record['loginHours'])) {
      out.push({ fullName });
    }
  }
  out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return out;
}

/**
 * True when `raw` is a non-null object containing at least one of the 14
 * documented day*Start / day*End fields with a non-empty string value. The
 * platform may serialize unset entries as missing keys or as empty strings;
 * both are treated as "not configured".
 */
function hasAnyLoginHourField(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  for (const field of LOGIN_HOURS_FIELDS) {
    const v = o[field];
    if (typeof v === 'string' && v.length > 0) return true;
    if (typeof v === 'number') return true;
  }
  return false;
}

/**
 * Format the first 5 Profile names for the finding line. Same pacing as
 * AUTH-002 / ACS-007.
 */
function formatSample(profiles: ReadonlyArray<{ fullName: string }>): string {
  const named = profiles.slice(0, 5).map((p) => p.fullName);
  const moreCount = Math.max(0, profiles.length - named.length);
  return `Sample: ${named.join(', ')}${moreCount > 0 ? ` (+${moreCount} more profile(s))` : ''}.`;
}
