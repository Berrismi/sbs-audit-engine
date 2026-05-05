// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Pass-narrative coverage test.
//
// Every control in data/controls.json must carry a HelloMavens-authored
// `hellomavens_enrichments.pass_narrative`. The narrative renders in the
// report's appendix validation cards. Authoring rules:
//   - 15 to 50 words (target 20–40; schema test allows ±10 for slop)
//   - Customer-facing, second person
//   - No placeholder strings (TODO/TBD/Lorem)

import { describe, expect, it } from 'vitest';
import controlsJson from '../data/controls.json' with { type: 'json' };
import type { ControlLibrary } from '../src/types';

const library = controlsJson as unknown as ControlLibrary;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

describe('pass_narrative coverage', () => {
  it('every control has a non-empty hellomavens_enrichments.pass_narrative', () => {
    const missing = library.controls.filter((c) => {
      const pn = c.hellomavens_enrichments?.pass_narrative;
      return typeof pn !== 'string' || pn.trim() === '';
    });
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it('every pass_narrative is between 15 and 50 words', () => {
    const offenders = library.controls
      .map((c) => ({ id: c.id, pn: c.hellomavens_enrichments?.pass_narrative }))
      .filter((c) => typeof c.pn === 'string' && c.pn.trim() !== '')
      .map((c) => ({ id: c.id, words: wordCount(c.pn!) }))
      .filter((c) => c.words < 15 || c.words > 50);
    expect(offenders).toEqual([]);
  });

  it('no pass_narrative contains placeholder strings (TODO / TBD / Lorem)', () => {
    const offenders = library.controls
      .map((c) => ({ id: c.id, pn: c.hellomavens_enrichments?.pass_narrative }))
      .filter((c) => typeof c.pn === 'string')
      .filter((c) => /\b(TODO|TBD|Lorem)\b/i.test(c.pn!));
    expect(offenders.map((c) => c.id)).toEqual([]);
  });
});
