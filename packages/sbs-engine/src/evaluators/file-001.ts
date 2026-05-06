// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-FILE-001: Require Expiry Dates on Public Content Links.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-FILE-001',
  passFinding:
    'Respondent attests Public Content links carry expiry dates appropriate to the sensitivity of the shared content, governed by an organizational lifetime policy.',
  failFinding:
    'Respondent attests Public Content links lack appropriate expiry dates. Permanent links extend exposure indefinitely if leaked, intercepted, or accidentally re-shared.',
});
