// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/file-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-FILE-001',
  questionId: 'Q-FILE-001',
  evaluate,
});

describe('SBS-FILE-001 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-FILE-001');

  it('returns pass+high when no ContentDistribution rows lack expiry', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'file-001-content-distributions-without-expiry',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns fail+high when at least one ContentDistribution row has PreferencesExpires=false', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'file-001-content-distributions-without-expiry',
          rows: [
            { Id: 'cd1', PreferencesExpires: false },
            { Id: 'cd2', PreferencesExpires: false },
            { Id: 'cd3', PreferencesExpires: false },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('3 Public Content link');
  });

  it('SOQL evidence wins over questionnaire (CLI primary semantic)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-FILE-001',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: 'file-001-content-distributions-without-expiry',
          rows: [{ Id: 'cd1', PreferencesExpires: false }],
        },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.status).toBe('fail');
  });

  it('falls back to questionnaire low-confidence when SOQL evidence is absent (edition-gate skipped)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-FILE-001',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
