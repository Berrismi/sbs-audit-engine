// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-003: Implement Persistent Apex Application Logging.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CODE-003',
  passFinding:
    'Respondent attests they have an Apex logging framework that writes events to a permanent destination (not just the temporary debug log).',
  failFinding:
    'Respondent attests they do NOT have a persistent Apex logging framework. Without it, security-relevant application events are unrecoverable.',
});
