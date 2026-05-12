// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { renderHtml } from '../../src/lib/render-html';
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
    engine_version: '0.0.0-alpha.44',
    ...overrides,
  };
}

describe('renderHtml — document shell', () => {
  it('produces a complete HTML document with doctype + main wrapper', () => {
    const out = renderHtml(makeReport(), {
      generatedAt: '2026-05-08T12:00:00Z',
      alias: 'test-org',
    });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<html lang="en">');
    expect(out).toContain('<main>');
    expect(out).toContain('</html>');
  });

  it('includes a <title> with the alias for browser tab + window-name UX', () => {
    const out = renderHtml(makeReport(), { alias: 'client-prod' });
    expect(out).toContain('<title>Salesforce Security Review — client-prod</title>');
  });

  it('embeds CSS in a <style> tag (no external assets)', () => {
    const out = renderHtml(makeReport());
    expect(out).toContain('<style>');
    expect(out).toContain('</style>');
    // No external stylesheets — print-to-PDF must work offline.
    expect(out).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it('includes a print stylesheet so Cmd-P produces a clean PDF', () => {
    const out = renderHtml(makeReport());
    expect(out).toContain('@media print');
  });
});

describe('renderHtml — header', () => {
  it('renders the scan alias and timestamp', () => {
    const out = renderHtml(makeReport(), {
      generatedAt: '2026-05-08T09:30:00Z',
      alias: 'client-prod',
    });
    expect(out).toContain('Scan target:');
    expect(out).toContain('<code>client-prod</code>');
    expect(out).toContain('<code>2026-05-08T09:30:00Z</code>');
  });
});

describe('renderHtml — summary', () => {
  it('renders score, grade pill, and sufficiency in a summary table', () => {
    const out = renderHtml(makeReport({ overall_score: 72, risk_grade: 'C' }));
    expect(out).toContain('72 / 100');
    expect(out).toContain('class="grade grade-c"');
    expect(out).toContain('>C</span>');
    expect(out).toContain('sufficient');
  });

  it('flags evidence_sufficiency=insufficient with a warning paragraph', () => {
    const out = renderHtml(
      makeReport({ evidence_sufficiency: 'insufficient', inconclusive_percent: 67.5 }),
    );
    expect(out).toContain('class="warn"');
    expect(out).toContain('<strong>insufficient</strong>');
    expect(out).toContain('67.5%');
  });

  it('flags critical_fail_count > 0 with a C-cap warning', () => {
    const out = renderHtml(
      makeReport({ critical_fail_count: 2, overall_score: 65, risk_grade: 'C' }),
    );
    expect(out).toContain('2 Critical-tier control(s) failed');
    expect(out).toContain('capped at C');
  });
});

describe('renderHtml — category table', () => {
  it('renders one row per category with a numeric column class for tabular alignment', () => {
    const out = renderHtml(
      makeReport({
        by_category: [
          makeCategory({ category: 'ACS', score: 80, pass_count: 4, fail_count: 1 }),
          makeCategory({ category: 'AUTH', score: 90, pass_count: 3, fail_count: 0 }),
        ],
      }),
    );
    expect(out).toContain('<table class="categories">');
    expect(out).toContain('<th scope="row">ACS</th>');
    expect(out).toContain('<th scope="row">AUTH</th>');
    expect(out).toContain('class="num">80</td>');
    expect(out).toContain('class="num">90</td>');
  });
});

describe('renderHtml — per-control sections', () => {
  it('groups controls under category headings and sorts by control_id', () => {
    const out = renderHtml(
      makeReport({
        control_results: [
          makeControl({ control_id: 'SBS-ACS-002', category: 'ACS' }),
          makeControl({ control_id: 'SBS-ACS-001', category: 'ACS' }),
          makeControl({ control_id: 'SBS-AUTH-001', category: 'AUTH' }),
        ],
      }),
    );
    expect(out).toContain('<h3>ACS</h3>');
    expect(out).toContain('<h3>AUTH</h3>');
    const i1 = out.indexOf('SBS-ACS-001');
    const i2 = out.indexOf('SBS-ACS-002');
    expect(i1).toBeGreaterThan(0);
    expect(i1).toBeLessThan(i2);
  });

  it('renders each control with status pill, confidence, risk tier, evidence, findings', () => {
    const out = renderHtml(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-ACS-001',
            status: 'pass',
            confidence: 'high',
            risk_level: 'High',
            weight: 3,
            evidence_used: ['soql', 'questionnaire'],
            findings: ['Looks good.', 'Two findings.'],
          }),
        ],
      }),
    );
    expect(out).toContain('<article class="control control-pass">');
    expect(out).toContain('class="status status-pass">PASS</span>');
    expect(out).toContain('<dd>high</dd>');
    expect(out).toContain('<dd>High (weight 3)</dd>');
    expect(out).toContain('SOQL, questionnaire');
    expect(out).toContain('<blockquote class="finding">Looks good.</blockquote>');
    expect(out).toContain('<blockquote class="finding">Two findings.</blockquote>');
  });

  it('renders an empty findings placeholder when there are no findings', () => {
    const out = renderHtml(makeReport({ control_results: [makeControl({ findings: [] })] }));
    expect(out).toContain('class="findings empty"');
    expect(out).toContain('<em>No findings.</em>');
  });

  it('renders evidence as "none" when the control has no evidence', () => {
    const out = renderHtml(makeReport({ control_results: [makeControl({ evidence_used: [] })] }));
    expect(out).toContain('<dd>none</dd>');
  });
});

describe('renderHtml — escaping', () => {
  it('HTML-escapes findings text (no XSS via the report)', () => {
    const out = renderHtml(
      makeReport({
        control_results: [
          makeControl({
            findings: ['<script>alert(1)</script>', 'Use & in queries: a & b'],
          }),
        ],
      }),
    );
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('a &amp; b');
  });

  it('HTML-escapes the alias and timestamp', () => {
    const out = renderHtml(makeReport(), {
      alias: '<a>org</a>',
      generatedAt: '2026 & 27',
    });
    expect(out).not.toContain('<a>org</a>');
    expect(out).toContain('&lt;a&gt;org&lt;/a&gt;');
    expect(out).toContain('2026 &amp; 27');
  });

  it('preserves newlines in finding text as <br> tags', () => {
    const out = renderHtml(
      makeReport({
        control_results: [makeControl({ findings: ['line one\nline two'] })],
      }),
    );
    expect(out).toContain('line one<br>line two');
  });
});

describe('renderHtml — attribution footer', () => {
  it('includes the CC-BY-SA-4.0 license link, engine version, and SBS version', () => {
    const out = renderHtml(
      makeReport({ engine_version: '0.0.0-alpha.44', sbs_version: 'v0.4.1+d4304e1' }),
    );
    expect(out).toContain('CC BY-SA 4.0');
    expect(out).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
    expect(out).toContain('Salesforce-Security-Benchmark/docs-site');
    expect(out).toContain('<code>0.0.0-alpha.44</code>');
    expect(out).toContain('<code>v0.4.1+d4304e1</code>');
  });
});

describe('renderHtml — empty edge cases', () => {
  it('handles empty by_category gracefully', () => {
    const out = renderHtml(makeReport({ by_category: [] }));
    expect(out).toContain('No categories evaluated.');
  });

  it('handles empty control_results gracefully', () => {
    const out = renderHtml(makeReport({ control_results: [] }));
    expect(out).toContain('No controls evaluated.');
  });
});

describe('renderHtml — respondent answer (Tier 1a)', () => {
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

  it('renders a "Respondent answer" row for questionnaire-evidence controls when answers are provided', () => {
    const out = renderHtml(
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
    expect(out).toContain('Respondent answer');
    expect(out).toContain('respondent-answers');
    expect(out).toContain('Have you confirmed your application logs do not contain passwords?');
    expect(out).toContain("I don&#39;t know");
  });

  it('formats boolean answers as Yes / No, not raw values', () => {
    const out = renderHtml(
      makeReport({
        control_results: [
          makeControl({
            control_id: 'SBS-CODE-004',
            category: 'CODE',
            evidence_used: ['questionnaire'],
            status: 'pass',
          }),
        ],
      }),
      {
        answers: { 'Q-CODE-004': { kind: 'boolean', value: true } },
        registry,
      },
    );
    expect(out).toContain('>Yes<');
    expect(out).not.toContain('>true<');
  });

  it('shows the Respondent answer row even when canonical evidence is non-questionnaire (cli_corroborating context)', () => {
    // For cli_corroborating controls (status reached via SOQL/Metadata) the
    // user's questionnaire answer is still high-signal context — they want
    // to see what they said alongside the SOQL-based verdict. The renderer
    // gates on "question exists for controlId + answer recorded", NOT on
    // evidence_used containing 'questionnaire'.
    const out = renderHtml(
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
    expect(out).toContain('>No<');
  });

  it('omits the Respondent answer row when no questionnaire question backs this control', () => {
    // SBS-ACS-001 has no Q-* in this test registry (only Q-CODE-004 is
    // present). No question → no respondent-answer row to render.
    const out = renderHtml(
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

  it('omits the Respondent answer row when answers / registry are not provided', () => {
    const out = renderHtml(
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
