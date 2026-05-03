// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-004: Enforce Strong MFA for External Users with Substantial
// Access to Sensitive Data.
//
// Note: upstream YAML omits risk_level for this control at v0.4.1; the
// HelloMavens override pins it to Critical. See data/control-overrides.json.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-AUTH-004',
  passFinding:
    'Respondent attests external users (customers, partners) with access to sensitive data must use multi-factor authentication with a strong second factor.',
  failFinding:
    'Respondent attests external users with access to sensitive data are NOT required to use strong multi-factor authentication. External-user MFA gaps are a frequent source of customer data breaches.',
});
