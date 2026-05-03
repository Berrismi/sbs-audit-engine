// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-002: Govern and Document All Users Permitted to Bypass Single Sign-On.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-AUTH-002',
  passFinding:
    'Respondent attests every user permitted to bypass single sign-on has a documented business reason on file.',
  failFinding:
    'Respondent attests there are users permitted to bypass single sign-on without documented business reasons. SSO-bypass accounts are the canonical break-glass attack target.',
});
