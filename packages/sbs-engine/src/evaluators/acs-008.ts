// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-008: Restrict Broad Privileges for Non-Human Identities.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-008',
  passFinding:
    'Respondent attests their non-human accounts are limited to only the permissions they actually need.',
  failFinding:
    'Respondent attests their non-human accounts have broader permissions than they need. Over-privileged service accounts are a leading source of breach blast-radius.',
});
