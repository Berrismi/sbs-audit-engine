// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Integration: a "disaster-org" evidence bundle scores 0 / F with the
// critical-fail count populated.

import { describe, expect, it } from 'vitest';
import controlsJson from '../../data/controls.json' with { type: 'json' };
import { score } from '../../src/score';
import type { ControlLibrary, Evidence, EvidenceBundle } from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;

const ALL_FALSE_BUNDLE: EvidenceBundle = {
  subject_id: 'fixture-disaster',
  collected_at: '2026-05-03T00:00:00.000Z',
  evidence: library.controls.map<Evidence>((c) => ({
    source: 'questionnaire',
    question_id: c.id.replace(/^SBS-/, 'Q-'),
    answer: { kind: 'boolean', value: false },
  })),
};

describe('disaster-org integration fixture', () => {
  const report = score(ALL_FALSE_BUNDLE);

  it('returns overall_score === 0', () => {
    expect(report.overall_score).toBe(0);
  });

  it('returns risk_grade === "F"', () => {
    expect(report.risk_grade).toBe('F');
  });

  it('reports critical_fail_count >= 9 (all upstream Critical controls fail)', () => {
    // SBS upstream main @ d4304e1 has multiple Critical controls; CPORTAL-004
    // is new at this pin, AUTH-004 risk_level is sourced from the markdown
    // badge (`Critical`) per resolveRiskLevel. Lower bound stays at 9 to
    // remain valid against earlier pins; current expected count is higher.
    expect(report.critical_fail_count).toBeGreaterThanOrEqual(9);
  });

  it('reports inconclusive_percent === 0', () => {
    expect(report.inconclusive_percent).toBe(0);
  });

  it('every category has score 0', () => {
    for (const cat of report.by_category) {
      expect(cat.score).toBe(0);
    }
  });

  it('every per-control result is fail', () => {
    const non_fail = report.control_results.filter((r) => r.status !== 'fail');
    expect(non_fail).toEqual([]);
  });

  it('returns one result per control in the library', () => {
    expect(report.control_results).toHaveLength(library.controls.length);
  });
});
