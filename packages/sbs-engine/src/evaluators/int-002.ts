// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-002: Inventory and Justification of Remote Site Settings.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-INT-002',
  passFinding:
    'Respondent attests they maintain an up-to-date inventory of every Remote Site Setting with documented justification for each.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory + justification list for Remote Site Settings. Stale Remote Site Settings are a canonical SSRF / data-egress vector.',
});
