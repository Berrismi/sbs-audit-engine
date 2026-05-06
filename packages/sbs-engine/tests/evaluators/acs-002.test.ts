// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-002',
  questionId: 'Q-ACS-002',
  evaluate,
});

describe('SBS-ACS-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-002');
  const QUERY_ID = 'acs-002-api-enabled-via-permsets';

  it('returns pass+high when no active users are granted API Enabled via permset', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });

  it('returns inconclusive+high when API-Enabled assignments are inventoried', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              AssigneeId: '005xx',
              'Assignee.Username': 'sample.integration@example.com',
              'PermissionSet.Label': 'Integration API',
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('1 active user-permset assignment');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-002',
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
          question_id: 'Q-ACS-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
