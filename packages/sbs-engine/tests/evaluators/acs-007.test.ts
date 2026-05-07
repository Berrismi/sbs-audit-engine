// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-007';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-007',
  questionId: 'Q-ACS-007',
  evaluate,
});

describe('SBS-ACS-007 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-007');
  const QUERY_ID = 'acs-007-nhi-inventory';

  it('returns pass+high when no NHI candidates are inventoried', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No active users on API-Only profiles');
  });

  it('returns inconclusive+high with row count when NHI candidates are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              Id: '005xx',
              Username: 'integration@example.com',
              Name: 'Integration User',
              UserType: 'Standard',
              Profile: { Name: 'Integration Profile' },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('1 active non-human identity candidate');
    expect(result.findings[0]).toContain('integration@example.com');
  });

  it('caps the username sample at 10 and summarizes the remainder as +N more', () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      Id: `005${i}`,
      Username: `nhi-${i}@example.com`,
      UserType: 'Standard',
    }));
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('13 active non-human identity candidate');
    expect(result.findings[0]).toContain('nhi-0@example.com');
    expect(result.findings[0]).toContain('nhi-9@example.com');
    expect(result.findings[0]).not.toContain('nhi-10@example.com');
    expect(result.findings[0]).toContain('(+3 more)');
  });

  it('omits the sample clause when no row carries a Username', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [{ Id: '005zz', UserType: 'Standard' }],
        },
      ],
    });
    expect(result.findings[0]).toContain('1 active non-human identity candidate');
    expect(result.findings[0]).not.toContain('Sample:');
    expect(result.findings[0]).not.toContain('more)');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-007',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: QUERY_ID, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('falls back to questionnaire low-confidence when SOQL evidence has different query_id', () => {
    const result = evaluate({
      control,
      evidence: [
        { source: 'soql', query: '...', query_id: 'some-other-query', rows: [] },
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-007',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
