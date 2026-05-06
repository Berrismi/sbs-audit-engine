// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-004: Monitor for Suspicious API Activity.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-MON-004',
  passFinding:
    'Respondent attests API activity is continuously baselined and analyzed for anomalies (mass exfiltration, unexpected object access, sudden write/delete shifts, suspicious origins), with high-priority response procedures.',
  failFinding:
    'Respondent attests no continuous API anomaly monitoring exists. Post-authentication attacks via stolen tokens or compromised integrations operate without detection.',
});
