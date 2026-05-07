// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-002: Require Profile or Permission Set Access Control for
// Connected Apps + External Client Apps.
//
// CLI evidence: scan-core supplies two SOQL queries that together enumerate
// OAuth apps lacking admin-gating across the legacy and modern surfaces.
// They're separate because the boolean lives in different shapes per surface:
//
//   - oauth-002-connected-apps-without-admin-approval — Tooling SOQL on
//     ConnectedApplication where `OptionsAllowAdminApprovedUsersOnly = false`
//     (legacy CA surface; field name verified in alpha.16 against live
//     Tooling-API describe).
//   - oauth-002-eca-without-admin-approval — standard SOQL on
//     ExtlClntAppOauthPlcyCnfg where `PermittedUsersPolicyType =
//     'AllSelfAuthorized'` (the picklist value meaning "any authenticated
//     user can self-authorize"; the alternative is
//     `AdminApprovedPreAuthorized`). alpha.17.
//
// Either path can be present alone, both, or neither. When neither is
// present the evaluator falls back to questionnaire attestation (low
// confidence).
//
// Classification: cli_corroborating per the roadmap. SOQL surfaces apps
// with self-service authorization; questionnaire confirms whether each is
// intentional (e.g., a managed-package app designed that way) or a
// misconfiguration. 0 rows = pass; ≥1 rows = inconclusive (intent
// verification deferred to questionnaire).

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-OAUTH-002';
const CONNECTED_APP_QUERY_ID = 'oauth-002-connected-apps-without-admin-approval';
const ECA_QUERY_ID = 'oauth-002-eca-without-admin-approval';

const PASS_FINDING =
  'Respondent attests access to every Connected App is controlled by profile or permission set, never set to "available to all users."';
const FAIL_FINDING =
  'Respondent attests at least one Connected App is set to "available to all users" rather than gated by profile or permission set.';

interface SelfServiceApp {
  id: string;
  // Display label: ConnectedApplication carries `Name` directly; the ECA
  // policy-config row joins back via `ExternalClientApplicationId` (which we
  // surface as the label since the parent ECA's name isn't joined here —
  // keeps the policy query simple; report can dereference if needed).
  label: string;
  surface: 'ConnectedApplication' | 'ExternalClientApplication';
}

function appsFromConnectedAppRows(rows: ReadonlyArray<Record<string, unknown>>): SelfServiceApp[] {
  const out: SelfServiceApp[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const label = typeof row['Name'] === 'string' ? row['Name'] : id;
    out.push({ id, label, surface: 'ConnectedApplication' });
  }
  return out;
}

function appsFromEcaRows(rows: ReadonlyArray<Record<string, unknown>>): SelfServiceApp[] {
  const out: SelfServiceApp[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    // Use the parent ECA id as the label hint — keeps the finding terse and
    // verifiable in Setup. A future enrichment could join ExternalClientApplication
    // for the human-readable name.
    const parentEcaId =
      typeof row['ExternalClientApplicationId'] === 'string'
        ? row['ExternalClientApplicationId']
        : id;
    out.push({ id, label: `ECA ${parentEcaId}`, surface: 'ExternalClientApplication' });
  }
  return out;
}

function buildSoqlResult(apps: SelfServiceApp[]): EvaluatorResult {
  if (apps.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No Connected Apps or External Client Applications allow self-service authorization. Every installed OAuth app requires admin approval — profile/permset assignment gates access.',
      ],
    };
  }

  const caCount = apps.filter((a) => a.surface === 'ConnectedApplication').length;
  const ecaCount = apps.filter((a) => a.surface === 'ExternalClientApplication').length;
  const breakdown =
    caCount === 0
      ? `${ecaCount} via ExternalClientApplication policy config`
      : ecaCount === 0
        ? `${caCount} via ConnectedApplication (legacy)`
        : `${caCount} via ConnectedApplication (legacy), ${ecaCount} via ExternalClientApplication policy config`;

  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${apps.length} OAuth app(s) do not require admin approval / self-service authorization is enabled (${breakdown}). ` +
        'SOQL surfaces the candidates; verify whether each is an intentional self-service app (e.g., a managed-package app designed for that flow) or a misconfiguration via questionnaire.',
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
    const fromCAs = connectedApps ? appsFromConnectedAppRows(connectedApps.rows) : [];
    const fromECAs = ecas ? appsFromEcaRows(ecas.rows) : [];
    return buildSoqlResult([...fromCAs, ...fromECAs]);
  }

  return baseAttestation(input);
};
