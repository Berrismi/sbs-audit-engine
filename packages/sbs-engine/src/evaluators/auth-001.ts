// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-001: Enable Organization-Wide SSO Enforcement Setting.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-AUTH-001',
  passFinding:
    'Respondent attests the org-wide setting forcing all users through single sign-on (and disabling Salesforce passwords) is enabled.',
  failFinding:
    'Respondent attests the org-wide SSO enforcement setting is NOT enabled. Without it, users can still authenticate with Salesforce passwords, bypassing the IdP.',
});
