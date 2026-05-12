// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/lib/render-markdown';
import type {
  CategoryScoreOutput,
  ControlScoreResult,
  ScoredReport,
} from '@hellomavens/security-review-for-salesforce-engine';

function makeCategory(overrides: Partial<CategoryScoreOutput> = {}): CategoryScoreOutput {
  return {
    category: 'ACS',
    score: 80,
    passed_weight: 8,
    total_weight: 10,
    pass_count: 4,
    fail_count: 1,
    inconclusive_count: 0,
    na_count: 0,
    is_all_inconclusive: false,
    ...overrides,
  };
}

function makeControl(overrides: Partial<ControlScoreResult> = {}): ControlScoreResult {
  return {
    control_id: 'SBS-ACS-001',
    category: 'ACS',
    risk_level: 'High',
    weight: 3,
    status: 'pass',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: ['Inventory complete.'],
    ...overrides,
  };
}

function makeReport(overrides: Partial<ScoredReport> = {}): ScoredReport {
  return {
    overall_score: 85,
    risk_grade: 'B',
    critical_fail_count: 0,
    inconclusive_percent: 12,
    evidence_sufficiency: 'sufficient',
    by_category: [makeCategory()],
    control_results: [makeControl()],
    sbs_version: 'v0.4.1+d4304e1',
    engine_version: '0.0.0-alpha.42',
    ...overrides,
  };
}

describe('renderMarkdown', () => {
  it('produces a non-empty CommonMark string ending with a newline', () => {
    const out = renderMarkdown(makeReport(), {
      generatedAt: '2026-05-08T12:00:00Z',
      alias: 'test-org',
    });
    expect(out).toContain('# Salesforce Security Review');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('includes the scan target alias and timestamp in the header', () => {
    const out = renderMarkdown(makeReport(), {
      generatedAt: '2026-05-08T09:30:00Z',
      alias: 'client-prod',
    });
    expect(out).toContain('Scan target: `client-prod`');
    expect(out).toContain('Generated: `2026-05-08T09:30:00Z`');
  });

  it('renders a summary table with overall score, grade, and sufficiency', () => {
    const out = renderMarkdown(makeReport({ overall_score: 72, risk_grade: 'C' }));
    expect(out).toContain('| Overall score | 72 / 100 |');
    expect(out).toContain('| Risk grade | **C** |');
    expect(out).toContain('| Evidence sufficiency | sufficient |');
  });

  it('flags evidence_sufficiency=insufficient prominently in summary', () => {
    const out = renderMarkdown(
      makeReport({
        evidence_sufficiency: 'insufficient',
        inconclusive_percent: 67.5,
      }),
    );
    expect(out).toContain('**insufficient**');
    expect(out).toContain('67.5%');
  });

  it('flags critical_fail_count > 0 with C-cap explanation', () => {
    const out = renderMarkdown(
      makeReport({ critical_fail_count: 2, overall_score: 65, risk_grade: 'C' }),
    );
    expect(out).toContain('2 Critical-tier control(s) failed');
    expect(out).toContain('capped at C');
  });

  it('renders a category table with one row per category', () => {
    const out = renderMarkdown(
      makeReport({
        by_category: [
          makeCategory({ category: 'ACS', score: 80, pass_count: 4, fail_count: 1 }),
          makeCategory({ category: 'AUTH', score: 90, pass_count: 3, fail_count: 0 }),
        ],
      }),
    );
    expect(out).toContain('## By category');
    expect(out).toContain('| ACS | 80 |');
    expect(out).toContain('| AUTH | 90 |');
  });

  it('renders per-control sections grouped by category, sorted by control_id', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({ control_id: 'SBS-ACS-002', category: 'ACS' }),
          makeControl({ control_id: 'SBS-ACS-001', category: 'ACS' }),
          makeControl({ control_id: 'SBS-AUTH-001', category: 'AUTH' }),
        ],
      }),
    );
    expect(out).toContain('### ACS');
    expect(out).toContain('### AUTH');
    // ACS-001 must appear before ACS-002 in the rendered output.
    const acs001Index = out.indexOf('SBS-ACS-001');
    const acs002Index = out.indexOf('SBS-ACS-002');
    expect(acs001Index).toBeGreaterThan(0);
    expect(acs001Index).toBeLessThan(acs002Index);
  });

  it('formats each control with status / confidence / risk tier / evidence + findings', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-ACS-001',
            status: 'pass',
            confidence: 'high',
            risk_level: 'High',
            weight: 3,
            evidence_used: ['soql', 'questionnaire'],
            findings: ['All 5 admin permsets inventoried.'],
          }),
        ],
      }),
    );
    expect(out).toContain('#### SBS-ACS-001');
    expect(out).toContain('**Status**: PASS');
    expect(out).toContain('**Confidence**: high');
    expect(out).toContain('**Risk tier**: High (weight 3)');
    expect(out).toContain('**Evidence**: SOQL, questionnaire');
    expect(out).toContain('> All 5 admin permsets inventoried.');
  });

  it('renders multi-line findings as a multi-line blockquote', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            findings: ['Line one.\nLine two.', 'Second finding.'],
          }),
        ],
      }),
    );
    expect(out).toContain('> Line one.\n> Line two.');
    expect(out).toContain('> Second finding.');
  });

  it('formats EvaluatorStatus values into human-readable strings', () => {
    const cases: Array<[ControlScoreResult['status'], string]> = [
      ['pass', '**Status**: PASS'],
      ['fail', '**Status**: FAIL'],
      ['inconclusive', '**Status**: inconclusive'],
      ['na', '**Status**: not applicable'],
    ];
    for (const [status, expected] of cases) {
      const out = renderMarkdown(makeReport({ control_results: [makeControl({ status })] }));
      expect(out).toContain(expected);
    }
  });

  it('formats EvidenceSource values into human-readable strings', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            evidence_used: [
              'soql',
              'health_check_api',
              'limits_rest_api',
              'metadata_api',
              'code_analyzer',
              'questionnaire',
            ],
          }),
        ],
      }),
    );
    expect(out).toContain(
      '**Evidence**: SOQL, Health Check API, Limits REST API, Metadata API, Code Analyzer, questionnaire',
    );
  });

  it('renders "_No findings._" when a control has zero findings', () => {
    const out = renderMarkdown(makeReport({ control_results: [makeControl({ findings: [] })] }));
    expect(out).toContain('_No findings._');
  });

  it('renders "none" for evidence_used when empty', () => {
    const out = renderMarkdown(
      makeReport({ control_results: [makeControl({ evidence_used: [] })] }),
    );
    expect(out).toContain('**Evidence**: none');
  });

  it('renders "_No categories evaluated._" placeholder when by_category is empty', () => {
    const out = renderMarkdown(makeReport({ by_category: [] }));
    expect(out).toContain('## By category');
    expect(out).toContain('_No categories evaluated._');
  });

  it('renders "_No controls evaluated._" placeholder when control_results is empty', () => {
    const out = renderMarkdown(makeReport({ control_results: [] }));
    expect(out).toContain('## By control');
    expect(out).toContain('_No controls evaluated._');
  });

  it('always includes the CC-BY-SA-4.0 attribution footer', () => {
    const out = renderMarkdown(makeReport());
    expect(out).toContain('Sources & attribution');
    expect(out).toContain('Security Benchmark for Salesforce');
    expect(out).toContain('Creative Commons Attribution-ShareAlike 4.0 International');
    expect(out).toContain('CC BY-SA 4.0');
    expect(out).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('includes engine + SBS versions in the attribution footer', () => {
    const out = renderMarkdown(
      makeReport({ engine_version: '0.0.0-alpha.42', sbs_version: 'v0.4.1+abc' }),
    );
    expect(out).toContain('Engine version: `0.0.0-alpha.42`');
    expect(out).toContain('Security Benchmark for Salesforce version: `v0.4.1+abc`');
  });

  it('contains no emoji characters in the output', () => {
    // User feedback memory: no emoji unless explicitly requested.
    const out = renderMarkdown(makeReport());
    // Spot-check the typical emoji ranges that could sneak in.
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).not.toMatch(/[\u{2600}-\u{27BF}]/u);
  });

  it('uses ISO timestamp by default when generatedAt is not provided', () => {
    const out = renderMarkdown(makeReport(), { alias: 'foo' });
    expect(out).toMatch(/Generated: `\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to "unknown" alias when not provided', () => {
    const out = renderMarkdown(makeReport(), { generatedAt: '2026-05-08T00:00:00Z' });
    expect(out).toContain('Scan target: `unknown`');
  });
});

describe('renderMarkdown — respondent answer (Tier 1a)', () => {
  const registry = {
    version: 'test-1',
    sbsVersion: 'v0.4.1+d4304e1',
    sections: [{ id: 'CODE' as const, index: 3, title: 'Code security', blurb: '' }],
    questions: [
      {
        id: 'Q-CODE-004',
        section: 'CODE' as const,
        controlId: 'SBS-CODE-004',
        text: 'Have you confirmed your application logs do not contain passwords?',
        allowIdk: true,
        kind: 'boolean' as const,
      },
    ],
    skipRules: [],
  };

  it('renders a "Respondent answer" line for questionnaire-evidence controls', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-CODE-004',
            category: 'CODE',
            evidence_used: ['questionnaire'],
            status: 'inconclusive',
          }),
        ],
      }),
      {
        answers: { 'Q-CODE-004': { kind: 'idk' } },
        registry,
      },
    );
    expect(out).toContain('**Respondent answer**:');
    expect(out).toContain('Have you confirmed your application logs do not contain passwords?');
    expect(out).toContain("**I don't know**");
  });

  it('shows the Respondent answer line even when canonical evidence is non-questionnaire (cli_corroborating context)', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-CODE-004',
            category: 'CODE',
            evidence_used: ['soql'],
            status: 'inconclusive',
          }),
        ],
      }),
      {
        answers: { 'Q-CODE-004': { kind: 'boolean', value: false } },
        registry,
      },
    );
    expect(out).toContain('Respondent answer');
    expect(out).toContain('Have you confirmed your application logs do not contain passwords?');
    expect(out).toContain('**No**');
  });

  it('omits the Respondent answer line when no questionnaire question backs this control', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-ACS-001',
            category: 'ACS',
            evidence_used: ['soql'],
            status: 'pass',
          }),
        ],
      }),
      {
        answers: { 'Q-CODE-004': { kind: 'boolean', value: true } },
        registry,
      },
    );
    expect(out).not.toContain('Respondent answer');
  });

  it('omits the Respondent answer line when answers / registry are not provided', () => {
    const out = renderMarkdown(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-CODE-004',
            category: 'CODE',
            evidence_used: ['questionnaire'],
            status: 'inconclusive',
          }),
        ],
      }),
    );
    expect(out).not.toContain('Respondent answer');
  });
});
