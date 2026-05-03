// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-001: Require Formal Installation of Connected Apps.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-OAUTH-001',
  passFinding:
    'Respondent attests every Connected App is formally installed by an admin, never authorized ad-hoc by individual users.',
  failFinding:
    'Respondent attests at least some Connected Apps are authorized ad-hoc by individual users rather than formally installed. Ad-hoc OAuth grants bypass admin oversight.',
});
