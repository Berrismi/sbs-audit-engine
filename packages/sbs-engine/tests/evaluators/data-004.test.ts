// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/data-004';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DATA-004',
  questionId: 'Q-DATA-004',
  evaluate,
});

describe('SBS-DATA-004 evaluator (Metadata API evidence path)', () => {
  const control = makeControlFixture('SBS-DATA-004');

  function customObject(opts: {
    fullName: string;
    enableHistory?: boolean;
    fields?: Array<{ fullName: string; trackHistory?: boolean }>;
  }): Record<string, unknown> {
    const r: Record<string, unknown> = { fullName: opts.fullName };
    if (opts.enableHistory !== undefined) r['enableHistory'] = opts.enableHistory;
    if (opts.fields) r['fields'] = opts.fields;
    return r;
  }

  it('returns inconclusive when no CustomObject records are present', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'CustomObject', records: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No CustomObject metadata');
  });

  it('returns inconclusive when zero objects have enableHistory=true', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            customObject({ fullName: 'Account' }),
            customObject({ fullName: 'Contact', enableHistory: false }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('0 of 2 CustomObject(s) inspected have Field History');
    expect(result.findings[0]).toContain('intentionally absent or pending configuration');
  });

  it('flags misconfig when objects have enableHistory but zero tracked fields', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            customObject({
              fullName: 'Account',
              enableHistory: true,
              fields: [{ fullName: 'Notes__c' }, { fullName: 'CustomNote__c' }],
            }),
            customObject({
              fullName: 'Contact',
              enableHistory: true,
              fields: [{ fullName: 'Phone' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain(
      '2 of 2 CustomObject(s) have enableHistory=true at the object level but ZERO fields',
    );
    expect(result.findings[0]).toContain('Account');
    expect(result.findings[0]).toContain('Contact');
  });

  it('reports inventory when fields have trackHistory enabled', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            customObject({
              fullName: 'Account',
              enableHistory: true,
              fields: [
                { fullName: 'Description', trackHistory: true },
                { fullName: 'AnnualRevenue', trackHistory: true },
                { fullName: 'Type', trackHistory: false },
              ],
            }),
            customObject({
              fullName: 'Contact',
              enableHistory: true,
              fields: [{ fullName: 'Phone', trackHistory: true }],
            }),
            customObject({ fullName: 'NoHistoryObj' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('3 field(s) with trackHistory enabled');
    expect(result.findings[0]).toContain('across 2 of 3 CustomObject(s)');
    // Account (2 tracked fields) sorted before Contact (1) in the breakdown.
    expect(result.findings[0]).toContain('Account (2)');
    expect(result.findings[0]).toContain('Contact (1)');
    const accountIdx = result.findings[0]!.indexOf('Account');
    const contactIdx = result.findings[0]!.indexOf('Contact');
    expect(accountIdx).toBeLessThan(contactIdx);
  });

  it('handles single-field shape (jsforce one-element form)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            {
              fullName: 'OneFieldObject',
              enableHistory: true,
              // jsforce returns a bare object when there's exactly one field.
              fields: { fullName: 'Lone__c', trackHistory: true },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 field(s) with trackHistory enabled');
  });

  it('caps the inventory sample at 5 with +N more', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      customObject({
        fullName: `Object_${i}__c`,
        enableHistory: true,
        fields: [{ fullName: 'Tracked__c', trackHistory: true }],
      }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'CustomObject', records }],
    });
    expect(result.findings[0]).toContain('8 field(s) with trackHistory');
    expect(result.findings[0]).toContain('Object_0__c (1)');
    expect(result.findings[0]).toContain('Object_4__c (1)');
    expect(result.findings[0]).not.toContain('Object_5__c (1)');
    expect(result.findings[0]).toContain('(+3 more object(s))');
  });

  it('skips records missing fullName defensively', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            // No fullName — drop, don't crash.
            { enableHistory: true, fields: [{ trackHistory: true }] },
            customObject({
              fullName: 'Real',
              enableHistory: true,
              fields: [{ fullName: 'F', trackHistory: true }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 field(s) with trackHistory');
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DATA-004',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
  });

  it('Metadata evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-DATA-004',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'metadata_api',
          type: 'CustomObject',
          records: [
            customObject({
              fullName: 'Account',
              enableHistory: true,
              fields: [{ fullName: 'F', trackHistory: true }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
  });
});
