// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Drives `runQuestionnaire` with a stubbed prompt adapter. Each test scripts
// a sequence of answers the adapter returns in order, then asserts the
// resulting AnswerSet matches what the engine's answer-to-evidence mapper
// expects.

import { describe, expect, it } from 'vitest';
import { runQuestionnaire } from '../../src/lib/questionnaire-runner';
import type {
  AnswerSet,
  Question,
  QuestionnaireRegistry,
  Section,
  SkipRule,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';
import type { PromptAdapter } from '../../src/lib/questionnaire-runner';

function makeRegistry(opts: {
  questions: readonly Question[];
  skipRules?: readonly SkipRule[];
  sections?: readonly Section[];
}): QuestionnaireRegistry {
  return {
    version: 'test-1',
    sbsVersion: '0.4.1',
    sections: opts.sections ?? [
      { id: 'profile', index: 0, title: 'About you', blurb: '' },
      { id: 'ACS', index: 1, title: 'Access controls', blurb: '' },
      { id: 'CPORTAL', index: 4, title: 'Customer portals', blurb: '' },
    ],
    questions: opts.questions,
    skipRules: opts.skipRules ?? [],
  };
}

/** Build a prompt adapter that returns the given values one per call. */
function makeStubAdapter(scripted: {
  select?: readonly string[];
  checkbox?: readonly (readonly string[])[];
  input?: readonly string[];
}): PromptAdapter {
  const selectQ = [...(scripted.select ?? [])];
  const checkboxQ = [...(scripted.checkbox ?? [])];
  const inputQ = [...(scripted.input ?? [])];
  return {
    select: async () => {
      const next = selectQ.shift();
      if (next === undefined) throw new Error('stub.select called more times than scripted');
      return next;
    },
    checkbox: async () => {
      const next = checkboxQ.shift();
      if (next === undefined) throw new Error('stub.checkbox called more times than scripted');
      return next;
    },
    input: async () => {
      const next = inputQ.shift();
      if (next === undefined) throw new Error('stub.input called more times than scripted');
      return next;
    },
  };
}

describe('runQuestionnaire — answer collection by question kind', () => {
  it('collects boolean Yes / No answers', async () => {
    const registry = makeRegistry({
      questions: [
        {
          id: 'Q-ACS-001',
          section: 'ACS',
          controlId: 'SBS-ACS-001',
          text: 'is permission model written?',
          allowIdk: true,
          kind: 'boolean',
        },
        {
          id: 'Q-ACS-002',
          section: 'ACS',
          controlId: 'SBS-ACS-002',
          text: 'is API justified?',
          allowIdk: true,
          kind: 'boolean',
        },
      ],
    });
    const prompts = makeStubAdapter({ select: ['yes', 'no'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({
      'Q-ACS-001': { kind: 'boolean', value: true },
      'Q-ACS-002': { kind: 'boolean', value: false },
    });
  });

  it('translates the IDK pseudo-option into idk-kind answers', async () => {
    const registry = makeRegistry({
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
    const prompts = makeStubAdapter({ select: ['__hm_idk__'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({ 'Q-ACS-001': { kind: 'idk' } });
  });

  it('collects choice answers', async () => {
    const registry = makeRegistry({
      questions: [
        {
          id: 'Q-PROFILE-001',
          section: 'profile',
          controlId: null,
          text: 'company size?',
          allowIdk: false,
          kind: 'choice',
          options: [
            { value: 'smb', label: 'SMB' },
            { value: 'enterprise', label: 'Enterprise' },
          ],
        },
      ],
    });
    const prompts = makeStubAdapter({ select: ['enterprise'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({
      'Q-PROFILE-001': { kind: 'choice', value: 'enterprise' },
    });
  });

  it('collects multi_choice answers', async () => {
    const registry = makeRegistry({
      questions: [
        {
          id: 'Q-PROFILE-003',
          section: 'profile',
          controlId: null,
          text: 'regulations?',
          allowIdk: false,
          kind: 'multi_choice',
          options: [
            { value: 'hipaa', label: 'HIPAA' },
            { value: 'soc2', label: 'SOC 2' },
          ],
        },
      ],
    });
    const prompts = makeStubAdapter({ checkbox: [['hipaa', 'soc2']] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({
      'Q-PROFILE-003': { kind: 'multi_choice', values: ['hipaa', 'soc2'] },
    });
  });

  it('collects free_text answers', async () => {
    const registry = makeRegistry({
      questions: [
        {
          id: 'Q-PROFILE-002',
          section: 'profile',
          controlId: null,
          text: 'industry?',
          allowIdk: false,
          kind: 'free_text',
        },
      ],
    });
    const prompts = makeStubAdapter({ input: ['Healthcare SaaS'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({
      'Q-PROFILE-002': { kind: 'free_text', value: 'Healthcare SaaS' },
    });
  });
});

describe('runQuestionnaire — skip-rule integration', () => {
  it('omits questions whose skip rule fires after a previous answer', async () => {
    const cportalRule: SkipRule = {
      id: 'cportal-out-of-scope',
      appliesTo: ['Q-CPORTAL-001'],
      reason: 'no portal',
      naExplanation: 'You said you do not run Experience Cloud, so portal controls do not apply.',
      decide: (a) => {
        const v = a['Q-SCOPE-CPORTAL'];
        return v?.kind === 'boolean' && v.value === false ? 'skip_na' : 'show';
      },
    };
    const registry = makeRegistry({
      questions: [
        {
          id: 'Q-SCOPE-CPORTAL',
          section: 'profile',
          controlId: null,
          text: 'use experience cloud?',
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
      skipRules: [cportalRule],
    });
    // Only the scope question is asked — Q-CPORTAL-001 is omitted because the
    // skip rule fires once Q-SCOPE-CPORTAL=no is recorded.
    const prompts = makeStubAdapter({ select: ['no'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(Object.keys(answers)).toEqual(['Q-SCOPE-CPORTAL']);
    expect(answers['Q-SCOPE-CPORTAL']).toEqual({ kind: 'boolean', value: false });
  });

  it('asks downstream questions when the scope answer keeps them in scope', async () => {
    const cportalRule: SkipRule = {
      id: 'cportal-out-of-scope',
      appliesTo: ['Q-CPORTAL-001'],
      reason: 'no portal',
      naExplanation: 'You said you do not run Experience Cloud, so portal controls do not apply.',
      decide: (a) => {
        const v = a['Q-SCOPE-CPORTAL'];
        return v?.kind === 'boolean' && v.value === false ? 'skip_na' : 'show';
      },
    };
    const registry = makeRegistry({
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
      skipRules: [cportalRule],
    });
    const prompts = makeStubAdapter({ select: ['yes', 'yes'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(answers).toEqual<AnswerSet>({
      'Q-SCOPE-CPORTAL': { kind: 'boolean', value: true },
      'Q-CPORTAL-001': { kind: 'boolean', value: true },
    });
  });
});

describe('runQuestionnaire — section ordering and chrome', () => {
  it('skips disclaimer and submit chrome sections', async () => {
    const registry = makeRegistry({
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
      sections: [
        { id: 'ACS', index: 1, title: 'Access controls', blurb: '' },
        { id: 'disclaimer', index: 13, title: 'Disclaimer', blurb: '' },
        { id: 'submit', index: 14, title: 'Get your report', blurb: '' },
      ],
    });
    const prompts = makeStubAdapter({ select: ['yes'] });

    const answers = await runQuestionnaire({ registry, prompts, log: () => {} });

    expect(Object.keys(answers)).toEqual(['Q-ACS-001']);
  });
});
