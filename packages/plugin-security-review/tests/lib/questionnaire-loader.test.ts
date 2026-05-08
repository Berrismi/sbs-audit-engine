// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Round-trip + validation tests for the questionnaire YAML loader.

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadAnswersFromYaml } from '../../src/lib/questionnaire-loader';
import type {
  Question,
  QuestionnaireRegistry,
  Section,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

const SECTIONS: readonly Section[] = [
  { id: 'profile', index: 0, title: 'About you', blurb: '' },
  { id: 'ACS', index: 1, title: 'Access controls', blurb: '' },
];

const QUESTIONS: readonly Question[] = [
  {
    id: 'Q-ACS-001',
    section: 'ACS',
    controlId: 'SBS-ACS-001',
    text: '',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-PROFILE-001',
    section: 'profile',
    controlId: null,
    text: '',
    allowIdk: false,
    kind: 'choice',
    options: [
      { value: 'smb', label: 'SMB' },
      { value: 'enterprise', label: 'Enterprise' },
    ],
  },
  {
    id: 'Q-PROFILE-003',
    section: 'profile',
    controlId: null,
    text: '',
    allowIdk: false,
    kind: 'multi_choice',
    options: [
      { value: 'hipaa', label: 'HIPAA' },
      { value: 'soc2', label: 'SOC 2' },
    ],
  },
  {
    id: 'Q-ACS-005',
    section: 'ACS',
    controlId: 'SBS-ACS-005',
    text: '',
    allowIdk: false,
    kind: 'numeric_range',
    options: [
      { value: '0', label: '0' },
      { value: '1-5', label: '1-5' },
    ],
  },
  {
    id: 'Q-PROFILE-002',
    section: 'profile',
    controlId: null,
    text: '',
    allowIdk: false,
    kind: 'free_text',
  },
];

const REGISTRY: QuestionnaireRegistry = {
  version: 'test-1',
  sbsVersion: '0.4.1',
  sections: SECTIONS,
  questions: QUESTIONS,
  skipRules: [],
};

async function writeYaml(content: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hm-q-loader-'));
  const path = join(dir, 'q.yml');
  await writeFile(path, typeof content === 'string' ? content : stringify(content));
  return path;
}

describe('loadAnswersFromYaml — happy paths', () => {
  it('round-trips boolean / choice / multi_choice / numeric_range / free_text answers', async () => {
    const path = await writeYaml({
      metadata: { alias: 'test-alias' },
      answers: {
        'Q-ACS-001': { kind: 'boolean', value: true },
        'Q-PROFILE-001': { kind: 'choice', value: 'enterprise' },
        'Q-PROFILE-003': { kind: 'multi_choice', values: ['hipaa', 'soc2'] },
        'Q-ACS-005': { kind: 'numeric_range', value: '1-5' },
        'Q-PROFILE-002': { kind: 'free_text', value: 'Healthcare' },
      },
    });
    const result = await loadAnswersFromYaml(path, { registry: REGISTRY });
    expect(result.metadata).toEqual({ alias: 'test-alias' });
    expect(result.answers).toEqual({
      'Q-ACS-001': { kind: 'boolean', value: true },
      'Q-PROFILE-001': { kind: 'choice', value: 'enterprise' },
      'Q-PROFILE-003': { kind: 'multi_choice', values: ['hipaa', 'soc2'] },
      'Q-ACS-005': { kind: 'numeric_range', value: '1-5' },
      'Q-PROFILE-002': { kind: 'free_text', value: 'Healthcare' },
    });
  });

  it('accepts idk for questions where allowIdk is true', async () => {
    const path = await writeYaml({
      answers: { 'Q-ACS-001': { kind: 'idk' } },
    });
    const result = await loadAnswersFromYaml(path, { registry: REGISTRY });
    expect(result.answers).toEqual({ 'Q-ACS-001': { kind: 'idk' } });
  });

  it('treats a missing metadata field as an empty object', async () => {
    const path = await writeYaml({
      answers: { 'Q-ACS-001': { kind: 'boolean', value: false } },
    });
    const result = await loadAnswersFromYaml(path, { registry: REGISTRY });
    expect(result.metadata).toEqual({});
  });
});

describe('loadAnswersFromYaml — validation errors', () => {
  it('rejects unknown question ids', async () => {
    const path = await writeYaml({
      answers: { 'Q-DOES-NOT-EXIST': { kind: 'boolean', value: true } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /unknown question id "Q-DOES-NOT-EXIST"/,
    );
  });

  it('rejects boolean values that are not actually booleans', async () => {
    const path = await writeYaml({
      answers: { 'Q-ACS-001': { kind: 'boolean', value: 'yes' } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /value to be true\/false/,
    );
  });

  it('rejects choice values that are not in the option list', async () => {
    const path = await writeYaml({
      answers: { 'Q-PROFILE-001': { kind: 'choice', value: 'lemonade-stand' } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /not one of the allowed options/,
    );
  });

  it('rejects multi_choice values that are not in the option list', async () => {
    const path = await writeYaml({
      answers: { 'Q-PROFILE-003': { kind: 'multi_choice', values: ['hipaa', 'martian-law'] } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /invalid values/,
    );
  });

  it('rejects idk on a question where allowIdk is false', async () => {
    const path = await writeYaml({
      answers: { 'Q-PROFILE-001': { kind: 'idk' } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /does not accept "I don't know"/,
    );
  });

  it('rejects an answer whose kind does not match the question kind', async () => {
    const path = await writeYaml({
      answers: { 'Q-ACS-001': { kind: 'choice', value: 'something' } },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /expected kind "boolean", got "choice"/,
    );
  });

  it('rejects a YAML file that is not a mapping', async () => {
    const path = await writeYaml('- one\n- two\n');
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /must be a mapping/,
    );
  });

  it('rejects a YAML file missing the answers field', async () => {
    const path = await writeYaml({ metadata: { alias: 'x' } });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /missing the required "answers" mapping/,
    );
  });

  it('aggregates multiple errors into one message', async () => {
    const path = await writeYaml({
      answers: {
        'Q-ACS-001': { kind: 'boolean', value: 'not-a-bool' },
        'Q-MADE-UP': { kind: 'idk' },
      },
    });
    await expect(loadAnswersFromYaml(path, { registry: REGISTRY })).rejects.toThrow(
      /has 2 error\(s\)/,
    );
  });
});
