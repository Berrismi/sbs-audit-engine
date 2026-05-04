// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/int-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

// Existing 4-case attestation contract (questionnaire-only path stays
// unchanged after the CLI extension lands).
describeBooleanEvaluator({
  controlId: 'SBS-INT-002',
  questionId: 'Q-INT-002',
  evaluate,
});

// Phase 5 Block E.1: SOQL evidence path tests.
describe('SBS-INT-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-INT-002');

  it('returns pass with high confidence when no Remote Site Settings exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'int-002-remote-site-settings-inventory',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive with high confidence when RSS exist (justification needs out-of-band verification)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'int-002-remote-site-settings-inventory',
          rows: [{ Id: 'rss1', EndpointUrl: 'https://example.com', SiteName: 'Example' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('1 active Remote Site Setting');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-INT-002',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: 'int-002-remote-site-settings-inventory',
          rows: [],
        },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('falls back to questionnaire path when SOQL evidence has a different query_id', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'some-other-query',
          rows: [],
        },
        {
          source: 'questionnaire',
          question_id: 'Q-INT-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
