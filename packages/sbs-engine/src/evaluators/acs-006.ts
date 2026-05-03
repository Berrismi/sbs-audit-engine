// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-006: Documented Justification for `Use Any API Client` Permission.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-006',
  passFinding:
    'Respondent attests the `Use Any API Client` permission is restricted to a few highly-trusted users with documented justification.',
  failFinding:
    'Respondent attests the `Use Any API Client` permission is NOT restricted to a few highly-trusted users with documented justification. This permission bypasses Connected App allow-listing.',
});
