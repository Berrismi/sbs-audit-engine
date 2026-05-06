// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-004: Prevent Parameter-Based Record Access in Portal-Exposed Flows.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CPORTAL-004',
  passFinding:
    'Respondent attests portal-exposed Autolaunched Flows derive record access from authenticated user context (e.g., $User.ContactId), not from user-supplied input variables.',
  failFinding:
    'Respondent attests portal-exposed Flows accept user-supplied input variables that determine which records are accessed. This is an IDOR vulnerability — Autolaunched Flows run in system context by default.',
});
