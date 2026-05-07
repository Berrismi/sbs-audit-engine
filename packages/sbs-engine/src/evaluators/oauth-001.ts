// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-001: Require Formal Installation of Connected Apps.
//
// CLI evidence: scan-core supplies two SOQL queries that together enumerate
// the ad-hoc OAuth-app population. They're separate because Salesforce's
// modern External Client App (ECA) lives on a different sObject family than
// the legacy ConnectedApplication entity:
//
//   - oauth-001-ad-hoc-connected-apps — Tooling SOQL on ConnectedApplication
//     (legacy / pre-Spring-'26 OAuth surface).
//   - oauth-001-ad-hoc-external-client-apps — standard SOQL on
//     ExternalClientApplication (the Spring-'26-onward replacement; alpha.17).
//
// Both filter `NamespacePrefix = null` (no managed-package namespace = the
// app was created in-org rather than installed via a managed/unmanaged
// package). Either path can be present alone, both, or neither. When neither
// is present the evaluator falls back to questionnaire attestation
// (low confidence).
//
// Classification: cli_primary. The SOQL directly verifies the policy.
// (Authoring rule: no __c custom-field assumptions in SOQL.)

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-OAUTH-001';
const CONNECTED_APP_QUERY_ID = 'oauth-001-ad-hoc-connected-apps';
const ECA_QUERY_ID = 'oauth-001-ad-hoc-external-client-apps';

const PASS_FINDING =
  'Respondent attests every Connected App is formally installed by an admin, never authorized ad-hoc by individual users.';
const FAIL_FINDING =
  'Respondent attests at least some Connected Apps are authorized ad-hoc by individual users rather than formally installed. Ad-hoc OAuth grants bypass admin oversight.';

interface AdHocApp {
  id: string;
  // Display label: ConnectedApplication uses `Name`; ExternalClientApplication
  // uses `MasterLabel` (with `DeveloperName` as a fallback). Normalize here so
  // the evaluator's findings render consistently regardless of source.
  label: string;
  surface: 'ConnectedApplication' | 'ExternalClientApplication';
}

function appsFromConnectedAppRows(rows: ReadonlyArray<Record<string, unknown>>): AdHocApp[] {
  const out: AdHocApp[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const label = typeof row['Name'] === 'string' ? row['Name'] : id;
    out.push({ id, label, surface: 'ConnectedApplication' });
  }
  return out;
}

function appsFromEcaRows(rows: ReadonlyArray<Record<string, unknown>>): AdHocApp[] {
  const out: AdHocApp[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const label =
      typeof row['MasterLabel'] === 'string'
        ? row['MasterLabel']
        : typeof row['DeveloperName'] === 'string'
          ? row['DeveloperName']
          : id;
    out.push({ id, label, surface: 'ExternalClientApplication' });
  }
  return out;
}

function buildSoqlResult(apps: AdHocApp[]): EvaluatorResult {
  if (apps.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No ad-hoc Connected Apps or External Client Applications detected. Every OAuth integration in the org came from a managed or unmanaged package install.',
      ],
    };
  }

  const caCount = apps.filter((a) => a.surface === 'ConnectedApplication').length;
  const ecaCount = apps.filter((a) => a.surface === 'ExternalClientApplication').length;
  const breakdown =
    caCount === 0
      ? `${ecaCount} via ExternalClientApplication`
      : ecaCount === 0
        ? `${caCount} via ConnectedApplication (legacy)`
        : `${caCount} via ConnectedApplication (legacy), ${ecaCount} via ExternalClientApplication`;

  // Cap the sample at 10 labels to avoid bloating the PDF finding line.
  const labels = apps.map((a) => a.label).slice(0, 10);
  const moreCount = Math.max(0, apps.length - labels.length);
  const sampleClause = ` Sample: ${labels.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`;

  return {
    status: 'fail',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${apps.length} ad-hoc OAuth app(s) detected (${breakdown}).${sampleClause} ` +
        'These were created in-org rather than installed via a package — review whether each represents an approved integration.',
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
