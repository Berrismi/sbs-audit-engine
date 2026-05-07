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
  const CA_QUERY_ID = 'oauth-001-ad-hoc-connected-apps';
  const ECA_QUERY_ID = 'oauth-001-ad-hoc-external-client-apps';

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
    expect(result.findings[0]).toContain('No ad-hoc');
  });

  it('returns fail+high when ad-hoc Connected Apps exist (legacy surface only)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
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
    expect(result.findings[0]).toContain('3 ad-hoc OAuth app');
    expect(result.findings[0]).toContain('3 via ConnectedApplication (legacy)');
    expect(result.findings[0]).toContain(
      'Sample: Internal Reports App, Manual Sync App, Test Integration',
    );
  });

  it('returns fail+high when ad-hoc ECAs exist (modern surface only)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: '0xIPq0000000XyTMAU',
              MasterLabel: 'Wengrow CRM Sync',
              DeveloperName: 'Wengrow_CRM_Sync',
              NamespacePrefix: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.findings[0]).toContain('1 ad-hoc OAuth app');
    expect(result.findings[0]).toContain('1 via ExternalClientApplication');
    expect(result.findings[0]).toContain('Sample: Wengrow CRM Sync');
  });

  it('merges both surfaces and breaks down the count when both contribute', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: CA_QUERY_ID,
          rows: [{ Id: 'ca1', Name: 'Legacy App', NamespacePrefix: null }],
        },
        {
          source: 'soql',
          query: '...',
          query_id: ECA_QUERY_ID,
          rows: [
            {
              Id: 'eca1',
              MasterLabel: 'Modern ECA',
              DeveloperName: 'Modern_ECA',
              NamespacePrefix: null,
            },
            {
              Id: 'eca2',
              MasterLabel: 'Another ECA',
              DeveloperName: 'Another_ECA',
              NamespacePrefix: null,
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.findings[0]).toContain('3 ad-hoc OAuth app');
    expect(result.findings[0]).toContain(
      '1 via ConnectedApplication (legacy), 2 via ExternalClientApplication',
    );
  });

  it('falls back to questionnaire low-confidence when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-OAUTH-001',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
