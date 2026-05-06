// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Belt-and-suspenders divergence guard for ENGINE_VERSION.
//
// `score.ts` derives ENGINE_VERSION from package.json at module init, so the
// two cannot diverge in current code. This test is here to catch the
// regression case: a future engineer reintroducing a hardcoded literal in
// score.ts (the previous shape — alpha.3 literal that drifted to alpha.9
// silently between releases). If that happens, this test will fail loudly.
//
// Same guard applies to scripts/sync-sbs.ts where the literal `'0.0.0-dev'`
// previously baked itself into controls.json.engine_version. Now sourced
// from package.json there too.

import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../src/score';
import packageJson from '../../package.json' with { type: 'json' };
import controlsJson from '../../data/controls.json' with { type: 'json' };
import type { ControlLibrary } from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;

describe('ENGINE_VERSION canonicalization', () => {
  it('matches packages/sbs-engine/package.json version exactly', () => {
    expect(ENGINE_VERSION).toBe(packageJson.version);
  });

  it('controls.json engine_version snapshot matches package.json version', () => {
    // sync-sbs.ts writes packageJson.version at sync time; verify the
    // current snapshot reflects an alpha-tagged version (the production
    // pattern), not the historical `0.0.0-dev` literal.
    expect(library.engine_version).toBe(packageJson.version);
    expect(library.engine_version).toMatch(/^0\.0\.0-alpha\.\d+$/);
  });
});
