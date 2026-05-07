// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/cportal-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-CPORTAL-002',
  questionId: 'Q-CPORTAL-002',
  evaluate,
});

describe('SBS-CPORTAL-002 evaluator (SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-CPORTAL-002');
  const QUERY_ID = 'cportal-002-guest-profile-object-permissions';

  function objectPerm(opts: {
    profileName: string;
    sobjectType: string;
    perms: ('R' | 'C' | 'E' | 'D' | 'ViewAll' | 'ModifyAll')[];
  }): Record<string, unknown> {
    return {
      Id: `0PS${opts.profileName}-${opts.sobjectType}`,
      Parent: { Profile: { Name: opts.profileName } },
      SobjectType: opts.sobjectType,
      PermissionsRead: opts.perms.includes('R'),
      PermissionsCreate: opts.perms.includes('C'),
      PermissionsEdit: opts.perms.includes('E'),
      PermissionsDelete: opts.perms.includes('D'),
      PermissionsViewAllRecords: opts.perms.includes('ViewAll'),
      PermissionsModifyAllRecords: opts.perms.includes('ModifyAll'),
    };
  }

  it('returns pass+high when 0 grants exist (no guest profile permissions)', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No object permissions granted to any Guest profile');
  });

  it('returns inconclusive+high with sample when guest grants exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            objectPerm({
              profileName: 'Site Guest User',
              sobjectType: 'Account',
              perms: ['R'],
            }),
            objectPerm({
              profileName: 'Site Guest User',
              sobjectType: 'Contact',
              perms: ['R', 'C'],
            }),
            objectPerm({
              profileName: 'Site Guest User',
              sobjectType: 'Knowledge__kav',
              perms: ['R'],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('3 object permission grant(s)');
    expect(result.findings[0]).toContain('1 guest profile(s)');
    expect(result.findings[0]).toContain('3 object type(s)');
    expect(result.findings[0]).toContain('Site Guest User / Account (R)');
    expect(result.findings[0]).toContain('Site Guest User / Contact (R,C)');
    expect(result.findings[0]).toContain('Knowledge__kav');
  });

  it('caps the grant sample at 5 with +N more', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      objectPerm({
        profileName: 'Site Guest User',
        sobjectType: `Custom${i}__c`,
        perms: ['R'],
      }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain('8 object permission grant(s)');
    expect(result.findings[0]).toContain('Custom0__c (R)');
    expect(result.findings[0]).toContain('Custom4__c (R)');
    expect(result.findings[0]).not.toContain('Custom5__c (R)');
    expect(result.findings[0]).toContain('(+3 more grant(s))');
  });

  it('captures ViewAll/ModifyAll as separate flags', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            objectPerm({
              profileName: 'Guest',
              sobjectType: 'Account',
              perms: ['R', 'ViewAll'],
            }),
            objectPerm({
              profileName: 'Guest',
              sobjectType: 'Contact',
              perms: ['ModifyAll'],
            }),
          ],
        },
      ],
    });
    expect(result.findings[0]).toContain('Guest / Account (R,ViewAll)');
    expect(result.findings[0]).toContain('Guest / Contact (ModifyAll)');
  });

  it('handles partial-shape rows defensively (missing Parent or SobjectType)', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            // Missing Parent
            { Id: '0PS1', SobjectType: 'Account', PermissionsRead: true },
            // Missing SobjectType
            { Id: '0PS2', Parent: { Profile: { Name: 'Guest' } }, PermissionsRead: true },
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 object permission grant(s)');
    expect(result.findings[0]).toContain('(unknown profile)');
    expect(result.findings[0]).toContain('(unknown object)');
  });

  it('falls back to questionnaire low-confidence when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-002',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual(['questionnaire']);
  });

  it('SOQL evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-CPORTAL-002',
          answer: { kind: 'boolean', value: true },
        },
        { source: 'soql', query: '...', query_id: QUERY_ID, rows: [] },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
