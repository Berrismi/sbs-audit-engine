// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/int-003';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-INT-003',
  questionId: 'Q-INT-003',
  evaluate,
});

describe('SBS-INT-003 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-INT-003');

  it('returns pass with high confidence when no Named Credentials exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'int-003-named-credentials-inventory',
          rows: [],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive with high confidence when NCs exist (justification verification deferred)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'int-003-named-credentials-inventory',
          rows: [
            {
              Id: 'nc1',
              MasterLabel: 'Salesforce Public',
              Endpoint: 'https://login.salesforce.com',
            },
            { Id: 'nc2', MasterLabel: 'External API', Endpoint: 'https://api.example.com' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('2 Named Credential');
  });
});
