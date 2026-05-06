// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-FILE-003: Periodic Review and Cleanup of Public Content Links.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-FILE-003',
  passFinding:
    'Respondent attests active Public Content links are reviewed on a defined cadence (e.g., quarterly) with documented remediation or deletion of links that no longer comply with current policy.',
  failFinding:
    'Respondent attests no recurring review of active Public Content links exists. Legacy and accidentally-shared links accumulate as undetected, persistent exposure.',
});
