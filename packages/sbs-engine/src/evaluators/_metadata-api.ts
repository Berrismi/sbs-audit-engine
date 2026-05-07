// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Internal helper for Metadata API-driven evaluators (Phase 3c Track B
// foundation). Mirrors the shape of `cliAttestationEvaluator` so future
// metadata-driven controls have the same authoring ergonomics as the SOQL
// path: caller writes a pure `(records) => SoqlEvaluation` function and
// gets the questionnaire fallback, confidence bumping, and source tagging
// for free.
//
// Per the Track B design review (Q1), the records shape is jsforce's
// JSONified Metadata API response — NOT raw XML. Evaluators read it as
// `Record<string, unknown>` and narrow per-control. No xml2js parser dep
// was added in the foundation PR.
//
// Underscore prefix => not exported through the package index. Per-control
// files are the public surface.

import { attestationEvaluator, type SoqlEvaluation } from './_attestation';
import type { Evaluator, Evidence } from '../types';

export interface MetadataApiAttestationConfig {
  /** Questionnaire question id this evaluator falls back to (e.g., 'Q-AUTH-003'). */
  questionId: string;
  /** Plain-English finding when the respondent attests Yes. */
  passFinding: string;
  /** Plain-English finding when the respondent attests No. */
  failFinding: string;
  /** Metadata type to filter on (e.g., 'Profile', 'SecuritySettings',
   * 'CustomObject'). Matches the `type` field on the metadata_api evidence
   * variant. */
  metadataType: string;
  /** Pure function: records → SoqlEvaluation. Records are the
   * jsforce-JSONified Metadata API response shape. Never throws; degrade
   * to inconclusive on bad data. */
  evaluateMetadata: (records: Record<string, unknown>[]) => SoqlEvaluation;
}

/**
 * Build an evaluator that prefers Metadata API evidence (high confidence)
 * matched by `metadataType`, and falls back to questionnaire attestation
 * (low confidence) when no matching metadata_api evidence is present.
 *
 * Pure: same input → same output. Never throws. The returned status is
 * carried through verbatim from `evaluateMetadata`'s SoqlEvaluation; only
 * the confidence + evidence_used fields are auto-set.
 */
export function metadataApiEvaluator(config: MetadataApiAttestationConfig): Evaluator {
  const baseAttestation = attestationEvaluator(config);
  return (input) => {
    const { evidence } = input;

    const meta = evidence.find(
      (e): e is Extract<Evidence, { source: 'metadata_api' }> =>
        e.source === 'metadata_api' && e.type === config.metadataType,
    );

    if (meta) {
      const r = config.evaluateMetadata(meta.records);
      return {
        status: r.status,
        confidence: 'high',
        evidence_used: ['metadata_api'],
        findings: r.findings,
      };
    }

    return baseAttestation(input);
  };
}
