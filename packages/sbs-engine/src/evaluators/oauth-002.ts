// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-002: Require Profile or Permission Set Access Control for Connected Apps.
//
// CLI evidence path: scan-core query
// `oauth-002-connected-apps-without-admin-approval` returns Connected Apps
// where `OptionsAllowAdminApprovedUsersOnly = false`. When that flag is
// false, any authenticated user can self-authorize the app (no profile /
// permset gating). Audit_procedure step 2 asks the consultant to verify
// access scoping; this query surfaces apps that lack the platform-enforced
// scoping toggle.
//
// Classification: cli_corroborating per the roadmap. SOQL identifies
// candidates; the questionnaire confirms whether those apps are
// intentional self-service (e.g., a managed-package app designed that way)
// or a misconfiguration. 0 rows = pass (every app requires admin
// approval); ≥1 rows = inconclusive (intent verification deferred to
// questionnaire). Field-gated on `OptionsAllowAdminApprovedUsersOnly`
// (defensive; alpha.15 shipped this against a fabricated field name,
// alpha.16 corrected after live Tooling-API validation).

import { cliAttestationEvaluator } from './_attestation';

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-OAUTH-002',
  passFinding:
    'Respondent attests access to every Connected App is controlled by profile or permission set, never set to "available to all users."',
  failFinding:
    'Respondent attests at least one Connected App is set to "available to all users" rather than gated by profile or permission set.',
  soqlQueryId: 'oauth-002-connected-apps-without-admin-approval',
  evaluateSoql: (rows) => {
    if (rows.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No Connected Apps allow self-service authorization. Every installed app requires admin approval — profile/permset assignment gates access.',
        ],
      };
    }
    return {
      status: 'inconclusive',
      findings: [
        `${rows.length} Connected App(s) do not require admin approval (self-service authorization enabled). ` +
          'SOQL surfaces the candidates; verify whether each is an intentional self-service app (e.g., a managed-package app designed for that flow) or a misconfiguration via questionnaire.',
      ],
    };
  },
});
