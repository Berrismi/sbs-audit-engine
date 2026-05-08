// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Interactive TUI runner for the questionnaire. Walks the operator through
// every question in the bundled registry (skipped questions auto-omitted),
// and returns the resulting AnswerSet. Pure orchestration over @inquirer/*
// primitives — no IO outside what the prompt libraries do, so this is
// straightforward to unit-test by injecting a stubbed `prompts` adapter.

import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import select from '@inquirer/select';
import {
  GROUP_TITLES,
  REGISTRY,
  evaluateSkip,
  type Answer,
  type AnswerSet,
  type Question,
  type QuestionnaireRegistry,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

const IDK_VALUE = '__hm_idk__';

/**
 * Adapter the runner uses for actual prompts. Defaults to the real @inquirer
 * primitives; tests pass a stub.
 */
export interface PromptAdapter {
  select: (args: {
    message: string;
    choices: readonly { value: string; name: string }[];
    description?: string;
  }) => Promise<string>;
  checkbox: (args: {
    message: string;
    choices: readonly { value: string; name: string }[];
    description?: string;
  }) => Promise<readonly string[]>;
  input: (args: { message: string; description?: string }) => Promise<string>;
}

/* c8 ignore start — defaultAdapter delegates to real @inquirer prompts which
   require a TTY; untestable in unit tests. Tests inject a stub adapter. */
const defaultAdapter: PromptAdapter = {
  select: (args) => select(args),
  checkbox: (args) => checkbox(args),
  input: (args) => input(args),
};
/* c8 ignore stop */

export interface RunQuestionnaireOptions {
  /** Override the bundled engine registry (tests). */
  registry?: QuestionnaireRegistry;
  /** Override the prompt adapter (tests). */
  prompts?: PromptAdapter;
  /** Where to write status lines. Defaults to console.log. */
  log?: (line: string) => void;
}

/**
 * Walk the questionnaire interactively. Returns the operator's answers keyed
 * by question id. Side-effects: writes section headers and progress to `log`.
 */
export async function runQuestionnaire(opts: RunQuestionnaireOptions = {}): Promise<AnswerSet> {
  const registry = opts.registry ?? REGISTRY;
  const prompts = opts.prompts ?? defaultAdapter;
  const log = opts.log ?? ((line: string) => console.log(line));

  const answers: AnswerSet = {};

  // Sections in display order. Skip the non-question chrome sections.
  const sections = [...registry.sections]
    .sort((a, b) => a.index - b.index)
    .filter((s) => s.id !== 'disclaimer' && s.id !== 'submit');

  // Total scored question count for the progress counter — re-computed each
  // time a section starts so skipped questions don't inflate the denominator.
  let asked = 0;

  for (const section of sections) {
    const sectionQuestions = registry.questions.filter((q) => q.section === section.id);
    if (sectionQuestions.length === 0) continue;

    log('');
    log(`── Section ${section.index} · ${section.title} ──`);
    if (section.blurb) log(section.blurb);

    let activeGroup: string | undefined = undefined;

    for (const q of sectionQuestions) {
      // Re-evaluate every iteration: a freshly-supplied answer (e.g. the
      // CPORTAL scope question) can change which downstream questions are
      // visible.
      const decision = evaluateSkip(q, answers, registry.skipRules);
      if (decision !== 'show') continue;

      if (q.groupId && q.groupId !== activeGroup) {
        const title = GROUP_TITLES[q.groupId] ?? q.groupId;
        log('');
        log(`  ${title}`);
        activeGroup = q.groupId;
      } else if (!q.groupId) {
        activeGroup = undefined;
      }

      asked += 1;
      const counter = q.controlId ? `(${q.controlId})` : '(profile)';
      const message = `${counter} ${q.text}`;
      answers[q.id] = await promptOne(prompts, q, message);
    }
  }

  log('');
  log(`✓ Captured ${asked} answer${asked === 1 ? '' : 's'} across ${sections.length} section(s).`);

  return answers;
}

async function promptOne(prompts: PromptAdapter, q: Question, message: string): Promise<Answer> {
  const description = q.helpText ?? '';
  const idkChoice = { value: IDK_VALUE, name: "I don't know" };

  switch (q.kind) {
    case 'boolean': {
      const choices = [
        { value: 'yes', name: 'Yes' },
        { value: 'no', name: 'No' },
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({
        message,
        choices,
        ...(description ? { description } : {}),
      });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'boolean', value: v === 'yes' };
    }
    case 'choice': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({
        message,
        choices,
        ...(description ? { description } : {}),
      });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'choice', value: v };
    }
    case 'multi_choice': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const values = await prompts.checkbox({
        message,
        choices,
        ...(description ? { description } : {}),
      });
      if (q.allowIdk && values.length === 1 && values[0] === IDK_VALUE) {
        return { kind: 'idk' };
      }
      const realValues = values.filter((v) => v !== IDK_VALUE);
      return { kind: 'multi_choice', values: realValues };
    }
    case 'numeric_range': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({
        message,
        choices,
        ...(description ? { description } : {}),
      });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'numeric_range', value: v };
    }
    case 'free_text': {
      const v = await prompts.input({
        message,
        ...(description ? { description } : {}),
      });
      // Free-text questions never accept IDK in the current registry, but the
      // type allows it; treat empty input as IDK when permitted.
      if (q.allowIdk && v.trim() === '') return { kind: 'idk' };
      return { kind: 'free_text', value: v };
    }
  }
}
