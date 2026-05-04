// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { parseCodeAnalyzerOutput } from '../../src/code-analyzer/parse';

describe('parseCodeAnalyzerOutput', () => {
  it('parses a well-formed Code Analyzer v5 JSON result into normalized findings', () => {
    const raw = {
      version: '5.12.0',
      results: [
        {
          engine: 'pmd',
          rule: 'ApexCSRF',
          severity: 3,
          primaryLocation: { file: '/abs/MyController.cls', startLine: 42 },
          message: 'CSRF protection missing on POST handler',
        },
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
      results: [
        {
          engine: 'pmd',
          rule: 'r1',
          severity: 1,
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
        {
          engine: 'pmd',
          rule: 'r2',
          severity: 2,
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
        {
          engine: 'pmd',
          rule: 'r3',
          severity: 3,
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
        {
          engine: 'pmd',
          rule: 'r4',
          severity: 4,
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
        {
          engine: 'pmd',
          rule: 'r5',
          severity: 5,
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
      ],
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

  it('accepts already-named severity strings (forward-compat with future Code Analyzer schemas)', () => {
    const raw = {
      results: [
        {
          engine: 'sfge',
          rule: 'ApexFlsViolation',
          severity: 'High',
          primaryLocation: { file: 'a.cls', startLine: 1 },
          message: 'm',
        },
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);

    expect(parsed.findings[0]?.severity).toBe('High');
  });

  it('falls back to Info when severity is unknown / invalid (defensive against API drift)', () => {
    const raw = {
      results: [
        {
          engine: 'pmd',
          rule: 'r',
          severity: 99, // out of 1-5 range
          primaryLocation: { file: 'a', startLine: 1 },
          message: 'm',
        },
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);

    expect(parsed.findings[0]?.severity).toBe('Info');
  });

  it('returns engine string from the first finding (or "code-analyzer" if no findings)', () => {
    expect(parseCodeAnalyzerOutput({ results: [] }).engine).toBe('code-analyzer');
    expect(
      parseCodeAnalyzerOutput({
        results: [
          {
            engine: 'pmd',
            rule: 'r',
            severity: 1,
            primaryLocation: { file: 'a', startLine: 1 },
            message: 'm',
          },
        ],
      }).engine,
    ).toBe('pmd');
  });

  it('returns an empty findings array when results is empty', () => {
    const parsed = parseCodeAnalyzerOutput({ results: [] });
    expect(parsed.findings).toEqual([]);
  });

  it('throws when given a malformed input that has no `results` array', () => {
    expect(() => parseCodeAnalyzerOutput({})).toThrow(/results/);
    expect(() => parseCodeAnalyzerOutput(null)).toThrow();
    expect(() => parseCodeAnalyzerOutput('not even json')).toThrow();
  });

  it('skips findings missing required fields (rule, file, line) rather than crashing', () => {
    const raw = {
      results: [
        // good
        {
          engine: 'pmd',
          rule: 'good-rule',
          severity: 2,
          primaryLocation: { file: 'a.cls', startLine: 5 },
          message: 'm',
        },
        // missing primaryLocation
        { engine: 'pmd', rule: 'no-loc', severity: 2, message: 'm' },
        // missing rule
        {
          engine: 'pmd',
          severity: 2,
          primaryLocation: { file: 'a.cls', startLine: 1 },
          message: 'm',
        },
      ],
    };

    const parsed = parseCodeAnalyzerOutput(raw);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.rule).toBe('good-rule');
  });
});
