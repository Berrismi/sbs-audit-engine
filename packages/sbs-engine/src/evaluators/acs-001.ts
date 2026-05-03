// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-001: Enforce a Documented Permission Set Model.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-001',
  passFinding:
    'Respondent attests they maintain a documented permission set model in a system of record.',
  failFinding:
    'Respondent attests they do NOT maintain a documented permission set model. Auditors expect a written, enforced model in a system of record.',
});
