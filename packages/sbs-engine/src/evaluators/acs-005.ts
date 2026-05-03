// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-005: Only Use Custom Profiles for Active Users.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-005',
  passFinding:
    'Respondent attests all active users are on custom profiles (not the out-of-the-box `Standard User` profile).',
  failFinding:
    'Respondent attests they have active users on the standard `Standard User` profile, which cannot be tightened safely without breaking other users on the same profile.',
});
