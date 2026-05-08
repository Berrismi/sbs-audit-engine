// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Render a ScoredReport as a self-contained HTML document. Same content
// as the Markdown renderer; just packaged for browser viewing and
// print-to-PDF (Cmd-P / Ctrl-P). No external assets, no JS — the file
// opens identically online and offline.
//
// Sections mirror the Markdown renderer one-to-one:
//   1. Header                — title + scan timestamp + target alias
//   2. Summary               — overall score, grade, evidence-sufficiency banner
//   3. By category           — table of category aggregates
//   4. By control             — per-control verdicts with evidence + findings
//   5. Sources & attribution — CC-BY-SA-4.0 + engine version footer
//
// CC-BY-SA-4.0 §3(a) attribution lives in the footer so PDF exports
// carry the license + engine + SBS version automatically.

import type {
  CategoryScoreOutput,
  ControlScoreResult,
  EvaluatorStatus,
  EvidenceConfidence,
  EvidenceSource,
  ScoredReport,
} from '@hellomavens/security-review-for-salesforce-engine';

export interface RenderHtmlOptions {
  /** ISO timestamp of when the scan ran. Defaults to current time. */
  generatedAt?: string;
  /** Target org alias the scan ran against. */
  alias?: string;
}

export function renderHtml(report: ScoredReport, opts: RenderHtmlOptions = {}): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const alias = opts.alias ?? 'unknown';

  const body = [
    renderHeader(generatedAt, alias),
    renderSummary(report),
    renderCategoryTable(report.by_category),
    renderControlSections(report.control_results),
    renderAttribution(report),
  ].join('\n\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salesforce Security Review — ${escape(alias)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

// ---------- sections ----------

function renderHeader(generatedAt: string, alias: string): string {
  return `<header>
  <h1>Salesforce Security Review</h1>
  <p class="meta">Scan target: <code>${escape(alias)}</code></p>
  <p class="meta">Generated: <code>${escape(generatedAt)}</code></p>
</header>`;
}

function renderSummary(report: ScoredReport): string {
  const sufficiencyNote =
    report.evidence_sufficiency === 'sufficient'
      ? '<p>Evidence is sufficient for the headline grade to be meaningful.</p>'
      : `<p class="warn">Evidence is <strong>insufficient</strong> — over half of in-scope controls returned inconclusive (${escape(formatPercent(report.inconclusive_percent))}). The headline grade may not reflect the true posture; see per-control detail below for which controls need attestation.</p>`;

  const criticalNote =
    report.critical_fail_count > 0
      ? `<p class="warn">${report.critical_fail_count} Critical-tier control(s) failed; the overall grade is capped at C regardless of category aggregates.</p>`
      : '';

  return `<section>
  <h2>Summary</h2>
  <table class="summary">
    <tbody>
      <tr><th scope="row">Overall score</th><td>${report.overall_score} / 100</td></tr>
      <tr><th scope="row">Risk grade</th><td><span class="grade grade-${escape(report.risk_grade.toLowerCase())}">${escape(report.risk_grade)}</span></td></tr>
      <tr><th scope="row">Critical fails</th><td>${report.critical_fail_count}</td></tr>
      <tr><th scope="row">Inconclusive</th><td>${escape(formatPercent(report.inconclusive_percent))}</td></tr>
      <tr><th scope="row">Evidence sufficiency</th><td>${escape(report.evidence_sufficiency)}</td></tr>
    </tbody>
  </table>
  ${sufficiencyNote}
  ${criticalNote}
</section>`;
}

function renderCategoryTable(categories: ReadonlyArray<CategoryScoreOutput>): string {
  if (categories.length === 0) {
    return `<section><h2>By category</h2><p><em>No categories evaluated.</em></p></section>`;
  }
  const rows = categories
    .map((c) => {
      const total = c.pass_count + c.fail_count + c.inconclusive_count + c.na_count;
      return `<tr><th scope="row">${escape(c.category)}</th><td class="num">${c.score}</td><td class="num">${c.pass_count}</td><td class="num">${c.fail_count}</td><td class="num">${c.inconclusive_count}</td><td class="num">${c.na_count}</td><td class="num">${total}</td></tr>`;
    })
    .join('\n');
  return `<section>
  <h2>By category</h2>
  <table class="categories">
    <thead>
      <tr><th scope="col">Category</th><th scope="col">Score</th><th scope="col">Pass</th><th scope="col">Fail</th><th scope="col">Inconclusive</th><th scope="col">N/A</th><th scope="col">Total</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
}

function renderControlSections(controls: ReadonlyArray<ControlScoreResult>): string {
  if (controls.length === 0) {
    return `<section><h2>By control</h2><p><em>No controls evaluated.</em></p></section>`;
  }
  const byCategory = new Map<string, ControlScoreResult[]>();
  for (const c of controls) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const groups = [...byCategory.entries()]
    .sort()
    .map(([category, list]) => {
      list.sort((a, b) => a.control_id.localeCompare(b.control_id));
      const items = list.map(renderControl).join('\n');
      return `<section class="category-group">
  <h3>${escape(category)}</h3>
  ${items}
</section>`;
    })
    .join('\n');
  return `<section>
  <h2>By control</h2>
  ${groups}
</section>`;
}

function renderControl(c: ControlScoreResult): string {
  const evidenceList =
    c.evidence_used.length === 0
      ? 'none'
      : c.evidence_used.map((s) => escape(formatEvidenceSource(s))).join(', ');
  const findingsBlock =
    c.findings.length === 0
      ? '<p class="findings empty"><em>No findings.</em></p>'
      : c.findings
          .map(
            (f) => `<blockquote class="finding">${escape(f).replace(/\n/g, '<br>')}</blockquote>`,
          )
          .join('\n');
  return `<article class="control control-${escape(c.status)}">
  <h4>${escape(c.control_id)}</h4>
  <dl class="control-meta">
    <dt>Status</dt><dd><span class="status status-${escape(c.status)}">${escape(formatStatus(c.status))}</span></dd>
    <dt>Confidence</dt><dd>${escape(formatConfidence(c.confidence))}</dd>
    <dt>Risk tier</dt><dd>${escape(c.risk_level)} (weight ${c.weight})</dd>
    <dt>Evidence</dt><dd>${evidenceList}</dd>
  </dl>
  ${findingsBlock}
</article>`;
}

function renderAttribution(report: ScoredReport): string {
  return `<footer>
  <h2>Sources &amp; attribution</h2>
  <p>This report incorporates content from the <a href="https://github.com/Salesforce-Security-Benchmark/docs-site">Security Benchmark for Salesforce</a>, an open standard licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)</a>. Per the ShareAlike clause, the SBS-derived content in this report inherits the same license; if you redistribute this report, please retain this attribution.</p>
  <p>The scoring algorithm, evaluator framework, and OWASP / HIPAA / SOC 2 / ISO 27001 cross-walks are authored by HelloMavens LLC and licensed under MIT in our open-source engine at <a href="https://github.com/Berrismi/sbs-audit-engine">github.com/Berrismi/sbs-audit-engine</a>.</p>
  <p class="versions">Engine version: <code>${escape(report.engine_version)}</code> · Security Benchmark for Salesforce version: <code>${escape(report.sbs_version)}</code></p>
</footer>`;
}

// ---------- formatting + escape helpers ----------

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatus(s: EvaluatorStatus): string {
  switch (s) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'inconclusive':
      return 'inconclusive';
    case 'na':
      return 'not applicable';
  }
}

function formatConfidence(c: EvidenceConfidence): string {
  switch (c) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
  }
}

function formatEvidenceSource(s: EvidenceSource): string {
  switch (s) {
    case 'soql':
      return 'SOQL';
    case 'health_check_api':
      return 'Health Check API';
    case 'limits_rest_api':
      return 'Limits REST API';
    case 'metadata_api':
      return 'Metadata API';
    case 'code_analyzer':
      return 'Code Analyzer';
    case 'questionnaire':
      return 'questionnaire';
  }
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ---------- styles ----------
//
// Self-contained CSS. System font stack so the report looks at home on any
// OS, generous line-height for legibility, restrained color palette so the
// document still reads well in print. Status badges + grade pill use color,
// but every status word is also written in plain text — the report stays
// readable in monochrome / accessibility / print.

const STYLE = `
:root {
  --fg: #1a1a1a;
  --muted: #555;
  --border: #d6d6d6;
  --accent: #1f3a5f;
  --pass: #1f7a3a;
  --fail: #b3261e;
  --warn: #8a5a00;
  --bg: #ffffff;
  --grade-bg: #f3f5f8;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.55;
}
main {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 32px 96px;
}
header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  letter-spacing: -0.01em;
}
header .meta { margin: 4px 0; color: var(--muted); font-size: 14px; }
section { margin-top: 40px; }
section h2 {
  margin: 0 0 12px;
  font-size: 22px;
  letter-spacing: -0.005em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
section h3 {
  margin: 32px 0 10px;
  font-size: 17px;
  color: var(--accent);
  text-transform: none;
  letter-spacing: 0.02em;
}
table { border-collapse: collapse; width: 100%; margin: 4px 0 12px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
th[scope="row"] { width: 32%; color: var(--muted); font-weight: 500; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.summary tbody tr:last-child th,
table.summary tbody tr:last-child td { border-bottom: none; }
.grade {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--grade-bg);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.grade-a { background: #e3f3e8; color: var(--pass); }
.grade-b { background: #eff5e8; color: #436f1d; }
.grade-c { background: #fbf3e1; color: var(--warn); }
.grade-d { background: #fbe7e1; color: #a04420; }
.grade-f { background: #f9e1de; color: var(--fail); }
.warn { color: var(--warn); }
.category-group { margin-top: 24px; }
article.control {
  margin: 18px 0;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fafafa;
  page-break-inside: avoid;
  break-inside: avoid;
}
article.control h4 {
  margin: 0 0 8px;
  font-size: 15px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0;
}
dl.control-meta {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 4px 12px;
  margin: 0 0 10px;
  font-size: 14px;
}
dl.control-meta dt { color: var(--muted); }
dl.control-meta dd { margin: 0; }
.status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.status-pass { background: #e3f3e8; color: var(--pass); }
.status-fail { background: #f9e1de; color: var(--fail); }
.status-inconclusive { background: #fbf3e1; color: var(--warn); }
.status-na { background: #ececec; color: var(--muted); }
blockquote.finding {
  margin: 8px 0 0;
  padding: 8px 12px;
  border-left: 3px solid var(--border);
  background: #ffffff;
  font-size: 14px;
  color: #333;
}
p.findings.empty { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
footer {
  margin-top: 56px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--muted);
}
footer h2 { font-size: 14px; color: var(--fg); border: none; padding: 0; margin: 0 0 8px; }
footer a { color: var(--accent); }
.versions code { font-size: 12px; background: var(--grade-bg); padding: 2px 6px; border-radius: 3px; }
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }

@media print {
  body { font-size: 11pt; }
  main { max-width: none; padding: 0; }
  section { margin-top: 18pt; }
  section h2 { font-size: 16pt; }
  section h3 { font-size: 13pt; }
  article.control { background: #fff; padding: 8pt 10pt; }
  article.control h4 { font-size: 11pt; }
  blockquote.finding { background: #fff; }
  a { color: inherit; text-decoration: none; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; color: #666; }
}
`;
