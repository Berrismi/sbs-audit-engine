// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-009: Implement Compensating Controls for Privileged Non-Human Identities.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-009',
  passFinding:
    'Respondent attests privileged non-human accounts have compensating controls in place (IP restrictions, monitoring, etc.).',
  failFinding:
    'Respondent attests privileged non-human accounts do NOT have compensating controls (IP restrictions, monitoring, etc.) to reduce risk.',
});
