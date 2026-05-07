// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { metadataApiEvaluator } from '../../src/evaluators/_metadata-api';
import { makeControlFixture } from '../fixtures/control';
import adminProfile from '../fixtures/metadata/admin-profile.json' with { type: 'json' };

// Reuse an existing control id for the test scaffold — the helper is
// control-agnostic, so any fixture id works. SBS-AUTH-003 is the first
// Track B control planned to use this helper (loginIpRanges).
const TEST_CONTROL_ID = 'SBS-AUTH-003';
const TEST_QUESTION_ID = 'Q-AUTH-003';

describe('metadataApiEvaluator', () => {
  const control = makeControlFixture(TEST_CONTROL_ID);

  function buildEvaluator(args?: {
    pass?: boolean;
    findings?: string[];
  }): ReturnType<typeof metadataApiEvaluator> {
    return metadataApiEvaluator({
      questionId: TEST_QUESTION_ID,
      passFinding: 'PASS_PHRASE',
      failFinding: 'FAIL_PHRASE',
      metadataType: 'Profile',
      evaluateMetadata: () => ({
        status: args?.pass ? 'pass' : 'inconclusive',
        findings: args?.findings ?? ['from metadata'],
      }),
    });
  }

  it('returns metadata-derived result with high confidence when matching evidence is present', () => {
    const evaluate = buildEvaluator({ pass: true, findings: ['no broad ranges'] });
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records: [adminProfile] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings).toEqual(['no broad ranges']);
  });

  it('skips metadata_api evidence with non-matching type and falls back', () => {
    const evaluate = buildEvaluator();
    const result = evaluate({
      control,
      evidence: [
        { source: 'metadata_api', type: 'CustomObject', records: [{ fullName: 'Account' }] },
        {
          source: 'questionnaire',
          question_id: TEST_QUESTION_ID,
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    // No matching Profile metadata → questionnaire fallback at low confidence.
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const evaluate = buildEvaluator();
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: TEST_QUESTION_ID,
          answer: { kind: 'boolean', value: false },
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('low');
    expect(result.findings).toEqual(['FAIL_PHRASE']);
  });

  it('returns inconclusive when neither metadata nor questionnaire evidence is present', () => {
    const evaluate = buildEvaluator();
    const result = evaluate({ control, evidence: [] });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });

  it('Metadata evidence wins over questionnaire when both are present', () => {
    const evaluate = buildEvaluator({ pass: false, findings: ['ranges too broad'] });
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: TEST_QUESTION_ID,
          answer: { kind: 'boolean', value: true },
        },
        { source: 'metadata_api', type: 'Profile', records: [adminProfile] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings).toEqual(['ranges too broad']);
  });

  it('passes records through to the evaluateMetadata callback verbatim', () => {
    const seen: Record<string, unknown>[][] = [];
    const evaluate = metadataApiEvaluator({
      questionId: TEST_QUESTION_ID,
      passFinding: 'pass',
      failFinding: 'fail',
      metadataType: 'Profile',
      evaluateMetadata: (records) => {
        seen.push(records);
        return { status: 'pass', findings: ['ok'] };
      },
    });
    const records = [{ fullName: 'Admin', loginIpRanges: [] }];
    evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records }],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(records);
  });
});
