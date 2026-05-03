// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-006: Configure Salesforce CLI Connected App with Token Expiration Policies.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-006',
  passFinding:
    'Respondent attests the Salesforce CLI Connected App is configured with refresh tokens expiring within 90 days and access tokens within 15 minutes.',
  failFinding:
    'Respondent attests the Salesforce CLI Connected App is NOT configured with strict token expiration policies. Long-lived CLI credentials become silent attack vectors when developer machines are compromised.',
});
