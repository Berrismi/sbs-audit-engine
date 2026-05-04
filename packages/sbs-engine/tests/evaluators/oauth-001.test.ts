// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/oauth-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-OAUTH-001',
  questionId: 'Q-OAUTH-001',
  evaluate,
});

describe('SBS-OAUTH-001 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-OAUTH-001');

  it('returns pass+high when no ad-hoc Connected Apps exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'oauth-001-ad-hoc-connected-apps',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns fail+high when ad-hoc Connected Apps exist (rows with null NamespacePrefix)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'oauth-001-ad-hoc-connected-apps',
          rows: [
            { Id: 'ca1', Name: 'Internal Reports App', NamespacePrefix: null },
            { Id: 'ca2', Name: 'Manual Sync App', NamespacePrefix: null },
            { Id: 'ca3', Name: 'Test Integration', NamespacePrefix: null },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('3 ad-hoc Connected App');
  });
});
