// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-003: Add Criticality Classification of OAuth-Enabled Connected Apps.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-OAUTH-003',
  passFinding:
    'Respondent attests they maintain a list of every OAuth-enabled Connected App with a criticality rating reflecting integration importance and data sensitivity.',
  failFinding:
    'Respondent attests they do NOT maintain a criticality classification for OAuth-enabled Connected Apps. Without it, vendor-risk reviews cannot be prioritized.',
});
