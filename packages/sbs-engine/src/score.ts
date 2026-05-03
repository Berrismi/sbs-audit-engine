// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// score() — top-level scoring entrypoint.
//
// Takes an EvidenceBundle (one subject's collected evidence), runs every
// evaluator against the matching subset of evidence, then aggregates per-
// category and overall scores per spec §8.
//
// Pure(ish): the only side effect is reading data/controls.json once at
// module init via the JSON-import-assert pattern (same as the closed app's
// registry.ts does it). Two calls with the same bundle return the same
// ScoredReport.

import controlsJson from '../data/controls.json' with { type: 'json' };
import { EVALUATOR_REGISTRY } from './evaluator-registry';
import {
  categoryScore,
  inconclusivePercent,
  overallScore,
  riskGrade,
  type CategoryWeightInput,
} from './scoring';
import type {
  CategoryPrefix,
  CategoryScoreOutput,
  Control,
  ControlLibrary,
  ControlScoreResult,
  Evidence,
  EvidenceBundle,
  RiskLevel,
  ScoredReport,
} from './types';

const library = controlsJson as unknown as ControlLibrary;

export const ENGINE_VERSION = '0.0.0-alpha.3';

/** Drop the `SBS-` prefix and replace `-` so SBS-ACS-004 → Q-ACS-004. */
function questionIdFor(controlId: string): string {
  return controlId.replace(/^SBS-/, 'Q-');
}

/** Filter the bundle's evidence down to entries relevant to the given control. */
function evidenceForControl(control: Control, bundle: EvidenceBundle): Evidence[] {
  const qid = questionIdFor(control.id);
  return bundle.evidence.filter((e) => {
    if (e.source === 'questionnaire') return e.question_id === qid;
    // Future: SOQL/Code-Analyzer/Health-Check evidence routing per evaluator
    // wiring. For Phase 3 we only care about questionnaire evidence; the
    // helper passes everything else through and individual evaluators
    // already ignore irrelevant sources.
    return true;
  });
}

/**
 * Score a complete evidence bundle and return a fully-populated report data
 * structure. Used by the closed app's `/audit/report/[id]` viewer at render
 * time and by the consultant CLI in Phase 5.
 */
export function score(bundle: EvidenceBundle): ScoredReport {
  const controlResults: ControlScoreResult[] = [];

  for (const control of library.controls) {
    const evaluator = EVALUATOR_REGISTRY.get(control.id);
    if (!evaluator) {
      // Defensive: every control should have an evaluator (coverage test
      // enforces this). If somehow missing, return inconclusive rather
      // than crashing the report.
      controlResults.push(
        buildResult(
          control,
          'inconclusive',
          [`No evaluator registered for ${control.id}.`],
          'low',
          [],
        ),
      );
      continue;
    }

    const result = evaluator({
      control,
      evidence: evidenceForControl(control, bundle),
    });

    controlResults.push(
      buildResult(control, result.status, result.findings, result.confidence, result.evidence_used),
    );
  }

  // Aggregate per category.
  const byCategoryMap = new Map<CategoryPrefix, ControlScoreResult[]>();
  for (const r of controlResults) {
    const list = byCategoryMap.get(r.category) ?? [];
    list.push(r);
    byCategoryMap.set(r.category, list);
  }

  const by_category: CategoryScoreOutput[] = [];
  const weightInputs: CategoryWeightInput[] = [];

  for (const [category, results] of byCategoryMap.entries()) {
    const cat = categoryScore(category, results);
    by_category.push(cat);

    const counts: Record<RiskLevel, number> = { Critical: 0, High: 0, Moderate: 0 };
    for (const r of results) {
      // Skip inconclusive + na from the weight composition — they don't
      // contribute to either the numerator or denominator of the overall
      // weighting, which keeps "all-skipped" categories from dragging.
      if (r.status === 'pass' || r.status === 'fail') {
        counts[r.risk_level] += 1;
      }
    }
    weightInputs.push({ category: cat, control_count_by_risk: counts });
  }

  // Sort by_category by category prefix for stable rendering.
  by_category.sort((a, b) => a.category.localeCompare(b.category));

  const overall = overallScore(weightInputs);
  const critical_fail_count = controlResults.filter(
    (r) => r.risk_level === 'Critical' && r.status === 'fail',
  ).length;
  const grade = riskGrade(overall, critical_fail_count > 0);
  const inconclusive_pct = inconclusivePercent(controlResults);

  return {
    overall_score: overall,
    risk_grade: grade,
    critical_fail_count,
    inconclusive_percent: inconclusive_pct,
    by_category,
    control_results: controlResults.sort((a, b) => a.control_id.localeCompare(b.control_id)),
    sbs_version: library.sbs_version,
    engine_version: ENGINE_VERSION,
  };
}

function buildResult(
  control: Control,
  status: ControlScoreResult['status'],
  findings: string[],
  confidence: ControlScoreResult['confidence'],
  evidence_used: ControlScoreResult['evidence_used'],
): ControlScoreResult {
  return {
    control_id: control.id,
    category: control.category,
    risk_level: control.risk_level,
    weight: control.hellomavens_enrichments.weight,
    status,
    confidence,
    evidence_used,
    findings,
  };
}
