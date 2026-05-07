// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/auth-002';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-AUTH-002',
  questionId: 'Q-AUTH-002',
  evaluate,
});

describe('SBS-AUTH-002 evaluator (Metadata API evidence path)', () => {
  const control = makeControlFixture('SBS-AUTH-002');

  function profile(opts: {
    fullName: string;
    /** When omitted, the userPermissions field is absent (which matches
     * the jsforce serialization for a Profile with zero enabled
     * permissions). */
    userPermissions?: Array<{ name: string; enabled: boolean }>;
  }): Record<string, unknown> {
    const r: Record<string, unknown> = { fullName: opts.fullName };
    if (opts.userPermissions) {
      // jsforce returns a single-object shape when there's exactly one
      // permission, an array otherwise. The evaluator handles both —
      // pick array shape for consistency in tests.
      r['userPermissions'] = opts.userPermissions;
    }
    return r;
  }

  const PERMS_WITHOUT_SSO = [
    { name: 'ViewAllData', enabled: true },
    { name: 'ManageUsers', enabled: true },
  ];
  const PERMS_WITH_SSO = [
    { name: 'IsSsoEnabled', enabled: true },
    { name: 'ViewAllData', enabled: true },
  ];

  it('returns inconclusive when no Profile records are present', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No Profile metadata available');
  });

  it('returns pass+high when every Profile enforces IsSsoEnabled', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({ fullName: 'Standard User', userPermissions: PERMS_WITH_SSO }),
            profile({ fullName: 'Admin', userPermissions: PERMS_WITH_SSO }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings[0]).toContain('All 2 Profile(s) inspected enforce SSO');
  });

  it('flags Profiles missing the IsSsoEnabled permission as bypass-capable', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({ fullName: 'Standard User', userPermissions: PERMS_WITH_SSO }),
            profile({ fullName: 'Integration User', userPermissions: PERMS_WITHOUT_SSO }),
            // Missing userPermissions entirely → effectively no IsSsoEnabled.
            profile({ fullName: 'Bare Profile' }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('2 of 3 Profile(s) do NOT enforce IsSsoEnabled');
    expect(result.findings[0]).toContain('Bare Profile');
    expect(result.findings[0]).toContain('Integration User');
    expect(result.findings[0]).not.toContain('Standard User');
  });

  it('treats IsSsoEnabled with enabled=false as bypass-capable', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Disabled SSO Profile',
              userPermissions: [{ name: 'IsSsoEnabled', enabled: false }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('1 of 1 Profile(s) do NOT enforce IsSsoEnabled');
    expect(result.findings[0]).toContain('Disabled SSO Profile');
  });

  it('handles single-object userPermissions (not an array) correctly', () => {
    // jsforce returns a bare object when there's exactly one permission;
    // the evaluator must accept that shape.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            { fullName: 'Single Perm', userPermissions: { name: 'IsSsoEnabled', enabled: true } },
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('caps the bypass-sample at 5 with +N more', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      profile({ fullName: `Bypass Profile ${i}`, userPermissions: PERMS_WITHOUT_SSO }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records }],
    });
    expect(result.findings[0]).toContain('8 of 8 Profile(s)');
    expect(result.findings[0]).toContain('Bypass Profile 0');
    expect(result.findings[0]).toContain('Bypass Profile 4');
    expect(result.findings[0]).not.toContain('Bypass Profile 5');
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
            // No fullName — drops, doesn't crash
            { userPermissions: PERMS_WITHOUT_SSO },
            profile({ fullName: 'Real Profile', userPermissions: PERMS_WITH_SSO }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-002',
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
          question_id: 'Q-AUTH-002',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [profile({ fullName: 'Bypass-Capable', userPermissions: PERMS_WITHOUT_SSO })],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
  });
});
