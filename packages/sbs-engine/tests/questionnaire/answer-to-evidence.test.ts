// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { toQuestionnaireSubmission } from '../../src/questionnaire/answer-to-evidence';
import { makeCportalSkipRule } from '../../src/questionnaire/skip-rules';
import type {
  AnswerSet,
  Question,
  QuestionnaireRegistry,
  Section,
  SkipRule,
} from '../../src/questionnaire/types';

// ---------------------------------------------------------------------------
// Fixtures — minimal registries built per-test so each test owns its own scope.
// ---------------------------------------------------------------------------

const baseSections: readonly Section[] = [
  { id: 'profile', index: 0, title: 'About you', blurb: '' },
  { id: 'ACS', index: 1, title: 'Access Controls', blurb: '' },
  { id: 'CPORTAL', index: 4, title: 'Customer Portals', blurb: '' },
];

function makeRegistry(opts: {
  questions: readonly Question[];
  skipRules?: readonly SkipRule[];
}): QuestionnaireRegistry {
  return {
    version: 'test-1',
    sbsVersion: '0.4.1',
    sections: baseSections,
    questions: opts.questions,
    skipRules: opts.skipRules ?? [],
  };
}

const SUBJECT = 'subject-test-1';

// ---------------------------------------------------------------------------
// Per-Answer-shape mapping
// ---------------------------------------------------------------------------

describe('toQuestionnaireSubmission — answer shape mapping', () => {
  it('maps a boolean answer to questionnaire evidence with the same value', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-ACS-001',
          section: 'ACS',
          controlId: 'SBS-ACS-001',
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
    });
    const answers: AnswerSet = { 'Q-ACS-001': { kind: 'boolean', value: true } };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      {
        source: 'questionnaire',
        question_id: 'Q-ACS-001',
        answer: { kind: 'boolean', value: true },
      },
    ]);
    expect(result.skippedControls).toEqual([]);
    expect(result.idkQuestions).toEqual([]);
  });

  it('maps a choice answer to questionnaire evidence', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-AUTH-001',
          section: 'ACS',
          controlId: 'SBS-AUTH-001',
          text: '',
          allowIdk: true,
          kind: 'choice',
          options: [
            { value: 'mfa_required', label: 'Required for everyone' },
            { value: 'mfa_optional', label: 'Optional' },
          ],
        },
      ],
    });
    const answers: AnswerSet = { 'Q-AUTH-001': { kind: 'choice', value: 'mfa_required' } };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      {
        source: 'questionnaire',
        question_id: 'Q-AUTH-001',
        answer: { kind: 'choice', value: 'mfa_required' },
      },
    ]);
  });

  it('maps a multi_choice answer with the values array preserved', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-DATA-001',
          section: 'ACS',
          controlId: 'SBS-DATA-001',
          text: '',
          allowIdk: true,
          kind: 'multi_choice',
          options: [
            { value: 'pii', label: 'PII' },
            { value: 'phi', label: 'PHI' },
          ],
        },
      ],
    });
    const answers: AnswerSet = {
      'Q-DATA-001': { kind: 'multi_choice', values: ['pii', 'phi'] },
    };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      {
        source: 'questionnaire',
        question_id: 'Q-DATA-001',
        answer: { kind: 'multi_choice', values: ['pii', 'phi'] },
      },
    ]);
  });

  it('maps a numeric_range answer to its bucket value', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-ACS-005',
          section: 'ACS',
          controlId: 'SBS-ACS-005',
          text: '',
          allowIdk: true,
          kind: 'numeric_range',
          options: [
            { value: '0', label: '0' },
            { value: '1-5', label: '1-5' },
            { value: '20+', label: '20+' },
          ],
        },
      ],
    });
    const answers: AnswerSet = { 'Q-ACS-005': { kind: 'numeric_range', value: '1-5' } };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      {
        source: 'questionnaire',
        question_id: 'Q-ACS-005',
        answer: { kind: 'numeric_range', value: '1-5' },
      },
    ]);
  });

  it('maps an "I don\'t know" answer to idk evidence and lists it in idkQuestions', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-ACS-004',
          section: 'ACS',
          controlId: 'SBS-ACS-004',
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
    });
    const answers: AnswerSet = { 'Q-ACS-004': { kind: 'idk' } };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      { source: 'questionnaire', question_id: 'Q-ACS-004', answer: { kind: 'idk' } },
    ]);
    expect(result.idkQuestions).toEqual(['Q-ACS-004']);
  });
});

// ---------------------------------------------------------------------------
// What does NOT become evidence
// ---------------------------------------------------------------------------

describe('toQuestionnaireSubmission — exclusions', () => {
  it('does not emit evidence for free_text answers (profile metadata only)', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-PROFILE-002',
          section: 'profile',
          controlId: null,
          text: '',
          allowIdk: false,
          kind: 'free_text',
        },
      ],
    });
    const answers: AnswerSet = {
      'Q-PROFILE-002': { kind: 'free_text', value: 'Healthcare SaaS' },
    };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([]);
  });

  it('does not emit evidence for questions with no controlId (profile / scope questions)', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-SCOPE-CPORTAL',
          section: 'profile',
          controlId: null,
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
    });
    const answers: AnswerSet = { 'Q-SCOPE-CPORTAL': { kind: 'boolean', value: true } };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([]);
  });

  it('does not emit evidence for unanswered questions', () => {
    const reg = makeRegistry({
      questions: [
        {
          id: 'Q-ACS-001',
          section: 'ACS',
          controlId: 'SBS-ACS-001',
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
    });

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers: {}, registry: reg });

    expect(result.bundle.evidence).toEqual([]);
    expect(result.skippedControls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Skip-rule integration
// ---------------------------------------------------------------------------

describe('toQuestionnaireSubmission — skip rules', () => {
  function cportalRegistry(): QuestionnaireRegistry {
    const cportalQuestionIds = ['Q-CPORTAL-001'] as const;
    return makeRegistry({
      questions: [
        {
          id: 'Q-SCOPE-CPORTAL',
          section: 'profile',
          controlId: null,
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
        {
          id: 'Q-CPORTAL-001',
          section: 'CPORTAL',
          controlId: 'SBS-CPORTAL-001',
          text: '',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
      skipRules: [makeCportalSkipRule(cportalQuestionIds)],
    });
  }

  it('marks CPORTAL controls as skipped when Experience Cloud answer is "no"', () => {
    const reg = cportalRegistry();
    const answers: AnswerSet = {
      'Q-SCOPE-CPORTAL': { kind: 'boolean', value: false },
      // Even if a user answered the CPORTAL question (e.g. before the skip
      // rule fired), it should be ignored when the rule says skip.
      'Q-CPORTAL-001': { kind: 'boolean', value: true },
    };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([]);
    expect(result.skippedControls).toEqual(['SBS-CPORTAL-001']);
  });

  it('does NOT skip CPORTAL controls when Experience Cloud answer is "yes"', () => {
    const reg = cportalRegistry();
    const answers: AnswerSet = {
      'Q-SCOPE-CPORTAL': { kind: 'boolean', value: true },
      'Q-CPORTAL-001': { kind: 'boolean', value: true },
    };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.bundle.evidence).toEqual([
      {
        source: 'questionnaire',
        question_id: 'Q-CPORTAL-001',
        answer: { kind: 'boolean', value: true },
      },
    ]);
    expect(result.skippedControls).toEqual([]);
  });

  it('does NOT skip CPORTAL controls when Experience Cloud answer is "I don\'t know" (defensive)', () => {
    const reg = cportalRegistry();
    const answers: AnswerSet = {
      'Q-SCOPE-CPORTAL': { kind: 'idk' },
      'Q-CPORTAL-001': { kind: 'boolean', value: true },
    };

    const result = toQuestionnaireSubmission({ subjectId: SUBJECT, answers, registry: reg });

    expect(result.skippedControls).toEqual([]);
    expect(result.bundle.evidence).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Bundle metadata
// ---------------------------------------------------------------------------

describe('toQuestionnaireSubmission — bundle metadata', () => {
  it('stamps subject_id and a parseable ISO collected_at', () => {
    const reg = makeRegistry({ questions: [] });

    const result = toQuestionnaireSubmission({
      subjectId: 'subj-42',
      answers: {},
      registry: reg,
    });

    expect(result.bundle.subject_id).toBe('subj-42');
    expect(() => new Date(result.bundle.collected_at).toISOString()).not.toThrow();
    expect(new Date(result.bundle.collected_at).toString()).not.toBe('Invalid Date');
  });
});
