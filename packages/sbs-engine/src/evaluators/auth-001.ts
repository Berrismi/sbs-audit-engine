// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-001: Enable Organization-Wide SSO Enforcement Setting.
//
// CLI evidence path: shared `security-settings` Metadata API probe
// retrieves the org's singleton SecuritySettings record. The evaluator
// inspects `singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled`
// — when true, all users are forced through SSO and cannot authenticate
// with Salesforce credentials. When false (or missing), users can still
// authenticate locally, bypassing the IdP.
//
// alpha.26 ships the AUTH-001 evidence path that was deferred from
// alpha.24. Track B foundation's validate-metadata script now uses
// @salesforce/core's Connection directly instead of `sf project retrieve
// start`, bypassing the sf CLI's source-deploy-retrieve registry which
// doesn't list SecuritySettings as a known type. The runtime jsforce
// path always supported SecuritySettings — only the author-time
// validation gate was blocked.
//
// jsforce serialization caveat: Salesforce Metadata API returns boolean
// fields as STRINGS in some shapes — `"true"` / `"false"` rather than
// `true` / `false`. The evaluator accepts BOTH so the runtime is
// resilient to whichever shape jsforce produces (and any future
// normalization changes).
//
// Classification: cli_corroborating. The metadata IS the source of truth
// for this control — the org-level setting either forces SSO or it
// doesn't, and the inspection is mechanical. The questionnaire fallback
// covers orgs where the Metadata API isn't reachable (auth scope
// limited, edition gating, etc).
//
// Pass shape: SecuritySettings exists AND
// singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled is true
// (boolean true OR string "true"). Fail = present-and-false. Inconclusive
// = missing record or missing field.

import { metadataApiEvaluator } from './_metadata-api';

const SECURITY_SETTINGS_TYPE = 'SecuritySettings';

export const evaluate = metadataApiEvaluator({
  questionId: 'Q-AUTH-001',
  passFinding:
    'Respondent attests the org-wide setting forcing all users through single sign-on (and disabling Salesforce passwords) is enabled.',
  failFinding:
    'Respondent attests the org-wide SSO enforcement setting is NOT enabled. Without it, users can still authenticate with Salesforce passwords, bypassing the IdP.',
  metadataType: SECURITY_SETTINGS_TYPE,
  evaluateMetadata: (records) => {
    if (records.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          'No SecuritySettings record retrieved from the Metadata API. The org may have edition-gated access or auth scope limitations preventing retrieval. Defer to questionnaire.',
        ],
      };
    }

    const record = records[0]!;
    const sso = readSsoSettings(record);
    if (!sso) {
      return {
        status: 'inconclusive',
        findings: [
          'SecuritySettings was retrieved but `singleSignOnSettings` was missing from the response. Possible auth-scope restriction or schema drift; defer to questionnaire.',
        ],
      };
    }

    const flag = sso['isLoginWithSalesforceCredentialsDisabled'];
    if (!isBooleanLike(flag)) {
      return {
        status: 'inconclusive',
        findings: [
          'singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled was missing or not a boolean/string-boolean shape. Defer to questionnaire.',
        ],
      };
    }

    if (parseBoolean(flag)) {
      return {
        status: 'pass',
        findings: [
          'Org-wide SSO enforcement is ON: `singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled = true`. All users are forced through SSO; Salesforce credential logins are disabled. SSO bypass at the org boundary is closed at the platform layer.',
        ],
      };
    }

    return {
      status: 'fail',
      findings: [
        'Org-wide SSO enforcement is OFF: `singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled = false`. Users can still authenticate with Salesforce credentials, bypassing the IdP — this is the Salesforce default. Enable the setting at Setup → Single Sign-On Settings to close the SSO bypass at the org boundary.',
      ],
    };
  },
});

/**
 * Read the singleSignOnSettings sub-object from a SecuritySettings record.
 * Tolerates missing field, non-object value, or null. Returns undefined on
 * any defensive miss.
 */
function readSsoSettings(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const sso = record['singleSignOnSettings'];
  if (!sso || typeof sso !== 'object' || Array.isArray(sso)) return undefined;
  return sso as Record<string, unknown>;
}

/**
 * True when the value is one of the boolean-shaped values jsforce may
 * produce: literal boolean, or the strings 'true' / 'false' (case-
 * insensitive). Anything else is treated as "not boolean-shaped".
 */
function isBooleanLike(v: unknown): v is boolean | string {
  if (typeof v === 'boolean') return true;
  if (typeof v !== 'string') return false;
  const lower = v.toLowerCase();
  return lower === 'true' || lower === 'false';
}

/**
 * Coerce a boolean-like value to a boolean. Caller should have called
 * `isBooleanLike` first; this is internal-only.
 */
function parseBoolean(v: boolean | string): boolean {
  if (typeof v === 'boolean') return v;
  return v.toLowerCase() === 'true';
}
