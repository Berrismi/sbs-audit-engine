// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004: Documented Justification for All Super Admin–Equivalent Users.
//
// Reference evaluator. The 41 other Phase 3 evaluators follow this shape.
// Pure: same input → same output. Never throws. Degrades to inconclusive
// when no relevant evidence is present.

import type { Evaluator, Evidence } from '../types.ts';

const QUESTION_ID = 'Q-ACS-004';
const JUSTIFICATION_FIELD = 'JustificationDoc__c';

export const evaluate: Evaluator = ({ evidence }) => {
  // SOQL evidence wins when present — it's the highest-confidence source.
  const soql = evidence.find(isAcs004SoqlEvidence);
  if (soql) {
    return evaluateFromSoql(soql);
  }

  const questionnaire = evidence.find(isAcs004QuestionnaireEvidence);
  if (questionnaire) {
    return evaluateFromQuestionnaire(questionnaire);
  }

  return {
    status: 'inconclusive',
    confidence: 'low',
    evidence_used: [],
    findings: [
      'No evidence available to evaluate Super Admin-equivalent user documentation. ' +
        'Run a consultant scan or complete the questionnaire to score this control.',
    ],
  };
};

function isAcs004SoqlEvidence(e: Evidence): e is Extract<Evidence, { source: 'soql' }> {
  return e.source === 'soql';
}

function isAcs004QuestionnaireEvidence(
  e: Evidence,
): e is Extract<Evidence, { source: 'questionnaire' }> {
  return e.source === 'questionnaire' && e.question_id === QUESTION_ID;
}

function evaluateFromSoql(e: Extract<Evidence, { source: 'soql' }>): ReturnType<Evaluator> {
  if (e.rows.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No users hold all of View All Data, Modify All Data, and Manage Users permissions.',
      ],
    };
  }

  const undocumented = e.rows.filter((row) => {
    const value = row[JUSTIFICATION_FIELD];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (undocumented.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        `${e.rows.length} super-admin-equivalent user(s) found; all have documented justification.`,
      ],
    };
  }

  const usernames = undocumented
    .map((row) => row['Username'])
    .filter((u): u is string => typeof u === 'string');

  return {
    status: 'fail',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: usernames.map(
      (username) =>
        `Super-admin-equivalent user ${username} has no justification documented in ${JUSTIFICATION_FIELD}.`,
    ),
  };
}

function evaluateFromQuestionnaire(
  e: Extract<Evidence, { source: 'questionnaire' }>,
): ReturnType<Evaluator> {
  const { answer } = e;

  if (answer.kind === 'idk') {
    return {
      status: 'inconclusive',
      confidence: 'low',
      evidence_used: ['questionnaire'],
      findings: ['Respondent answered "I don\'t know." An evidence-based scan would resolve this.'],
    };
  }

  if (answer.kind === 'boolean') {
    return answer.value
      ? {
          status: 'pass',
          confidence: 'low',
          evidence_used: ['questionnaire'],
          findings: [
            'Respondent attests that all super-admin-equivalent users have documented justification.',
          ],
        }
      : {
          status: 'fail',
          confidence: 'low',
          evidence_used: ['questionnaire'],
          findings: [
            'Respondent attests they do NOT have documented justification for super-admin-equivalent users.',
          ],
        };
  }

  // Future questionnaire shapes (choice, multi_choice, numeric_range) aren't
  // expected for Q-ACS-004; treat as inconclusive rather than crashing.
  return {
    status: 'inconclusive',
    confidence: 'low',
    evidence_used: ['questionnaire'],
    findings: ['Unexpected answer shape for Q-ACS-004; cannot score.'],
  };
}
