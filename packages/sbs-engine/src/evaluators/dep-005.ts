// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-005: Implement Secret Scanning for Salesforce Source Repositories.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-005',
  passFinding:
    'Respondent attests they scan Salesforce source repositories for accidentally-committed secrets (passwords, API keys, tokens).',
  failFinding:
    'Respondent attests they do NOT scan source repositories for committed secrets. Leaked Salesforce credentials are a leading source of supply-chain breaches.',
});
