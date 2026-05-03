// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-002: Documented Justification for All `API-Enabled` Authorizations.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-002',
  passFinding:
    'Respondent attests every user with the `API Enabled` permission has documented business or technical justification.',
  failFinding:
    'Respondent attests they do NOT have documented justification for every `API Enabled` user. Programmatic access without documented need expands the attack surface.',
});
