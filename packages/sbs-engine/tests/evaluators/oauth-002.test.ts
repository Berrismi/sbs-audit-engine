// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/oauth-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-OAUTH-002',
  questionId: 'Q-OAUTH-002',
  evaluate,
});

describe('SBS-OAUTH-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-OAUTH-002');
  const CA_QUERY_ID = 'oauth-002-connected-apps-without-admin-approval';
  const ECA_QUERY_ID = 'oauth-002-eca-without-admin-approval';

  it('returns pass+high when both surfaces are empty', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: CA_QUERY_ID, rows: [] },
        { source: 'soql', query: '...', query_id: ECA_QUERY_ID, rows: [] },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No Connected Apps or External Client Applications');
  });

  it('returns inconclusive+high when self-service Connected Apps exist (legacy surface)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
          rows: [
            { Id: '0H4xx1', Name: 'Custom App A' },
            { Id: '0H4xx2', Name: 'Custom App B' },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 OAuth app');
    expect(result.findings[0]).toContain('2 via ConnectedApplication (legacy)');
  });

  it('returns inconclusive+high when ECA policy configs are AllSelfAuthorized (modern surface)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: '0yOPq000000065RMAQ',
              ExternalClientApplicationId: '0xIPq0000000XyTMAU',
              PermittedUsersPolicyType: 'AllSelfAuthorized',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 OAuth app');
    expect(result.findings[0]).toContain('1 via ExternalClientApplication policy config');
  });

  it('merges both surfaces and breaks down the count when both contribute', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
          rows: [{ Id: 'ca1', Name: 'Legacy CA' }],
        },
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              PermittedUsersPolicyType: 'AllSelfAuthorized',
            },
            {
              Id: 'plc2',
              ExternalClientApplicationId: 'eca2',
              PermittedUsersPolicyType: 'AllSelfAuthorized',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('3 OAuth app');
    expect(result.findings[0]).toContain(
      '1 via ConnectedApplication (legacy), 2 via ExternalClientApplication policy config',
    );
  });

  it('falls back to questionnaire low-confidence when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-OAUTH-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
