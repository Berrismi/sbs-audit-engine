// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-004: Prevent Sensitive Data in Application Logs.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CODE-004',
  passFinding:
    'Respondent attests application logs are confirmed to never contain passwords, tokens, or sensitive personal data.',
  failFinding:
    'Respondent attests they cannot confirm application logs are free of passwords, tokens, or sensitive personal data. Log exfiltration is a canonical breach vector.',
});
