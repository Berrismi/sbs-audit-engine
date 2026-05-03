// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-004: Require Field History Tracking for Sensitive Fields.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DATA-004',
  passFinding:
    'Respondent attests every field they have identified as sensitive has Field History Tracking enabled.',
  failFinding:
    'Respondent attests at least one sensitive field is NOT covered by Field History Tracking. Without it, unauthorized changes go undetected.',
});
