// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-001: Enable Event Monitoring Log Storage.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-MON-001',
  passFinding:
    "Respondent attests Event Monitoring log storage is enabled for all event types required by the organization's security monitoring and compliance policies.",
  failFinding:
    'Respondent attests Event Monitoring log storage is not enabled for required event types. Salesforce logs cannot be retroactively generated — telemetry is permanently lost.',
});
