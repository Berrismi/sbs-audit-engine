// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Test fixture helper: load a single Control by id from data/controls.json.
// Used by every Phase 3 evaluator test so we don't hand-author 41 stub
// fixtures that drift out of sync with upstream.

import controlsJson from '../../data/controls.json' with { type: 'json' };
import type { Control, ControlLibrary } from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;
const byId = new Map<string, Control>(library.controls.map((c) => [c.id, c]));

export function makeControlFixture(id: string): Control {
  const c = byId.get(id);
  if (!c) {
    throw new Error(
      `makeControlFixture: unknown control id "${id}". Known ids: ${[...byId.keys()].slice(0, 5).join(', ')}, …`,
    );
  }
  return c;
}
