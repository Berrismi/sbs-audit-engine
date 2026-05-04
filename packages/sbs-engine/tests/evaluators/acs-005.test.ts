// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-005';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-005',
  questionId: 'Q-ACS-005',
  evaluate,
});

describe('SBS-ACS-005 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-005');

  it('returns pass+high when no active users are on standard profiles', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'acs-005-active-users-on-standard-profiles',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns fail+high when at least one active user is on a standard profile', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'acs-005-active-users-on-standard-profiles',
          rows: [
            { Id: 'u1', Username: 'u@example.com', 'Profile.Name': 'Standard User' },
            { Id: 'u2', Username: 'm@example.com', 'Profile.Name': 'Marketing User' },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('2 active user');
  });

  it('SOQL evidence wins over questionnaire', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-005',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: 'acs-005-active-users-on-standard-profiles',
          rows: [{ Id: 'u1', Username: 'u@example.com', 'Profile.Name': 'Standard User' }],
        },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.status).toBe('fail');
  });
});
