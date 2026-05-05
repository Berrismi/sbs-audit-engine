// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Integration: F.4 Bug D — evidence_sufficiency in ScoredReport.
//
// When the inconclusive denominator dominates the scan (more than 50% of
// in-scope controls returned `inconclusive`), the score and grade fields
// stay populated for telemetry + per-category drill-down, but the
// downstream renderer should not advertise a letter grade as the headline
// — it would mislead the customer ("we couldn't tell" reads as "you got
// an A"). The engine surfaces this as a first-class field
// (`evidence_sufficiency: 'sufficient' | 'insufficient'`) so consumers
// don't have to redo the threshold logic.
//
// Threshold is `inconclusive_percent > 50`. Boundary case 50% is
// `sufficient` (strictly greater than triggers insufficient).

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

function bundleFor(
  picker: (controlId: string, idx: number) => QuestionnaireAnswer,
): EvidenceBundle {
  return {
    subject_id: 'fixture-suff',
    collected_at: '2026-05-05T00:00:00.000Z',
    evidence: library.controls.map<Evidence>((c, i) => ({
      source: 'questionnaire',
      question_id: c.id.replace(/^SBS-/, 'Q-'),
      answer: picker(c.id, i),
    })),
  };
}

describe('evidence_sufficiency on ScoredReport', () => {
  it('all-pass bundle reports sufficient', () => {
    const bundle = bundleFor(() => ({ kind: 'boolean', value: true }));
    const report = score(bundle);
    expect(report.inconclusive_percent).toBe(0);
    expect(report.evidence_sufficiency).toBe('sufficient');
  });

  it('all-idk bundle (100% inconclusive) reports insufficient', () => {
    const bundle = bundleFor(() => ({ kind: 'idk' }));
    const report = score(bundle);
    expect(report.inconclusive_percent).toBe(100);
    expect(report.evidence_sufficiency).toBe('insufficient');
  });

  it('all-fail bundle (0% inconclusive) reports sufficient', () => {
    const bundle = bundleFor(() => ({ kind: 'boolean', value: false }));
    const report = score(bundle);
    expect(report.inconclusive_percent).toBe(0);
    expect(report.evidence_sufficiency).toBe('sufficient');
  });

  it('51% inconclusive reports insufficient (just past the threshold)', () => {
    // Make ~51% of controls idk, the rest pass.
    const targetIdkCount = Math.ceil(library.controls.length * 0.51);
    const bundle = bundleFor((_id, i) =>
      i < targetIdkCount ? { kind: 'idk' } : { kind: 'boolean', value: true },
    );
    const report = score(bundle);
    expect(report.inconclusive_percent).toBeGreaterThan(50);
    expect(report.evidence_sufficiency).toBe('insufficient');
  });

  it('49% inconclusive reports sufficient (just below the threshold)', () => {
    const targetIdkCount = Math.floor(library.controls.length * 0.49);
    const bundle = bundleFor((_id, i) =>
      i < targetIdkCount ? { kind: 'idk' } : { kind: 'boolean', value: true },
    );
    const report = score(bundle);
    expect(report.inconclusive_percent).toBeLessThan(50);
    expect(report.evidence_sufficiency).toBe('sufficient');
  });

  it('exactly 50% inconclusive reports sufficient (strict greater-than threshold)', () => {
    // 42 controls; pick exactly 21 to be idk (50.0%).
    const totalControls = library.controls.length;
    const targetIdkCount = Math.floor(totalControls / 2);
    const bundle = bundleFor((_id, i) =>
      i < targetIdkCount ? { kind: 'idk' } : { kind: 'boolean', value: true },
    );
    const report = score(bundle);
    // 42 / 2 = 21 inconclusive of 42 = 50.0 exactly.
    expect(report.inconclusive_percent).toBeLessThanOrEqual(50);
    expect(report.evidence_sufficiency).toBe('sufficient');
  });

  it('the F.4 Bug D scenario — mostly inconclusive scan no longer headlines as A/100', () => {
    // The smoke that triggered this bug had ~98% inconclusive + a handful of
    // passes from the questionnaire fallback. The engine still computes a
    // grade and score (for telemetry), but evidence_sufficiency flags the
    // headline shouldn't claim them.
    const bundle = bundleFor((_id, i) =>
      i < 41 ? { kind: 'idk' } : { kind: 'boolean', value: true },
    );
    const report = score(bundle);
    expect(report.inconclusive_percent).toBeGreaterThan(90);
    expect(report.evidence_sufficiency).toBe('insufficient');
    // Score and grade still present (renderer decides what to show).
    expect(typeof report.overall_score).toBe('number');
    expect(report.risk_grade).toMatch(/^[A-F]$/);
  });
});
