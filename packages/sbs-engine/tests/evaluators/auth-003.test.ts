// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/auth-003';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-AUTH-003',
  questionId: 'Q-AUTH-003',
  evaluate,
});

describe('SBS-AUTH-003 evaluator (Metadata API evidence path)', () => {
  const control = makeControlFixture('SBS-AUTH-003');

  function profile(opts: {
    fullName: string;
    ranges?: Array<{ startAddress: string; endAddress: string }>;
  }): Record<string, unknown> {
    return {
      fullName: opts.fullName,
      ...(opts.ranges
        ? { loginIpRanges: opts.ranges.length === 1 ? opts.ranges[0] : opts.ranges }
        : {}),
    };
  }

  it('returns inconclusive when no profile has loginIpRanges configured', () => {
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
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings[0]).toContain('No profiles have loginIpRanges configured');
  });

  it('returns pass+high when every range is below the /8 threshold', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Admin',
              ranges: [
                { startAddress: '192.168.0.0', endAddress: '192.168.255.255' }, // /16, ~65K
                { startAddress: '10.0.0.0', endAddress: '10.0.255.255' },
              ],
            }),
            profile({
              fullName: 'Integration User',
              ranges: [{ startAddress: '203.0.113.0', endAddress: '203.0.113.255' }], // /24
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('All 2 profile(s) with loginIpRanges configured');
  });

  it('returns fail+high when at least one profile has the worked-example /0 range', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Permissive Profile',
              ranges: [{ startAddress: '0.0.0.0', endAddress: '255.255.255.255' }],
            }),
            profile({
              fullName: 'Tight Profile',
              ranges: [{ startAddress: '10.0.0.0', endAddress: '10.0.0.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('1 profile(s) carry one or more overly-broad');
    expect(result.findings[0]).toContain('Permissive Profile (0.0.0.0–255.255.255.255)');
    expect(result.findings[0]).not.toContain('Tight Profile');
  });

  it('treats a single-range object (not an array) the same as a one-element array', () => {
    // jsforce returns a bare object when there's exactly one range; the
    // extractor must handle both shapes.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Lone Range Profile',
              ranges: [{ startAddress: '0.0.0.0', endAddress: '255.255.255.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
  });

  it('flags a /8-exact range as overly broad (boundary check)', () => {
    // /8 = 16,777,216 addresses. 0.0.0.0 → 0.255.255.255 covers exactly that.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Edge Profile',
              ranges: [{ startAddress: '0.0.0.0', endAddress: '0.255.255.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
  });

  it('does NOT flag a /9 range (just below the threshold)', () => {
    // /9 = 8,388,608 addresses. 0.0.0.0 → 0.127.255.255 covers exactly that.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Large But OK',
              ranges: [{ startAddress: '0.0.0.0', endAddress: '0.127.255.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('caps the offender sample at 5 with +N more', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      profile({
        fullName: `Bad Profile ${i}`,
        ranges: [{ startAddress: '0.0.0.0', endAddress: '255.255.255.255' }],
      }),
    );
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'Profile', records }],
    });
    expect(result.status).toBe('fail');
    expect(result.findings[0]).toContain('8 profile(s) carry');
    expect(result.findings[0]).toContain('Bad Profile 0');
    expect(result.findings[0]).toContain('Bad Profile 4');
    expect(result.findings[0]).not.toContain('Bad Profile 5');
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
            // Missing fullName entirely — should drop, not crash.
            { loginIpRanges: [{ startAddress: '0.0.0.0', endAddress: '255.255.255.255' }] },
            profile({
              fullName: 'Real Profile',
              ranges: [{ startAddress: '10.0.0.0', endAddress: '10.0.0.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
  });

  it('skips ranges with unparseable IP addresses without failing the profile', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Mixed Profile',
              ranges: [
                { startAddress: 'not.an.ip.addr', endAddress: '255.255.255.255' }, // unparseable
                { startAddress: '10.0.0.0', endAddress: '10.0.0.255' }, // valid + narrow
              ],
            }),
          ],
        },
      ],
    });
    // Unparseable range is dropped (returns 0 span = not overly broad);
    // valid narrow range passes; profile is not flagged.
    expect(result.status).toBe('pass');
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-003',
          answer: { kind: 'boolean', value: false },
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('low');
  });

  it('Metadata evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-003',
          answer: { kind: 'boolean', value: false },
        },
        {
          source: 'metadata_api',
          type: 'Profile',
          records: [
            profile({
              fullName: 'Tight',
              ranges: [{ startAddress: '10.0.0.0', endAddress: '10.0.0.255' }],
            }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
  });
});
