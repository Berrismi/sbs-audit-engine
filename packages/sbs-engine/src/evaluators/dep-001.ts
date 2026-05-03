// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-001: Require a Designated Deployment Identity for Metadata Changes.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-001',
  passFinding:
    'Respondent attests all automated metadata deployments go through a single dedicated identity, not individual admin accounts.',
  failFinding:
    'Respondent attests deployments are spread across individual admin accounts. A designated deployment identity is needed for clean change attribution.',
});
