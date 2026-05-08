// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { parseCodeAnalyzerOutput } from '../../src/code-analyzer/parse';

// Helper that builds a v5.x-shaped violation from minimal inputs.
function v5Violation(opts: {
  engine?: string;
  rule?: string;
  severity?: number | string;
  file?: string;
  line?: number;
  message?: string;
  primaryIdx?: number;
  extraLocations?: Array<{ file: string; startLine: number }>;
}): Record<string, unknown> {
  const locations: Array<{ file: string; startLine: number }> = [
    ...(opts.file !== undefined && opts.line !== undefined
      ? [{ file: opts.file, startLine: opts.line }]
      : []),
    ...(opts.extraLocations ?? []),
  ];
  return {
    engine: opts.engine ?? 'pmd',
    rule: opts.rule ?? 'r',
    severity: opts.severity ?? 3,
    tags: ['Recommended'],
    locations,
    primaryLocationIndex: opts.primaryIdx ?? 0,
    message: opts.message ?? 'm',
  };
}

describe('parseCodeAnalyzerOutput', () => {
  it('parses a well-formed Code Analyzer v5 JSON result into normalized findings', () => {
    const raw = {
      version: '5.12.0',
      violations: [
        v5Violation({
          engine: 'pmd',
          rule: 'ApexCSRF',
          severity: 3,
          file: '/abs/MyController.cls',
          line: 42,
          message: 'CSRF protection missing on POST handler',
        }),
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toEqual({
      rule: 'ApexCSRF',
      severity: 'Moderate',
      file: '/abs/MyController.cls',
      line: 42,
      message: 'CSRF protection missing on POST handler',
    });
  });

  it('normalizes numeric severity (1-5) to named bands (Critical-Info)', () => {
    const raw = {
      violations: [1, 2, 3, 4, 5].map((sev) =>
        v5Violation({ rule: `r${sev}`, severity: sev, file: 'a', line: 1 }),
      ),
    };

    const parsed = parseCodeAnalyzerOutput(raw);

    expect(parsed.findings.map((f) => f.severity)).toEqual([
      'Critical',
      'High',
      'Moderate',
      'Low',
      'Info',
    ]);
  });

  it('accepts already-named severity strings (forward-compat with future schemas)', () => {
    const raw = {
      violations: [
        v5Violation({
          engine: 'sfge',
          rule: 'ApexFlsViolation',
          severity: 'High',
          file: 'a.cls',
          line: 1,
        }),
      ],
    };

    expect(parseCodeAnalyzerOutput(raw).findings[0]?.severity).toBe('High');
  });

  it('falls back to Info when severity is unknown / invalid (defensive against API drift)', () => {
    const raw = {
      violations: [v5Violation({ rule: 'r', severity: 99, file: 'a', line: 1 })],
    };

    expect(parseCodeAnalyzerOutput(raw).findings[0]?.severity).toBe('Info');
  });

  it('returns engine string from the first finding (or "code-analyzer" if no findings)', () => {
    expect(parseCodeAnalyzerOutput({ violations: [] }).engine).toBe('code-analyzer');
    expect(
      parseCodeAnalyzerOutput({
        violations: [v5Violation({ engine: 'pmd', file: 'a', line: 1 })],
      }).engine,
    ).toBe('pmd');
  });

  it('returns an empty findings array when violations is empty', () => {
    expect(parseCodeAnalyzerOutput({ violations: [] }).findings).toEqual([]);
  });

  it('throws when given a malformed input that has no `violations` array', () => {
    expect(() => parseCodeAnalyzerOutput({})).toThrow(/violations/);
    expect(() => parseCodeAnalyzerOutput(null)).toThrow();
    expect(() => parseCodeAnalyzerOutput('not even json')).toThrow();
  });

  it('skips findings missing required fields (rule, file, line) rather than crashing', () => {
    const raw = {
      violations: [
        v5Violation({ rule: 'good-rule', severity: 2, file: 'a.cls', line: 5 }),
        // Missing locations entirely → skipped
        { engine: 'pmd', rule: 'no-loc', severity: 2, message: 'm', tags: [] },
        // Missing rule → skipped (file/line present)
        {
          engine: 'pmd',
          severity: 2,
          tags: [],
          locations: [{ file: 'a.cls', startLine: 1 }],
          primaryLocationIndex: 0,
          message: 'm',
        },
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.rule).toBe('good-rule');
  });

  it('uses primaryLocationIndex to pick the canonical location when multiple are present', () => {
    // sfge violations frequently emit multiple locations (call site + sink);
    // primaryLocationIndex points to the one that should appear in reports.
    const raw = {
      violations: [
        v5Violation({
          rule: 'ApexFlsViolation',
          file: '/expected.cls',
          line: 100,
          extraLocations: [{ file: '/other.cls', startLine: 50 }],
          primaryIdx: 0,
        }),
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);
    expect(parsed.findings[0]?.file).toBe('/expected.cls');
    expect(parsed.findings[0]?.line).toBe(100);
  });

  it('falls back to locations[0] when primaryLocationIndex is missing or out of range', () => {
    const raw = {
      violations: [
        // No primaryLocationIndex
        {
          engine: 'pmd',
          rule: 'r',
          severity: 2,
          tags: [],
          locations: [{ file: '/a.cls', startLine: 1 }],
          message: 'm',
        },
        // primaryLocationIndex out of range
        {
          engine: 'pmd',
          rule: 'r2',
          severity: 2,
          tags: [],
          locations: [{ file: '/b.cls', startLine: 2 }],
          primaryLocationIndex: 99,
          message: 'm',
        },
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0]?.file).toBe('/a.cls');
    expect(parsed.findings[1]?.file).toBe('/b.cls');
  });
});
