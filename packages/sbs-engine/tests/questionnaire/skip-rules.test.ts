// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { evaluateSkip, makeCportalSkipRule } from '../../src/questionnaire/skip-rules';
import type { AnswerSet, BooleanQuestion } from '../../src/questionnaire/types';

const cportalQuestion: BooleanQuestion = {
  id: 'Q-CPORTAL-001',
  section: 'CPORTAL',
  controlId: 'SBS-CPORTAL-001',
  text: '',
  allowIdk: true,
  kind: 'boolean',
};

const unrelatedQuestion: BooleanQuestion = {
  id: 'Q-ACS-001',
  section: 'ACS',
  controlId: 'SBS-ACS-001',
  text: '',
  allowIdk: true,
  kind: 'boolean',
};

const cportalRule = makeCportalSkipRule(['Q-CPORTAL-001']);

describe('makeCportalSkipRule', () => {
  it('skips CPORTAL questions when scope answer is "no"', () => {
    const answers: AnswerSet = { 'Q-SCOPE-CPORTAL': { kind: 'boolean', value: false } };
    expect(evaluateSkip(cportalQuestion, answers, [cportalRule])).toBe('skip_na');
  });

  it('shows CPORTAL questions when scope answer is "yes"', () => {
    const answers: AnswerSet = { 'Q-SCOPE-CPORTAL': { kind: 'boolean', value: true } };
    expect(evaluateSkip(cportalQuestion, answers, [cportalRule])).toBe('show');
  });

  it('shows CPORTAL questions when scope answer is "I don\'t know" (defensive)', () => {
    const answers: AnswerSet = { 'Q-SCOPE-CPORTAL': { kind: 'idk' } };
    expect(evaluateSkip(cportalQuestion, answers, [cportalRule])).toBe('show');
  });

  it('shows CPORTAL questions when scope answer is missing', () => {
    expect(evaluateSkip(cportalQuestion, {}, [cportalRule])).toBe('show');
  });

  it('does not affect questions outside its appliesTo set', () => {
    const answers: AnswerSet = { 'Q-SCOPE-CPORTAL': { kind: 'boolean', value: false } };
    expect(evaluateSkip(unrelatedQuestion, answers, [cportalRule])).toBe('show');
  });
});

describe('evaluateSkip', () => {
  it('returns "show" when no rules apply', () => {
    expect(evaluateSkip(unrelatedQuestion, {}, [])).toBe('show');
  });

  it('returns the first non-show decision when multiple rules match', () => {
    const ruleSkipNa = {
      id: 'first',
      appliesTo: ['Q-ACS-001'],
      reason: 'first',
      naExplanation: 'first',
      decide: () => 'skip_na' as const,
    };
    const ruleSkipInapplicable = {
      id: 'second',
      appliesTo: ['Q-ACS-001'],
      reason: 'second',
      naExplanation: 'second',
      decide: () => 'skip_inapplicable' as const,
    };
    expect(evaluateSkip(unrelatedQuestion, {}, [ruleSkipNa, ruleSkipInapplicable])).toBe('skip_na');
  });
});

describe('makeCportalSkipRule shape', () => {
  it('has a stable id, customer-facing naExplanation, and applies to the given questions', () => {
    const rule = makeCportalSkipRule(['Q-CPORTAL-001', 'Q-CPORTAL-002']);
    expect(rule.id).toBeTruthy();
    expect(rule.naExplanation).toMatch(/Experience Cloud|customer.portal/i);
    const wordCount = rule.naExplanation.trim().split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeGreaterThanOrEqual(15);
    expect(wordCount).toBeLessThanOrEqual(35);
    expect(rule.appliesTo).toEqual(['Q-CPORTAL-001', 'Q-CPORTAL-002']);
  });
});
