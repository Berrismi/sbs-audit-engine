// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-002: Establish and Maintain a List of High-Risk Metadata Types
// Prohibited from Direct Production Editing.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-002',
  passFinding:
    'Respondent attests they maintain a written list of high-risk metadata types prohibited from direct production editing by humans.',
  failFinding:
    'Respondent attests they do NOT maintain a written list of high-risk metadata types prohibited from direct production editing.',
});
