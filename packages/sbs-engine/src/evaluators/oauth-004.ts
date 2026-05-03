// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-OAUTH-004: Due Diligence Documentation for High-Risk Connected App Vendors.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-OAUTH-004',
  passFinding:
    'Respondent attests they keep security documentation on file for every high-risk Connected App vendor and explicitly note when documentation is missing.',
  failFinding:
    'Respondent attests they do NOT maintain security documentation for high-risk Connected App vendors. Vendor due diligence gaps are SOC 2 and ISO supplier-management findings waiting to happen.',
});
