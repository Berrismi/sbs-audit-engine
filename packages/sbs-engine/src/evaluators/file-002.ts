// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-FILE-002: Require Passwords on Public Content Links for Sensitive Content.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-FILE-002',
  passFinding:
    'Respondent attests Public Content links to sensitive content are password-protected, with the password communicated to recipients through a separate secure channel.',
  failFinding:
    'Respondent attests sensitive Public Content links are not password-protected. Anyone obtaining the link — through interception, accidental sharing, or harvesting — can immediately access the data.',
});
