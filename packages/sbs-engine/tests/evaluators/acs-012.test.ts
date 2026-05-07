// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/acs-012';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-ACS-012',
  questionId: 'Q-ACS-012',
  evaluate,
});

describe('SBS-ACS-012 evaluator (Metadata API evidence path)', () => {
  const control = makeControlFixture('SBS-ACS-012');

  function profile(opts: {
    fullName: string;
    /** Pass undefined to omit the loginHours element entirely (the canonical
     * "no login hours configured" shape Salesforce serializes). Pass an
     * object literal to set specific day*Start/day*End values. */
    loginHours?: Record<string, string | number>;
  }): Record<string, unknown> {
    const r: Record<string, unknown> = { fullName: opts.fullName };
    if (opts.loginHours) {
      r['loginHours'] = opts.loginHours;
    }
    return r;
  }

  it('returns inconclusive when no Profile records are present', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No Profile metadata available');
  });

  it('returns fail+high when no inspected Profile has Login Hours configured', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [profile({ fullName: 'Standard User' }), profile({ fullName: 'Admin' })],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings[0]).toContain('Inspected 2 Profile(s); none have Login Hours');
  });

  it('returns pass+high when at least one Profile has Login Hours configured', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({ fullName: 'Standard User' }),
            profile({
              fullName: 'Custom: Sales User',
              loginHours: { mondayStart: '360', mondayEnd: '1380' },
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings[0]).toContain('1 of 2 Profile(s) have Login Hours');
    expect(result.findings[0]).toContain('Custom: Sales User');
  });

  it('treats numeric loginHours values (not just strings) as configured', () => {
    // Defensive: jsforce typically returns string values, but a future
    // serializer change could emit numbers. Either should count.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [profile({ fullName: 'Numeric Profile', loginHours: { mondayStart: 360 } })],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.findings[0]).toContain('1 of 1');
  });

  it('treats empty-string day*Start values as not configured', () => {
    // Edge case: platform serializes a present-but-empty loginHours object.
    // Treat it as no configuration (consistent with the human reading of
    // "an empty form is not a configured policy").
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Empty Profile',
              loginHours: { mondayStart: '', mondayEnd: '' },
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
  });

  it('detects any of the 14 documented day*Start/day*End fields', () => {
    // Spot-check that fields beyond mondayStart trigger detection.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [profile({ fullName: 'Sunday Profile', loginHours: { sundayEnd: '1080' } })],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('caps the configured-Profile sample at 5 with +N more', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      profile({ fullName: `Restricted ${i}`, loginHours: { mondayStart: '360' } }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records }],
    });
    expect(result.findings[0]).toContain('8 of 8 Profile(s)');
    expect(result.findings[0]).toContain('Restricted 0');
    expect(result.findings[0]).toContain('Restricted 4');
    expect(result.findings[0]).not.toContain('Restricted 5');
    expect(result.findings[0]).toContain('(+3 more profile(s))');
  });

  it('skips records missing fullName defensively', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            { loginHours: { mondayStart: '360' } }, // No fullName — drops, doesn't crash
            profile({ fullName: 'Real Profile' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-ACS-012',
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
          question_id: 'Q-ACS-012',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [profile({ fullName: 'X', loginHours: { mondayStart: '360' } })],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
  });
});
