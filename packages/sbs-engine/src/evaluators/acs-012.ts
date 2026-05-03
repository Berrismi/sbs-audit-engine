// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-012: Classify Users for Login Hours Restrictions.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-012',
  passFinding:
    'Respondent attests they have identified user types that should be restricted to specific login hours (or have equivalent off-hours monitoring).',
  failFinding:
    'Respondent attests they have NOT identified user types for login-hour restrictions or equivalent off-hours monitoring.',
});
