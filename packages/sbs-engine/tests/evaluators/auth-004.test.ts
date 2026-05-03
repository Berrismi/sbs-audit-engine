// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/auth-004';
import { describeBooleanEvaluator } from './_shared';
import { makeControlFixture } from '../fixtures/control';

describeBooleanEvaluator({
  controlId: 'SBS-AUTH-004',
  questionId: 'Q-AUTH-004',
  evaluate,
});

describe('SBS-AUTH-004 risk-level override (Block A)', () => {
  it('loads with risk_level=Critical and weight=5 from the override file', () => {
    const control = makeControlFixture('SBS-AUTH-004');
    expect(control.risk_level).toBe('Critical');
    expect(control.hellomavens_enrichments.weight).toBe(5);
  });
});
