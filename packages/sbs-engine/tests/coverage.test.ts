// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Coverage test: every control id in data/controls.json must have
//   1. a corresponding src/evaluators/<id-lowercased>.ts file, AND
//   2. an entry in src/evaluator-registry.ts.
//
// This is the engine-side companion to the questionnaire registry's
// drift test in the closed app. It ensures the engine can score every
// control the questionnaire surfaces.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import controlsJson from '../data/controls.json' with { type: 'json' };
import { EVALUATOR_REGISTRY } from '../src/evaluator-registry';
import type { ControlLibrary } from '../src/types';

const library = controlsJson as unknown as ControlLibrary;
const ENGINE_SRC = resolve(import.meta.dirname, '..', 'src');

function evaluatorPathFor(controlId: string): string {
  // SBS-ACS-004 → evaluators/acs-004.ts
  const stem = controlId.replace(/^SBS-/, '').toLowerCase();
  return resolve(ENGINE_SRC, 'evaluators', `${stem}.ts`);
}

describe('Evaluator coverage', () => {
  it('every control in the library has a corresponding evaluator file', () => {
    const missing = library.controls
      .map((c) => ({ id: c.id, path: evaluatorPathFor(c.id) }))
      .filter(({ path }) => !existsSync(path))
      .map(({ id, path }) => `${id} → ${path}`);
    expect(missing).toEqual([]);
  });

  it('every control in the library has an entry in EVALUATOR_REGISTRY', () => {
    const missing = library.controls.map((c) => c.id).filter((id) => !EVALUATOR_REGISTRY.has(id));
    expect(missing).toEqual([]);
  });

  it('EVALUATOR_REGISTRY does not contain orphan entries (controls no longer in library)', () => {
    const ids = new Set(library.controls.map((c) => c.id));
    const orphans = [...EVALUATOR_REGISTRY.keys()].filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });
});
