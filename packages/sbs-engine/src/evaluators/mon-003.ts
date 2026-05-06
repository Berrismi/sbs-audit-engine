// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-003: Monitor for Suspicious Logins.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-MON-003',
  passFinding:
    'Respondent attests a continuous analytics solution monitors all human and integration logins for anomalous patterns (impossible travel, suspicious networks, off-hours, brute-force precursors), with documented investigation procedures.',
  failFinding:
    'Respondent attests no continuous suspicious-login monitoring exists. Compromised credentials provide an undetected foothold; attacker dwell time grows until the breach is discovered another way.',
});
