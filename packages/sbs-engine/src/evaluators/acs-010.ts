// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-010: Enforce Periodic Access Review and Recertification.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-010',
  passFinding:
    'Respondent attests business stakeholders formally review and re-approve user access at least annually with documented results.',
  failFinding:
    'Respondent attests user access is NOT formally reviewed and re-approved at least annually with documented results. Recertification is a SOC 2 CC6.2 expectation.',
});
