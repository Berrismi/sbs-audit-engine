// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-003: Prohibit Broad or Unrestricted Profile Login IP Ranges.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-AUTH-003',
  passFinding:
    'Respondent attests all profile-level login IP restrictions are narrow enough to actually limit access (no `0.0.0.0/0` or other internet-wide ranges).',
  failFinding:
    'Respondent attests at least one profile has an unrestricted login IP range (e.g., `0.0.0.0/0`) that defeats the purpose of IP allow-listing.',
});
