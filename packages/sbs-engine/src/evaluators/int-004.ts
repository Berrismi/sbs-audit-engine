// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-004: Retain API Total Usage Event Logs for 30 Days.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-INT-004',
  passFinding:
    'Respondent attests at least 30 days of `ApiTotalUsage` event logs are retained (in Salesforce or exported elsewhere).',
  failFinding:
    'Respondent attests they retain less than 30 days of `ApiTotalUsage` event logs. Without sufficient retention, anomalous API behavior is invisible after the fact.',
});
