// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-001: Implement Mechanisms to Detect Regulated Data in Long Text Area Fields.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DATA-001',
  passFinding:
    'Respondent attests they have a mechanism to scan Long Text Area fields for regulated data (PII, PHI, etc.) on an ongoing basis.',
  failFinding:
    'Respondent attests they do NOT have a mechanism to detect regulated data in Long Text Area fields. Free-text fields are a common, hard-to-find regulated-data hiding spot.',
});
