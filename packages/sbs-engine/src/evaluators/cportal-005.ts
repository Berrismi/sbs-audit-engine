// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-005: Conduct Penetration Testing for Portal Security.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-CPORTAL-005',
  passFinding:
    'Respondent attests portal penetration testing was conducted before initial go-live and is performed on a defined cadence covering portal-exposed Apex classes and Flows.',
  failFinding:
    'Respondent attests portal penetration testing has not been performed (or is not on a defined cadence). Configuration audits alone cannot validate runtime authorization behavior.',
});
