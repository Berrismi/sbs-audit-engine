// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-007: Maintain Inventory of Non-Human Identities.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-ACS-007',
  passFinding:
    'Respondent attests they maintain a current inventory of non-human accounts (integration users, automation users, bots, API-only accounts).',
  failFinding:
    'Respondent attests they do NOT maintain a current inventory of non-human accounts. Without an inventory, no other NHI control can be enforced.',
});
