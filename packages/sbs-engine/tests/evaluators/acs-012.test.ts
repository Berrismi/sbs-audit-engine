// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-012';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-012',
  questionId: 'Q-ACS-012',
  evaluate,
});

describe('SBS-ACS-012 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-012');

  it('returns fail+high when no profiles have Login Hours configured', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'acs-012-profiles-with-login-hours',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
  });

  it('returns pass+high when at least one profile has Login Hours configured', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'acs-012-profiles-with-login-hours',
          rows: [
            { Id: 'p1', Name: 'Custom: Sales User' },
            { Id: 'p2', Name: 'Custom: Service Agent' },
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('2 profile');
  });
});
