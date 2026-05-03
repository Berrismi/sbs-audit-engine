// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Integration: a "perfect-org" evidence bundle scores 100 / A.

import { describe, expect, it } from 'vitest';
import controlsJson from '../../data/controls.json' with { type: 'json' };
import { score } from '../../src/score';
import type { ControlLibrary, Evidence, EvidenceBundle } from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;

const ALL_TRUE_BUNDLE: EvidenceBundle = {
  subject_id: 'fixture-perfect',
  collected_at: '2026-05-03T00:00:00.000Z',
  evidence: library.controls.map<Evidence>((c) => ({
    source: 'questionnaire',
    question_id: c.id.replace(/^SBS-/, 'Q-'),
    answer: { kind: 'boolean', value: true },
  })),
};

describe('perfect-org integration fixture', () => {
  const report = score(ALL_TRUE_BUNDLE);

  it('returns overall_score === 100', () => {
    expect(report.overall_score).toBe(100);
  });

  it('returns risk_grade === "A"', () => {
    expect(report.risk_grade).toBe('A');
  });

  it('reports critical_fail_count === 0', () => {
    expect(report.critical_fail_count).toBe(0);
  });

  it('reports inconclusive_percent === 0', () => {
    expect(report.inconclusive_percent).toBe(0);
  });

  it('every category has score 100 and zero failures', () => {
    for (const cat of report.by_category) {
      expect(cat.score).toBe(100);
      expect(cat.fail_count).toBe(0);
      expect(cat.inconclusive_count).toBe(0);
    }
  });

  it('every per-control result is pass', () => {
    const non_pass = report.control_results.filter((r) => r.status !== 'pass');
    expect(non_pass).toEqual([]);
  });

  it('returns all 42 control results', () => {
    expect(report.control_results).toHaveLength(42);
  });

  it('carries the SBS + engine version metadata', () => {
    expect(report.sbs_version).toBe(library.sbs_version);
    expect(report.engine_version).toMatch(/^0\.0\.0-alpha\./);
  });
});
