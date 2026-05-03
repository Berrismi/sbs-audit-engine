// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-SECCONF-002: Review and Remediate Salesforce Health Check Deviations.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-SECCONF-002',
  passFinding:
    'Respondent attests they regularly review Health Check results and either remediate deviations or document them as approved exceptions.',
  failFinding: 'Respondent attests Health Check results are NOT regularly reviewed and acted on.',
});
