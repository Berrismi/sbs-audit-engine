// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-002: Require Profile or Permission Set Access Control for Connected Apps.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-OAUTH-002',
  passFinding:
    'Respondent attests access to every Connected App is controlled by profile or permission set, never set to "available to all users."',
  failFinding:
    'Respondent attests at least one Connected App is set to "available to all users" rather than gated by profile or permission set.',
});
