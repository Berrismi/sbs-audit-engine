// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-011: Enforce Governance of Access and Authorization Changes.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-011',
  passFinding:
    'Respondent attests every access change goes through a documented approval process with an audit trail.',
  failFinding:
    'Respondent attests access changes do NOT go through a documented approval process with an audit trail. Without governance, the permission model drifts silently.',
});
