// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-002: Maintain an Inventory of Long Text Area Fields Containing Regulated Data.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DATA-002',
  passFinding:
    'Respondent attests they keep an up-to-date inventory of every Long Text Area field that contains regulated data.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory of Long Text Area fields containing regulated data. Without it, controls cannot be applied to the right fields.',
});
