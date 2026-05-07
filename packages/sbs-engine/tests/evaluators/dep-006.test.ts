// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/dep-006';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DEP-006',
  questionId: 'Q-DEP-006',
  evaluate,
});

describe('SBS-DEP-006 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-DEP-006');
  const CA_QUERY_ID = 'dep-006-connected-apps-without-token-expiry';
  const ECA_QUERY_ID = 'dep-006-eca-token-policies';

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

  it('flags Connected Apps with no explicit refresh-token expiry policy', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
          rows: [{ Id: '0H4xx1', Name: 'Custom CLI App' }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('1 OAuth app');
    expect(result.findings[0]).toContain('1 via ConnectedApplication (legacy)');
    expect(result.findings[0]).toContain('Custom CLI App');
    expect(result.findings[0]).toContain('no explicit refresh-token expiry policy');
  });

  it('flags ECAs with Infinite refresh token policy', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'Infinite',
              RefreshTokenValidityPeriod: 0,
              RefreshTokenValidityUnit: '0',
              SessionTimeoutInMinutes: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 OAuth app');
    expect(result.findings[0]).toContain('refresh token never expires');
  });

  it('flags ECAs with refresh-token validity exceeding 90 days (DAYS unit) - matches live ProdProksel ECA', () => {
    // Replicates the live ProdProksel finding: 8760 days = ~24 years
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
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 8760,
              RefreshTokenValidityUnit: '0',
              SessionTimeoutInMinutes: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('refresh-token validity exceeds 90 days');
    expect(result.findings[0]).toContain('8760 days');
  });

  it('converts HOURS unit to days when classifying refresh-token validity', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            // 2400 hours = 100 days → exceeds 90 → fails
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 2400,
              RefreshTokenValidityUnit: '1',
              SessionTimeoutInMinutes: null,
            },
            // 2160 hours = 90 days → on the edge, NOT > 90 → passes
            {
              Id: 'plc2',
              ExternalClientApplicationId: 'eca2',
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 2160,
              RefreshTokenValidityUnit: '1',
              SessionTimeoutInMinutes: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 OAuth app');
    expect(result.findings[0]).toContain('refresh-token validity exceeds 90 days');
  });

  it('converts MONTHS unit to days when classifying refresh-token validity', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            // 6 months = 180 days → exceeds 90 → fails
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 6,
              RefreshTokenValidityUnit: '2',
              SessionTimeoutInMinutes: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('refresh-token validity exceeds 90 days');
  });

  it('flags ECAs with session timeout exceeding 15 minutes', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 30,
              RefreshTokenValidityUnit: '0',
              SessionTimeoutInMinutes: 60,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('session timeout exceeds 15 minutes');
    expect(result.findings[0]).toContain('60 minutes');
  });

  it('does NOT flag ECAs that comply with all thresholds', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'SpecificLifetime',
              RefreshTokenValidityPeriod: 30,
              RefreshTokenValidityUnit: '0',
              SessionTimeoutInMinutes: 10,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('merges legacy CA + ECA violations into a single inventory finding', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
          rows: [{ Id: 'ca1', Name: 'Legacy App' }],
        },
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'plc1',
              ExternalClientApplicationId: 'eca1',
              RefreshTokenPolicyType: 'Infinite',
              RefreshTokenValidityPeriod: 0,
              RefreshTokenValidityUnit: '0',
              SessionTimeoutInMinutes: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 OAuth app');
    expect(result.findings[0]).toContain(
      '1 via ConnectedApplication (legacy), 1 via ExternalClientApplication',
    );
  });

  it('falls back to questionnaire low-confidence when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DEP-006',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
