// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-001: Prevent Parameter-Based Record Access in Portal Apex.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CPORTAL-001',
  passFinding:
    'Respondent attests no portal Apex method accepts a record ID directly from the user — every record lookup is bound to the logged-in user context.',
  failFinding:
    'Respondent attests they cannot confirm portal Apex methods are free of parameter-based record access. This is the canonical IDOR (insecure direct object reference) vector for portals.',
});
