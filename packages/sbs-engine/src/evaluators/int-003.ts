// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-003: Inventory and Justification of Named Credentials.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-INT-003',
  passFinding:
    'Respondent attests they maintain an up-to-date inventory of every Named Credential with documented justification for each.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory + justification list for Named Credentials. Forgotten Named Credentials with valid stored secrets are a hidden third-party access surface.',
});
