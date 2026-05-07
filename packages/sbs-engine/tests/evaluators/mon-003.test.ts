// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/mon-003';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-MON-003',
  questionId: 'Q-MON-003',
  evaluate,
});

describe('SBS-MON-003 evaluator (Tooling SOQL evidence path)', () => {
  const control = makeControlFixture('SBS-MON-003');
  const QUERY_ID = 'mon-003-transaction-security-policies';

  function tsp(opts: {
    developerName: string;
    eventType: string;
    state?: string;
  }): Record<string, unknown> {
    return {
      Id: `0DR000${opts.developerName}`,
      DeveloperName: opts.developerName,
      MasterLabel: opts.developerName,
      EventType: opts.eventType,
      State: opts.state ?? 'Enabled',
    };
  }

  it('returns inconclusive when 0 TSPs are configured', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
    expect(result.findings[0]).toContain('No TransactionSecurityPolicy records configured');
  });

  it('returns inconclusive when TSPs exist but none target Login', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            tsp({ developerName: 'AuditTrailMonitor', eventType: 'AuditTrail' }),
            tsp({ developerName: 'DataExportMonitor', eventType: 'DataExport' }),
            tsp({ developerName: 'EntityChangeMonitor', eventType: 'Entity' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('3 TransactionSecurityPolicy(ies) configured but NONE');
    expect(result.findings[0]).toContain('AuditTrail (1)');
    expect(result.findings[0]).toContain('DataExport (1)');
    expect(result.findings[0]).toContain('Entity (1)');
  });

  it('returns inconclusive+high with login-policy sample when Login TSPs exist', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            tsp({ developerName: 'SuspiciousLoginAlert', eventType: 'Login', state: 'Enabled' }),
            tsp({ developerName: 'OffHoursLogin', eventType: 'Login', state: 'Disabled' }),
            tsp({ developerName: 'AuditTrailMonitor', eventType: 'AuditTrail' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain(
      "2 of 3 TransactionSecurityPolicy(ies) target EventType='Login'",
    );
    // Sorted alphabetically — OffHoursLogin before SuspiciousLoginAlert.
    expect(result.findings[0]).toContain('OffHoursLogin, Disabled');
    expect(result.findings[0]).toContain('SuspiciousLoginAlert, Enabled');
  });

  it('caps the login-policy sample at 5 with +N more', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      tsp({ developerName: `LoginPolicy_${i}`, eventType: 'Login' }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'soql', query: '...', query_id: QUERY_ID, rows }],
    });
    expect(result.findings[0]).toContain(
      "8 of 8 TransactionSecurityPolicy(ies) target EventType='Login'",
    );
    expect(result.findings[0]).toContain('LoginPolicy_0');
    expect(result.findings[0]).toContain('LoginPolicy_4');
    expect(result.findings[0]).not.toContain('LoginPolicy_5');
    expect(result.findings[0]).toContain('(+3 more)');
  });

  it('handles policies with missing State or DeveloperName defensively', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [
            { Id: '0DR1', EventType: 'Login' /* no DeveloperName, no State */ },
            tsp({ developerName: 'NamedPolicy', eventType: 'Login', state: 'Enabled' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('2 of 2');
    expect(result.findings[0]).toContain('(unnamed)');
    expect(result.findings[0]).toContain('NamedPolicy, Enabled');
  });

  it('counts policies with unknown EventType under (unknown) bucket', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [{ Id: '0DR1', DeveloperName: 'Mystery' /* missing EventType */ }],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('(unknown) (1)');
  });

  it('falls back to questionnaire low-confidence when no SOQL evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-MON-003',
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
          question_id: 'Q-MON-003',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'soql',
          query: '...',
          query_id: QUERY_ID,
          rows: [tsp({ developerName: 'LoginAlert', eventType: 'Login' })],
        },
      ],
    });
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['soql']);
  });
});
