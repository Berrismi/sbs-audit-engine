// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-003: Documented Justification for `Approve Uninstalled Connected Apps` Permission.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-003',
  passFinding:
    'Respondent attests the `Approve Uninstalled Connected Apps` permission is restricted to a few highly-trusted admins, each with written justification.',
  failFinding:
    'Respondent attests the `Approve Uninstalled Connected Apps` permission is NOT properly restricted with documented justification per holder. End-users with this permission can self-approve OAuth grants.',
});
