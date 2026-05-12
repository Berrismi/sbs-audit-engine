// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Interactive TUI runner for the questionnaire. Walks the operator through
// every question in the bundled registry (skipped questions auto-omitted),
// then shows a review screen that lets them edit any answer before
// submitting. Pure orchestration over @inquirer/* primitives — no IO
// outside what the prompt libraries do, so this is straightforward to
// unit-test by injecting a stubbed `prompts` adapter.

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
const NONE_VALUE = 'none';
const SUBMIT_VALUE = '__hm_submit__';

/**
 * Adapter the runner uses for actual prompts. Defaults to the real @inquirer
 * primitives; tests pass a stub.
 */
export interface PromptAdapter {
  select: (args: {
    message: string;
    choices: readonly { value: string; name: string }[];
  }) => Promise<string>;
  checkbox: (args: {
    message: string;
    choices: readonly { value: string; name: string }[];
  }) => Promise<readonly string[]>;
  input: (args: { message: string }) => Promise<string>;
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
  /**
   * Skip the end-of-questionnaire review screen. Used by tests that exercise
   * the linear answer flow and don't want to script the extra `select` call
   * that the review menu issues. Default `false` — production runs always
   * show review.
   */
  skipReview?: boolean;
}

/**
 * Walk the questionnaire interactively. Returns the operator's answers keyed
 * by question id. Side-effects: writes status to `log`.
 *
 * Two phases:
 *   1. Linear ask — show every visible question in section + index order.
 *   2. Review     — show all answers and let the operator edit any before
 *                   submitting. Editing re-evaluates skip rules, so a freshly-
 *                   changed answer can surface previously-skipped questions
 *                   (the runner asks those before re-entering review) or hide
 *                   previously-shown ones (the runner drops their answers).
 */
export async function runQuestionnaire(opts: RunQuestionnaireOptions = {}): Promise<AnswerSet> {
  const registry = opts.registry ?? REGISTRY;
  const prompts = opts.prompts ?? defaultAdapter;
  const log = opts.log ?? ((line: string) => console.log(line));

  const answers: AnswerSet = {};

  // ---- Phase 1: linear walk --------------------------------------------------
  const sections = [...registry.sections]
    .sort((a, b) => a.index - b.index)
    .filter((s) => s.id !== 'disclaimer' && s.id !== 'submit');

  let asked = 0;
  for (const section of sections) {
    const sectionQuestions = registry.questions.filter((q) => q.section === section.id);
    if (sectionQuestions.length === 0) continue;

    log('');
    log(`── Section ${section.index} · ${section.title} ──`);
    if (section.blurb) log(section.blurb);

    let activeGroup: string | undefined;

    for (const q of sectionQuestions) {
      // Re-evaluate every iteration: a freshly-supplied answer can change
      // which downstream questions are visible.
      if (evaluateSkip(q, answers, registry.skipRules) !== 'show') continue;

      if (q.groupId && q.groupId !== activeGroup) {
        const title = GROUP_TITLES[q.groupId] ?? q.groupId;
        log('');
        log(`  ${title}`);
        activeGroup = q.groupId;
      } else if (!q.groupId) {
        activeGroup = undefined;
      }

      asked += 1;
      answers[q.id] = await promptOne(prompts, q, formatMessage(q), log);
    }
  }

  log('');
  log(`✓ Captured ${asked} answer${asked === 1 ? '' : 's'} across ${sections.length} section(s).`);

  if (opts.skipReview) return answers;

  // ---- Phase 2: review + edit loop ------------------------------------------
  return await reviewLoop(registry, answers, prompts, log);
}

/**
 * Show a review screen with all visible answers and offer the operator the
 * choice of submitting or editing any single answer. Loops until submit.
 *
 * Skip-rule re-evaluation after each edit:
 *   - Newly-visible questions (a previously-skipped Q whose skip rule now
 *     returns `show`) are asked immediately, before the next review screen.
 *   - Newly-hidden questions (a previously-answered Q whose skip rule now
 *     returns `skip_*`) have their stored answers dropped.
 */
async function reviewLoop(
  registry: QuestionnaireRegistry,
  answers: AnswerSet,
  prompts: PromptAdapter,
  log: (line: string) => void,
): Promise<AnswerSet> {
  while (true) {
    // Reconcile: drop answers for now-hidden Qs; gather visible Qs.
    const visibleQuestions: Question[] = [];
    for (const q of registry.questions) {
      if (evaluateSkip(q, answers, registry.skipRules) === 'show') {
        visibleQuestions.push(q);
      } else if (answers[q.id] !== undefined) {
        delete answers[q.id];
      }
    }

    // Ask any visible-but-unanswered Qs (surfaced by a recent edit).
    const unanswered = visibleQuestions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      log('');
      log('· New questions surfaced based on your edits — answering those next:');
      for (const q of unanswered) {
        answers[q.id] = await promptOne(prompts, q, formatMessage(q), log);
      }
      continue;
    }

    // Show the review menu.
    log('');
    log('── Review your answers ──');
    log(buildReviewSummary(registry, answers, visibleQuestions));

    const choices = [
      { value: SUBMIT_VALUE, name: '✓ Submit answers' },
      ...visibleQuestions.map((q) => ({
        value: q.id,
        name: formatEditLabel(q, answers),
      })),
    ];
    const choice = await prompts.select({
      message: 'Submit, or pick an answer to edit:',
      choices,
    });

    if (choice === SUBMIT_VALUE) return answers;

    const editQ = visibleQuestions.find((q) => q.id === choice);
    if (!editQ) continue; // shouldn't happen
    log('');
    log(`Editing ${editQ.controlId ? `${editQ.controlId} · ` : ''}${editQ.text}`);
    answers[editQ.id] = await promptOne(prompts, editQ, formatMessage(editQ), log);
    // Loop continues; reconcile picks up skip-rule effects.
  }
}

function formatMessage(q: Question): string {
  const counter = q.controlId ? `(${q.controlId})` : '(profile)';
  return `${counter} ${q.text}`;
}

function formatEditLabel(q: Question, answers: AnswerSet): string {
  const head = q.controlId ? `${q.controlId}` : 'profile';
  const summary = summarizeAnswer(q, answers[q.id]);
  return `✎ ${head}  ${truncate(q.text, 70)} → ${summary}`;
}

function buildReviewSummary(
  registry: QuestionnaireRegistry,
  answers: AnswerSet,
  visible: readonly Question[],
): string {
  const sections = [...registry.sections]
    .sort((a, b) => a.index - b.index)
    .filter((s) => s.id !== 'disclaimer' && s.id !== 'submit');
  const lines: string[] = [];
  for (const section of sections) {
    const sectionQs = visible.filter((q) => q.section === section.id);
    if (sectionQs.length === 0) continue;
    lines.push('');
    lines.push(`  Section ${section.index} · ${section.title}`);
    for (const q of sectionQs) {
      const head = q.controlId ?? 'profile';
      const summary = summarizeAnswer(q, answers[q.id]);
      lines.push(`    ${head}  ${truncate(q.text, 80)}`);
      lines.push(`      → ${summary}`);
    }
  }
  return lines.join('\n');
}

function summarizeAnswer(q: Question, a: Answer | undefined): string {
  if (a === undefined) return '(no answer)';
  switch (a.kind) {
    case 'idk':
      return "I don't know";
    case 'boolean':
      return a.value ? 'Yes' : 'No';
    case 'free_text':
      return a.value.trim() === '' ? '(empty)' : truncate(a.value, 60);
    case 'choice':
    case 'numeric_range': {
      const opt = q.kind === a.kind ? q.options.find((o) => o.value === a.value) : undefined;
      return opt?.label ?? a.value;
    }
    case 'multi_choice': {
      if (a.values.length === 0) return '(none selected)';
      if (q.kind !== 'multi_choice') return a.values.join(', ');
      const labels = a.values.map((v) => {
        const opt = q.options.find((o) => o.value === v);
        return opt?.label ?? v;
      });
      return labels.join(', ');
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

async function promptOne(
  prompts: PromptAdapter,
  q: Question,
  message: string,
  log: (line: string) => void,
): Promise<Answer> {
  // @inquirer v5 dropped the top-level `description` config in select /
  // checkbox / input — `description` now lives per-choice and only renders
  // when that choice is highlighted. We want a single inline help line
  // visible BEFORE the prompt, so we just log it ourselves.
  if (q.helpText) log(`  ℹ ${q.helpText}`);

  const idkChoice = { value: IDK_VALUE, name: "I don't know" };

  switch (q.kind) {
    case 'boolean': {
      const choices = [
        { value: 'yes', name: 'Yes' },
        { value: 'no', name: 'No' },
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({ message, choices });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'boolean', value: v === 'yes' };
    }
    case 'choice': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({ message, choices });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'choice', value: v };
    }
    case 'multi_choice': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const hasNoneOption = q.options.some((o) => o.value === NONE_VALUE);
      // Loop while the operator picks "None of these" together with other
      // options — they're mutually exclusive by design (you either had
      // nothing on the list, or you had some of them, not both).
      while (true) {
        const values = await prompts.checkbox({ message, choices });
        if (hasNoneOption && values.includes(NONE_VALUE) && values.length > 1) {
          log(
            '  ⚠ "None of these" is exclusive — pick it alone, or any combination of the others. Try again.',
          );
          continue;
        }
        if (q.allowIdk && values.length === 1 && values[0] === IDK_VALUE) {
          return { kind: 'idk' };
        }
        const realValues = values.filter((v) => v !== IDK_VALUE);
        return { kind: 'multi_choice', values: realValues };
      }
    }
    case 'numeric_range': {
      const choices = [
        ...q.options.map((o) => ({ value: o.value, name: o.label })),
        ...(q.allowIdk ? [idkChoice] : []),
      ];
      const v = await prompts.select({ message, choices });
      if (v === IDK_VALUE) return { kind: 'idk' };
      return { kind: 'numeric_range', value: v };
    }
    case 'free_text': {
      const v = await prompts.input({ message });
      if (q.allowIdk && v.trim() === '') return { kind: 'idk' };
      return { kind: 'free_text', value: v };
    }
  }
}
