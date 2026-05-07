// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/data-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DATA-002',
  questionId: 'Q-DATA-002',
  evaluate,
});

describe('SBS-DATA-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-DATA-002');
  const QUERY_ID = 'data-002-lta-rich-text-field-inventory';

  it('returns pass+high when no entity has any LTA/Rich Text field', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            // Both entities returned by the bare SOQL but neither has any
            // LTA/Rich field in the subquery.
            { QualifiedApiName: 'Account', Fields: { records: [] } },
            { QualifiedApiName: 'Contact', Fields: { records: [] } },
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain(
      'No Long Text Area or Rich Text Area fields exist on any customizable entity',
    );
  });

  it('returns pass+high when the SOQL returns 0 entity rows at all', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('returns inconclusive+high with entity + field counts when ≥1 LTA/Rich field is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            {
              QualifiedApiName: 'Account',
              Fields: {
                records: [{ QualifiedApiName: 'Description', DataType: 'Long Text Area(32000)' }],
              },
            },
            {
              QualifiedApiName: 'EmailMessage',
              Fields: {
                records: [
                  { QualifiedApiName: 'TextBody', DataType: 'Long Text Area(32000)' },
                  { QualifiedApiName: 'HtmlBody', DataType: 'Rich Text Area(32000)' },
                  { QualifiedApiName: 'Subject', DataType: 'Long Text Area(3000)' },
                ],
              },
            },
            // Entity with 0 matches — should be excluded from rollup.
            { QualifiedApiName: 'Asset', Fields: { records: [] } },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('4 Long Text Area / Rich Text Area field(s) inventoried');
    expect(result.findings[0]).toContain('across 2 entity(ies)');
    // EmailMessage (3) should be listed before Account (1) — sort by count desc.
    expect(result.findings[0]).toContain('EmailMessage (3)');
    expect(result.findings[0]).toContain('Account (1)');
    expect(result.findings[0]).not.toContain('Asset');
    const finding = result.findings[0]!;
    const emailIdx = finding.indexOf('EmailMessage');
    const accountIdx = finding.indexOf('Account');
    expect(emailIdx).toBeLessThan(accountIdx);
  });

  it('caps the named entity list at 5 with +N more summary', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      QualifiedApiName: `Custom${i}__c`,
      Fields: {
        records: [{ QualifiedApiName: 'Notes__c', DataType: 'Long Text Area(32000)' }],
      },
    }));
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('8 Long Text Area / Rich Text Area field(s)');
    expect(result.findings[0]).toContain('across 8 entity(ies)');
    // 8 entities, all tied at 1 field each → alphabetical sort → first 5 = Custom0..Custom4
    expect(result.findings[0]).toContain('Custom0__c (1)');
    expect(result.findings[0]).toContain('Custom4__c (1)');
    expect(result.findings[0]).not.toContain('Custom5__c (1)');
    expect(result.findings[0]).toContain('(+3 more)');
  });

  it('handles partial-shape rows defensively (missing Fields container, missing QualifiedApiName)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            // Missing QualifiedApiName entirely — drop.
            { Fields: { records: [{ QualifiedApiName: 'Foo', DataType: 'Long Text Area(100)' }] } },
            // Missing Fields container — drop.
            { QualifiedApiName: 'Lead' },
            // Fields container present but records is not an array — drop.
            { QualifiedApiName: 'Opportunity', Fields: { records: 'oops' } },
            // Valid shape — keep.
            {
              QualifiedApiName: 'Case',
              Fields: {
                records: [{ QualifiedApiName: 'Description', DataType: 'Long Text Area(32000)' }],
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 Long Text Area / Rich Text Area field(s)');
    expect(result.findings[0]).toContain('across 1 entity(ies)');
    expect(result.findings[0]).toContain('Case (1)');
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DATA-002',
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
          question_id: 'Q-DATA-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });
});
