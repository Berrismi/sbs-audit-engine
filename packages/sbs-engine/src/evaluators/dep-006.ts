// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-006: Configure Salesforce CLI Connected App with Token Expiration
// Policies. Audit thresholds (per audit_procedure):
//
//   - Refresh-token policy: "Expire refresh token after" with validity ≤ 90
//     days. "Never expires" / infinite policy fails.
//   - Session policy timeout: ≤ 15 minutes.
//
// CLI evidence: scan-core supplies two SOQL queries that together cover the
// legacy Connected Application surface AND the modern External Client App
// surface — Salesforce migration path means an org can carry either or both:
//
//   - dep-006-connected-apps-without-token-expiry — Tooling SOQL on
//     ConnectedApplication where `RefreshTokenValidityPeriod = null`
//     (unambiguous "no explicit expiry policy"). The Tooling field is an
//     `int` with no separate unit field surfaced in SOQL — its underlying
//     metadata uses days but the SOQL int doesn't expose that, so we cannot
//     safely emit numeric "exceeds 90 days" comparisons from the legacy
//     surface alone. Conservative semantic: enumerate the unambiguous
//     "no policy set" case and let the consultant verify numeric values in
//     Setup. The finding surfaces this caveat.
//   - dep-006-eca-token-policies — standard SOQL on ExtlClntAppOauthPlcyCnfg
//     pulling every policy config (no WHERE clause). The evaluator
//     classifies each per the audit thresholds:
//       * `RefreshTokenPolicyType = 'Infinite'` → fails (never expires)
//       * `RefreshTokenPolicyType = 'SpecificLifetime'` AND validity > 90
//         days (after `RefreshTokenValidityUnit` conversion) → fails
//       * `SessionTimeoutInMinutes > 15` → fails
//
// Either path can be present alone, both, or neither. When neither is
// present the evaluator falls back to questionnaire attestation
// (low confidence).
//
// Coverage caveat: the DEFAULT Salesforce CLI uses an internal "PlatformCLI"
// client identity that does NOT surface as a customer-side
// ConnectedApplication or ExternalClientApplication record. So this control
// only directly covers customers who registered a custom CA or ECA for CLI
// auth (audit_procedure step 4 — "If a custom Connected App is used,
// verify..."). For default-CLI customers the SOQL surfaces nothing and the
// questionnaire fallback adjudicates.
//
// Classification: cli_corroborating per the alpha.17 promotion. Scan
// surfaces high-fidelity violations from the customer-managed surfaces;
// questionnaire confirms the default-CLI case + the consultant's verification
// of any flagged numeric values on the legacy surface.

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-DEP-006';
const CONNECTED_APP_QUERY_ID = 'dep-006-connected-apps-without-token-expiry';
const ECA_QUERY_ID = 'dep-006-eca-token-policies';

const REFRESH_TOKEN_MAX_DAYS = 90;
const SESSION_TIMEOUT_MAX_MINUTES = 15;

const PASS_FINDING =
  'Respondent attests the Salesforce CLI Connected App is configured with refresh tokens expiring within 90 days and access tokens within 15 minutes.';
const FAIL_FINDING =
  'Respondent attests the Salesforce CLI Connected App is NOT configured with strict token expiration policies. Long-lived CLI credentials become silent attack vectors when developer machines are compromised.';

interface PolicyViolation {
  // Display: ConnectedApplication carries `Name`; ECA policy rows carry the
  // parent ECA id (we surface `ECA <id>` so the consultant can dereference
  // in Setup).
  label: string;
  surface: 'ConnectedApplication' | 'ExternalClientApplication';
  reasons: string[];
}

function caViolationsFromRows(rows: ReadonlyArray<Record<string, unknown>>): PolicyViolation[] {
  // The legacy ConnectedApplication query already filters
  // `RefreshTokenValidityPeriod = null`, so every row is a "no explicit
  // policy" violation. We just normalize the label.
  const out: PolicyViolation[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const label = typeof row['Name'] === 'string' ? row['Name'] : id;
    out.push({
      label,
      surface: 'ConnectedApplication',
      reasons: ['no explicit refresh-token expiry policy set (verify in Setup)'],
    });
  }
  return out;
}

// Convert a (period, unit) pair into days. The picklist values for
// RefreshTokenValidityUnit on ExtlClntAppOauthPlcyCnfg are: '0' = Day(s),
// '1' = Hour(s), '2' = Month(s). Returns NaN for unrecognized inputs so the
// caller can choose to skip the row rather than emit a wrong number.
function periodToDays(period: number, unit: string): number {
  if (!Number.isFinite(period)) return NaN;
  switch (unit) {
    case '0':
      return period;
    case '1':
      return period / 24;
    case '2':
      return period * 30;
    default:
      return NaN;
  }
}

function ecaViolationsFromRows(rows: ReadonlyArray<Record<string, unknown>>): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;

    const parentEcaId =
      typeof row['ExternalClientApplicationId'] === 'string'
        ? row['ExternalClientApplicationId']
        : id;
    const label = `ECA ${parentEcaId}`;

    const policyType =
      typeof row['RefreshTokenPolicyType'] === 'string' ? row['RefreshTokenPolicyType'] : '';
    const period =
      typeof row['RefreshTokenValidityPeriod'] === 'number'
        ? row['RefreshTokenValidityPeriod']
        : Number.NaN;
    const unit =
      typeof row['RefreshTokenValidityUnit'] === 'string' ? row['RefreshTokenValidityUnit'] : '';
    const sessionTimeout =
      typeof row['SessionTimeoutInMinutes'] === 'number' ? row['SessionTimeoutInMinutes'] : null;

    const reasons: string[] = [];

    if (policyType === 'Infinite') {
      reasons.push('refresh token never expires (RefreshTokenPolicyType = Infinite)');
    } else if (policyType === 'SpecificLifetime') {
      const days = periodToDays(period, unit);
      if (Number.isFinite(days) && days > REFRESH_TOKEN_MAX_DAYS) {
        reasons.push(
          `refresh-token validity exceeds ${REFRESH_TOKEN_MAX_DAYS} days (~${Math.round(days)} days)`,
        );
      }
    }

    if (sessionTimeout !== null && sessionTimeout > SESSION_TIMEOUT_MAX_MINUTES) {
      reasons.push(
        `session timeout exceeds ${SESSION_TIMEOUT_MAX_MINUTES} minutes (${sessionTimeout} minutes)`,
      );
    }

    if (reasons.length > 0) {
      out.push({ label, surface: 'ExternalClientApplication', reasons });
    }
  }
  return out;
}

function buildSoqlResult(
  violations: PolicyViolation[],
  surveyed: { connectedApps: boolean; ecas: boolean },
): EvaluatorResult {
  if (violations.length === 0) {
    const passMessage =
      surveyed.connectedApps && surveyed.ecas
        ? 'No Connected Apps or External Client Applications carry token policies that violate the 90-day refresh / 15-minute session audit thresholds.'
        : surveyed.connectedApps
          ? 'No Connected Apps carry token policies that violate the 90-day refresh / 15-minute session audit thresholds. (External Client Application surface was not queried on this scan — gated-skipped or absent.)'
          : 'No External Client Applications carry token policies that violate the 90-day refresh / 15-minute session audit thresholds. (Connected Application surface was not queried on this scan — gated-skipped or absent.)';
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [passMessage],
    };
  }

  const caCount = violations.filter((v) => v.surface === 'ConnectedApplication').length;
  const ecaCount = violations.filter((v) => v.surface === 'ExternalClientApplication').length;
  const breakdown =
    caCount === 0
      ? `${ecaCount} via ExternalClientApplication`
      : ecaCount === 0
        ? `${caCount} via ConnectedApplication (legacy)`
        : `${caCount} via ConnectedApplication (legacy), ${ecaCount} via ExternalClientApplication`;

  // Surface up to 5 specific violations for the finding line — enough to
  // give the consultant a real sense of severity without bloating the PDF.
  const sample = violations
    .slice(0, 5)
    .map((v) => `${v.label}: ${v.reasons.join('; ')}`)
    .join(' | ');
  const moreCount = Math.max(0, violations.length - 5);
  const sampleClause = sample
    ? ` Sample: ${sample}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`
    : '';

  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${violations.length} OAuth app(s) carry token policies that fail the audit thresholds (${breakdown}).${sampleClause} ` +
        'The default Salesforce CLI uses an internal client identity that does not surface here — questionnaire confirms whether the default-CLI case is also bounded.',
    ],
  };
}

const baseAttestation = attestationEvaluator({
  questionId: QUESTION_ID,
  passFinding: PASS_FINDING,
  failFinding: FAIL_FINDING,
});

export const evaluate: Evaluator = (input) => {
  const { evidence } = input;

  const connectedApps = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === CONNECTED_APP_QUERY_ID,
  );
  const ecas = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === ECA_QUERY_ID,
  );

  if (connectedApps || ecas) {
    const fromCAs = connectedApps ? caViolationsFromRows(connectedApps.rows) : [];
    const fromECAs = ecas ? ecaViolationsFromRows(ecas.rows) : [];
    return buildSoqlResult([...fromCAs, ...fromECAs], {
      connectedApps: connectedApps !== undefined,
      ecas: ecas !== undefined,
    });
  }

  return baseAttestation(input);
};
