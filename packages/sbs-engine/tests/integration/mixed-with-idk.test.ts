// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Integration: a mixed-org bundle (some pass, some fail, some idk) verifies:
//   - inconclusive controls are excluded from scoring denominators
//   - the inconclusive_percent banner reflects the actual proportion
//   - critical-fail cap is independent of inconclusive Critical controls

import { describe, expect, it } from 'vitest';
import controlsJson from '../../data/controls.json' with { type: 'json' };
import { score } from '../../src/score';
import type {
  ControlLibrary,
  Evidence,
  EvidenceBundle,
  QuestionnaireAnswer,
} from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;

/**
 * Build a bundle from a per-control answer-picker.
 */
function bundleFor(
  picker: (controlId: string, idx: number) => QuestionnaireAnswer,
): EvidenceBundle {
  return {
    subject_id: 'fixture-mixed',
    collected_at: '2026-05-03T00:00:00.000Z',
    evidence: library.controls.map<Evidence>((c, i) => ({
      source: 'questionnaire',
      question_id: c.id.replace(/^SBS-/, 'Q-'),
      answer: picker(c.id, i),
    })),
  };
}

describe('mixed-with-idk integration fixture', () => {
  it('excludes inconclusive controls from category denominators', () => {
    // Every Critical control is idk; every other control passes.
    // Result: every category that has only Critical controls becomes
    // is_all_inconclusive (score 0); every category with non-Critical
    // controls scores 100 on the in-scope subset.
    const bundle = bundleFor((id) => {
      const control = library.controls.find((c) => c.id === id);
      if (!control) return { kind: 'idk' };
      return control.risk_level === 'Critical' ? { kind: 'idk' } : { kind: 'boolean', value: true };
    });
    const report = score(bundle);

    // No critical fails (all idk → inconclusive, not fail).
    expect(report.critical_fail_count).toBe(0);

    // Categories should not be C-capped (no critical fails).
    expect(report.risk_grade).toMatch(/^[AB]$/);

    // inconclusive_percent reflects exact Critical-control share of total.
    const criticalCount = library.controls.filter((c) => c.risk_level === 'Critical').length;
    const expectedPct = Math.round((criticalCount / library.controls.length) * 100 * 10) / 10;
    expect(report.inconclusive_percent).toBe(expectedPct);
  });

  it('all-idk bundle scores 0 with grade F (denominator empty everywhere)', () => {
    const bundle = bundleFor(() => ({ kind: 'idk' }));
    const report = score(bundle);

    expect(report.overall_score).toBe(0);
    expect(report.risk_grade).toBe('F');
    expect(report.inconclusive_percent).toBe(100);
    expect(report.critical_fail_count).toBe(0);
    for (const cat of report.by_category) {
      expect(cat.is_all_inconclusive).toBe(true);
    }
  });

  it('half-pass / half-fail produces a non-trivial intermediate grade', () => {
    // Every other control passes; every other fails. Critical controls
    // alternate too — some fail, triggering the C-cap.
    const bundle = bundleFor((_id, i) => ({
      kind: 'boolean',
      value: i % 2 === 0,
    }));
    const report = score(bundle);

    expect(report.overall_score).toBeGreaterThan(0);
    expect(report.overall_score).toBeLessThan(100);
    expect(report.critical_fail_count).toBeGreaterThan(0);
    // C-cap: with at least one Critical fail, grade can't be A or B.
    expect(['C', 'D', 'F']).toContain(report.risk_grade);
  });
});
