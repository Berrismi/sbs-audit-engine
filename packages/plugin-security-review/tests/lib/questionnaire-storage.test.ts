// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Storage helper round-trip: write answers + reload via loader and confirm
// the persisted YAML survives the trip with shape and option lists intact.

import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { saveAnswers } from '../../src/lib/questionnaire-storage';
import { loadAnswersFromYaml } from '../../src/lib/questionnaire-loader';
import type {
  Question,
  QuestionnaireRegistry,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

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
    id: 'Q-ACS-002',
    section: 'ACS',
    controlId: 'SBS-ACS-002',
    text: '',
    allowIdk: true,
    kind: 'boolean',
  },
];

const REGISTRY: QuestionnaireRegistry = {
  version: 'test-1',
  sbsVersion: '0.4.1',
  sections: [{ id: 'ACS', index: 1, title: 'Access controls', blurb: '' }],
  questions: QUESTIONS,
  skipRules: [],
};

describe('saveAnswers', () => {
  it('writes the file under <rootDir>/questionnaire/<alias>-<ts>.yml', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'hm-q-store-'));
    const path = await saveAnswers({
      alias: 'my-alias',
      registryVersion: 'v1',
      sbsVersion: '0.4.1',
      answers: { 'Q-ACS-001': { kind: 'boolean', value: true } },
      rootDir,
      now: new Date('2026-05-08T13:45:01.234Z'),
    });
    expect(path).toBe(join(rootDir, 'questionnaire', 'my-alias-2026-05-08T13-45-01-234Z.yml'));

    const raw = await readFile(path, 'utf8');
    const parsed = parse(raw) as { metadata: Record<string, string>; answers: unknown };
    expect(parsed.metadata).toEqual({
      alias: 'my-alias',
      registryVersion: 'v1',
      sbsVersion: '0.4.1',
      savedAt: '2026-05-08T13:45:01.234Z',
    });
    expect(parsed.answers).toEqual({ 'Q-ACS-001': { kind: 'boolean', value: true } });
  });

  it('writes the file with mode 0600', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'hm-q-store-'));
    const path = await saveAnswers({
      alias: 'a',
      registryVersion: 'v1',
      sbsVersion: '0.4.1',
      answers: {},
      rootDir,
    });
    const stats = await stat(path);
    // Lower 9 bits of mode = perms. 0o600 = owner rw, no group/other.
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('round-trips through saveAnswers → loadAnswersFromYaml unchanged', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'hm-q-store-'));
    const original = {
      'Q-ACS-001': { kind: 'boolean', value: true } as const,
      'Q-ACS-002': { kind: 'idk' } as const,
    };
    const path = await saveAnswers({
      alias: 'roundtrip',
      registryVersion: 'v1',
      sbsVersion: '0.4.1',
      answers: original,
      rootDir,
    });
    const loaded = await loadAnswersFromYaml(path, { registry: REGISTRY });
    expect(loaded.answers).toEqual(original);
  });

  it('falls back to HM_CONFIG_DIR env var when rootDir is unset', async () => {
    const envDir = await mkdtemp(join(tmpdir(), 'hm-q-store-env-'));
    const prev = process.env['HM_CONFIG_DIR'];
    process.env['HM_CONFIG_DIR'] = envDir;
    try {
      const path = await saveAnswers({
        alias: 'env-test',
        registryVersion: 'v1',
        sbsVersion: '0.4.1',
        answers: {},
      });
      expect(path.startsWith(envDir + '/questionnaire/')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env['HM_CONFIG_DIR'];
      else process.env['HM_CONFIG_DIR'] = prev;
    }
  });
});
