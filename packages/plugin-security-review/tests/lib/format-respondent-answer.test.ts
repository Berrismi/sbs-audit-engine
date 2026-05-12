// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Unit-tests for the per-answer formatter consumed by both report renderers.
// Coverage includes every Answer.kind variant + the per-Question.kind lookup
// paths that convert raw option values into their display labels.

import { describe, expect, it } from 'vitest';
import {
  formatAnswer,
  formatRespondentAnswers,
} from '../../src/lib/format-respondent-answer';
import type {
  Answer,
  Question,
  QuestionnaireRegistry,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

const boolQ: Question = {
  id: 'Q-B',
  section: 'profile',
  controlId: 'SBS-X',
  text: 'is it true?',
  allowIdk: true,
  kind: 'boolean',
};
const choiceQ: Question = {
  id: 'Q-C',
  section: 'profile',
  controlId: 'SBS-X',
  text: 'pick one?',
  allowIdk: true,
  kind: 'choice',
  options: [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ],
};
const multiQ: Question = {
  id: 'Q-M',
  section: 'profile',
  controlId: 'SBS-X',
  text: 'pick many?',
  allowIdk: true,
  kind: 'multi_choice',
  options: [
    { value: 'hipaa', label: 'HIPAA (US healthcare)' },
    { value: 'soc2', label: 'SOC 2' },
  ],
};
const rangeQ: Question = {
  id: 'Q-R',
  section: 'profile',
  controlId: 'SBS-X',
  text: 'how big?',
  allowIdk: true,
  kind: 'numeric_range',
  options: [
    { value: 'small', label: 'Small (<100)' },
    { value: 'large', label: 'Large (1000+)' },
  ],
};
const textQ: Question = {
  id: 'Q-T',
  section: 'profile',
  controlId: 'SBS-X',
  text: 'industry?',
  allowIdk: true,
  kind: 'free_text',
};

describe('formatAnswer — per-kind label resolution', () => {
  it('formats idk as "I don\'t know"', () => {
    expect(formatAnswer({ kind: 'idk' }, boolQ)).toBe("I don't know");
  });

  it('formats boolean Yes / No (not raw true/false)', () => {
    expect(formatAnswer({ kind: 'boolean', value: true }, boolQ)).toBe('Yes');
    expect(formatAnswer({ kind: 'boolean', value: false }, boolQ)).toBe('No');
  });

  it('formats free_text verbatim; trims-to-empty becomes "(empty)"', () => {
    expect(formatAnswer({ kind: 'free_text', value: 'Healthcare SaaS' }, textQ)).toBe(
      'Healthcare SaaS',
    );
    expect(formatAnswer({ kind: 'free_text', value: '   ' }, textQ)).toBe('(empty)');
    expect(formatAnswer({ kind: 'free_text', value: '' }, textQ)).toBe('(empty)');
  });

  it('formats choice using the option label when one matches', () => {
    expect(formatAnswer({ kind: 'choice', value: 'a' }, choiceQ)).toBe('Option A');
  });

  it('formats choice with raw value when the option does not exist on the question', () => {
    // E.g., question changed wording but answer file references the old value.
    expect(formatAnswer({ kind: 'choice', value: 'unknown' }, choiceQ)).toBe('unknown');
  });

  it('formats choice with raw value when the question kind disagrees with the answer kind', () => {
    // Defensive: if a saved file's answer kind no longer matches the question's
    // current kind (rare drift), fall back to the raw value rather than
    // throwing.
    expect(formatAnswer({ kind: 'choice', value: 'a' }, boolQ as unknown as Question)).toBe('a');
  });

  it('formats numeric_range using the option label', () => {
    expect(formatAnswer({ kind: 'numeric_range', value: 'small' }, rangeQ)).toBe('Small (<100)');
  });

  it('formats numeric_range with raw value when option not found', () => {
    expect(formatAnswer({ kind: 'numeric_range', value: 'huge' }, rangeQ)).toBe('huge');
  });

  it('formats multi_choice as comma-joined option labels', () => {
    expect(formatAnswer({ kind: 'multi_choice', values: ['hipaa', 'soc2'] }, multiQ)).toBe(
      'HIPAA (US healthcare), SOC 2',
    );
  });

  it('formats multi_choice with raw values when options not found', () => {
    expect(formatAnswer({ kind: 'multi_choice', values: ['gdpr'] }, multiQ)).toBe('gdpr');
  });

  it('formats empty multi_choice as "(none selected)"', () => {
    expect(formatAnswer({ kind: 'multi_choice', values: [] }, multiQ)).toBe('(none selected)');
  });

  it('formats multi_choice with raw values when question kind disagrees', () => {
    // Defensive: mismatched kind falls back to comma-joined raw values.
    expect(
      formatAnswer({ kind: 'multi_choice', values: ['a', 'b'] }, boolQ as unknown as Question),
    ).toBe('a, b');
  });
});

describe('formatRespondentAnswers — lookup by controlId', () => {
  const registry: QuestionnaireRegistry = {
    version: 'test-1',
    sbsVersion: '0.4.1',
    sections: [{ id: 'profile', index: 0, title: 'About', blurb: '' }],
    questions: [
      {
        id: 'Q-1',
        section: 'profile',
        controlId: 'SBS-CODE-001',
        text: 'first question',
        allowIdk: true,
        kind: 'boolean',
      },
      {
        id: 'Q-2',
        section: 'profile',
        controlId: 'SBS-CODE-001',
        text: 'second question',
        allowIdk: true,
        kind: 'boolean',
      },
      {
        id: 'Q-3',
        section: 'profile',
        controlId: 'SBS-OTHER',
        text: 'other',
        allowIdk: true,
        kind: 'boolean',
      },
    ],
    skipRules: [],
  };

  it('returns one entry per question that maps to the given controlId AND has an answer', () => {
    const out = formatRespondentAnswers(
      'SBS-CODE-001',
      {
        'Q-1': { kind: 'boolean', value: true },
        'Q-2': { kind: 'idk' },
        'Q-3': { kind: 'boolean', value: false },
      },
      registry,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ questionText: 'first question', formattedAnswer: 'Yes' });
    expect(out[1]).toEqual({ questionText: 'second question', formattedAnswer: "I don't know" });
  });

  it('omits questions that have no recorded answer', () => {
    const out = formatRespondentAnswers(
      'SBS-CODE-001',
      // Only Q-1 answered; Q-2 has no answer
      { 'Q-1': { kind: 'boolean', value: false } },
      registry,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.questionText).toBe('first question');
  });

  it('returns empty array when no questions match the controlId', () => {
    const out = formatRespondentAnswers(
      'SBS-NOT-IN-REGISTRY',
      { 'Q-1': { kind: 'boolean', value: true } },
      registry,
    );
    expect(out).toHaveLength(0);
  });

  it('returns empty array when matching questions exist but no answers were recorded', () => {
    const out = formatRespondentAnswers('SBS-CODE-001', {} as Record<string, Answer>, registry);
    expect(out).toHaveLength(0);
  });
});
