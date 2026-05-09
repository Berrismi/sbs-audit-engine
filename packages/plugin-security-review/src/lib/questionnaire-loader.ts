// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Load a saved questionnaire YAML and validate every entry against the
// engine's registry. Fails loudly when the file references unknown question
// ids, has the wrong shape for an answer, or selects an option that isn't in
// the question's option list — these are silent-corruption hazards otherwise.

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import {
  REGISTRY,
  type Answer,
  type AnswerSet,
  type Question,
  type QuestionnaireRegistry,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

export interface LoadedQuestionnaireFile {
  /** Free-form metadata at the top of the YAML (alias, sbs version, etc.). */
  metadata: Record<string, unknown>;
  answers: AnswerSet;
}

export interface LoadOptions {
  registry?: QuestionnaireRegistry;
}

export async function loadAnswersFromYaml(
  path: string,
  opts: LoadOptions = {},
): Promise<LoadedQuestionnaireFile> {
  const registry = opts.registry ?? REGISTRY;

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`Could not read questionnaire YAML at ${path}: ${(err as Error).message}`, {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML at ${path}: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`YAML at ${path} must be a mapping with an "answers" field.`);
  }
  const obj = parsed as Record<string, unknown>;

  const metadataRaw = obj['metadata'];
  const metadata =
    metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : {};

  const rawAnswers = obj['answers'];
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    throw new Error(`YAML at ${path} is missing the required "answers" mapping.`);
  }
  const answersIn = rawAnswers as Record<string, unknown>;

  const validatedAnswers: AnswerSet = {};
  const questionById = new Map(registry.questions.map((q) => [q.id, q]));
  const errors: string[] = [];

  for (const [questionId, answerRaw] of Object.entries(answersIn)) {
    const question = questionById.get(questionId);
    if (!question) {
      errors.push(
        `unknown question id "${questionId}" — does not exist in the questionnaire registry`,
      );
      continue;
    }
    const validated = validateAnswer(question, answerRaw);
    if (typeof validated === 'string') {
      errors.push(`"${questionId}": ${validated}`);
      continue;
    }
    validatedAnswers[questionId] = validated;
  }

  if (errors.length > 0) {
    throw new Error(
      `Questionnaire YAML at ${path} has ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`,
    );
  }

  return { metadata, answers: validatedAnswers };
}

function validateAnswer(question: Question, raw: unknown): Answer | string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return 'must be a mapping with a "kind" field';
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj['kind'];

  if (kind === 'idk') {
    if (!question.allowIdk) return 'this question does not accept "I don\'t know"';
    return { kind: 'idk' };
  }

  switch (question.kind) {
    case 'boolean':
      if (kind !== 'boolean') return `expected kind "boolean", got "${String(kind)}"`;
      if (typeof obj['value'] !== 'boolean') return 'expected value to be true/false';
      return { kind: 'boolean', value: obj['value'] as boolean };
    case 'choice':
      if (kind !== 'choice') return `expected kind "choice", got "${String(kind)}"`;
      if (typeof obj['value'] !== 'string') return 'expected value to be a string';
      if (!question.options.some((o) => o.value === obj['value'])) {
        return `value "${String(obj['value'])}" is not one of the allowed options`;
      }
      return { kind: 'choice', value: obj['value'] as string };
    case 'multi_choice': {
      if (kind !== 'multi_choice') return `expected kind "multi_choice", got "${String(kind)}"`;
      const valuesRaw = obj['values'];
      if (!Array.isArray(valuesRaw)) return 'expected values to be an array';
      const allowed = new Set(question.options.map((o) => o.value));
      const invalid = valuesRaw.filter((v) => typeof v !== 'string' || !allowed.has(v));
      if (invalid.length > 0) {
        return `invalid values: ${invalid.map((v) => JSON.stringify(v)).join(', ')}`;
      }
      return { kind: 'multi_choice', values: valuesRaw as string[] };
    }
    case 'numeric_range':
      if (kind !== 'numeric_range') return `expected kind "numeric_range", got "${String(kind)}"`;
      if (typeof obj['value'] !== 'string') return 'expected value to be a string';
      if (!question.options.some((o) => o.value === obj['value'])) {
        return `value "${String(obj['value'])}" is not one of the allowed buckets`;
      }
      return { kind: 'numeric_range', value: obj['value'] as string };
    case 'free_text':
      if (kind !== 'free_text') return `expected kind "free_text", got "${String(kind)}"`;
      if (typeof obj['value'] !== 'string') return 'expected value to be a string';
      return { kind: 'free_text', value: obj['value'] as string };
  }
}
