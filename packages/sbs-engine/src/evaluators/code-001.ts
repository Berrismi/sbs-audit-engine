// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-001: Mandatory Peer Review for Salesforce Code Changes.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CODE-001',
  passFinding:
    'Respondent attests every Apex or Lightning code change is peer-reviewed and approved before reaching production.',
  failFinding:
    'Respondent attests code changes do NOT all go through mandatory peer review before reaching production.',
});
