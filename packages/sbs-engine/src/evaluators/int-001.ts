// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-INT-001: Enforce Governance of Browser Extensions Accessing Salesforce.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-INT-001',
  passFinding:
    'Respondent attests their IT team controls which browser extensions can interact with Salesforce.',
  failFinding:
    'Respondent attests browser extensions interacting with Salesforce are NOT centrally governed. User-installed extensions can read every page and exfiltrate data silently.',
});
