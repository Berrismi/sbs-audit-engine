// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/cportal-003';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-CPORTAL-003',
  questionId: 'Q-CPORTAL-003',
  evaluate,
});

describe('SBS-CPORTAL-003 evaluator (Tooling SymbolTable evidence path, alpha.40)', () => {
  const control = makeControlFixture('SBS-CPORTAL-003');

  /**
   * Builds an ApexClass row with a list of (methodName, annotations) pairs,
   * matching the Tooling-API SymbolTable shape verified against loan-maven.
   */
  function classRow(
    name: string,
    methods: Array<{ method: string; annotations: string[] }>,
  ): Record<string, unknown> {
    return {
      Id: `01p${name}`,
      Name: name,
      SymbolTable: {
        methods: methods.map((m) => ({
          name: m.method,
          annotations: m.annotations.map((a) => ({ name: a })),
        })),
      },
    };
  }

  it('returns pass+high when no class has portal-exposable methods', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [
            classRow('PlainController', [{ method: 'doStuff', annotations: [] }]),
            // @IsTest doesn't count as portal-exposable
            classRow('SomeTest', [{ method: 'testIt', annotations: ['IsTest'] }]),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No unmanaged Apex classes carry');
  });

  it('returns inconclusive+high with class + method counts when @AuraEnabled methods exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [
            classRow('LoanCockpitController', [
              { method: 'getCockpitData', annotations: ['AuraEnabled'] },
              { method: 'searchContacts', annotations: ['AuraEnabled'] },
              { method: 'updateRefPartner', annotations: ['AuraEnabled'] },
            ]),
            classRow('DailyCallListController', [
              { method: 'getCallList', annotations: ['AuraEnabled'] },
            ]),
            // Non-portal class — should be excluded from output
            classRow('PlainController', [{ method: 'doStuff', annotations: [] }]),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    const finding = result.findings[0]!;
    expect(finding).toContain('2 Apex class(es) carry portal-exposable methods');
    expect(finding).toContain('4 method(s) total');
    expect(finding).toContain('@AuraEnabled (4)');
    expect(finding).toContain('LoanCockpitController');
    expect(finding).toContain('DailyCallListController');
    // PlainController has no portal annotations — must NOT be in inventory.
    expect(finding).not.toContain('PlainController');
  });

  it('counts @InvocableMethod and @RestResource alongside @AuraEnabled', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [
            classRow('A', [{ method: 'm1', annotations: ['AuraEnabled'] }]),
            classRow('B', [{ method: 'm2', annotations: ['InvocableMethod'] }]),
            classRow('C', [{ method: 'm3', annotations: ['RestResource'] }]),
          ],
        },
      ],
    });
    const finding = result.findings[0]!;
    expect(finding).toContain('@AuraEnabled (1)');
    expect(finding).toContain('@InvocableMethod (1)');
    expect(finding).toContain('@RestResource (1)');
    expect(finding).toContain('3 Apex class(es)');
  });

  it('caps the top-classes sample at 5 with "+N more class(es)" tail', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      classRow(`Cls${i}`, [{ method: 'm', annotations: ['AuraEnabled'] }]),
    );
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows,
        },
      ],
    });
    const finding = result.findings[0]!;
    expect(finding).toContain('8 Apex class(es)');
    expect(finding).toContain('(+3 more class(es))');
  });

  it('tolerates missing/null SymbolTable defensively (compile errors, etc.)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [
            { Id: '01p1', Name: 'BrokenClass', SymbolTable: null },
            { Id: '01p2', Name: 'NoTableClass' }, // no SymbolTable field at all
            classRow('GoodClass', [{ method: 'm', annotations: ['AuraEnabled'] }]),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 Apex class(es)');
    expect(result.findings[0]).toContain('GoodClass');
  });

  it('skips methods missing annotations array or non-string annotation names', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [
            {
              Id: '01p1',
              Name: 'Mixed',
              SymbolTable: {
                methods: [
                  { name: 'm1', annotations: [{ name: 'AuraEnabled' }] }, // valid
                  { name: 'm2' }, // no annotations array
                  { name: 'm3', annotations: [{ noName: 'oops' }] }, // bad annotation shape
                  { name: 'm4', annotations: 'not an array' }, // wrong type
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 Apex class(es)');
    expect(result.findings[0]).toContain('1 method(s) total');
  });

  it('falls back to questionnaire when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-003',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-003',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'soql',
          query: '...',
          query_id: 'cportal-003-portal-exposable-apex-inventory',
          rows: [classRow('A', [{ method: 'm', annotations: ['AuraEnabled'] }])],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
