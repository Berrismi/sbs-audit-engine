// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-002: Restrict Guest User Record Access.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CPORTAL-002',
  passFinding:
    'Respondent attests guest users are limited to login and signup pages only — no access to business data queries or Apex methods that touch data.',
  failFinding:
    'Respondent attests guest users are NOT properly restricted to login/signup-only access. Guest user breaches are the most public class of Salesforce data leaks.',
});
