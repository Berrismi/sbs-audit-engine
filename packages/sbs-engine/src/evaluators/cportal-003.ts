// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-003: Inventory Portal-Exposed Apex Classes and Flows.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CPORTAL-003',
  passFinding:
    'Respondent attests an authoritative inventory of portal-exposed Apex classes and Autolaunched Flows is maintained, including documented profile/permission-set access for each component.',
  failFinding:
    'Respondent attests no inventory of portal-exposed Apex classes and Flows exists. External attack surface cannot be assessed; security testing has no authoritative scope.',
});
