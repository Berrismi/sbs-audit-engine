// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DEP-004: Source-repository branch protection + CI/CD controls.
//
// Note: upstream markdown for this control is a placeholder at v0.4.1; the
// title is not extractable. Question wording mirrors the questionnaire's
// caveat — assertion is about repo-level branch protection + CI/CD.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DEP-004',
  passFinding:
    'Respondent attests they have branch protection and CI/CD controls on their Salesforce metadata source repository.',
  failFinding:
    'Respondent attests they do NOT have branch protection or CI/CD controls on their Salesforce source repository. Without them, anyone with repo access can push directly to production.',
});
