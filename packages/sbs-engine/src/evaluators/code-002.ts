// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-002: Pre-Merge Static Code Analysis for Apex and LWC.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CODE-002',
  passFinding:
    'Respondent attests an automated security scanner (e.g., Salesforce Code Analyzer, PMD) runs on every code change before merge.',
  failFinding:
    'Respondent attests pre-merge static security analysis is NOT in place. SOQL injection and other code-level issues commonly slip through without it.',
});
