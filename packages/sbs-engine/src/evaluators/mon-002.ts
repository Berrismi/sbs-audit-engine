// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-002: Retaining Event Logs.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-MON-002',
  passFinding:
    "Respondent attests event logs are retained to meet the organization's required retention period — exported to external systems where Salesforce native retention falls short, with the Delete Event Monitoring Data permission tightly controlled.",
  failFinding:
    "Respondent attests event log retention is not aligned with the organization's required retention period. Forensic data may be unavailable for slow-burn incident reconstruction.",
});
