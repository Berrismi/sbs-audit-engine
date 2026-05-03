// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-003: Monitor and Alert on Unauthorized Modifications to High-Risk Metadata.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-003',
  passFinding:
    'Respondent attests they receive alerts whenever high-risk metadata is changed in production by a user other than the designated deployment identity.',
  failFinding:
    'Respondent attests they do NOT receive alerts on unauthorized high-risk metadata changes in production. Without alerts, unauthorized changes go undetected.',
});
