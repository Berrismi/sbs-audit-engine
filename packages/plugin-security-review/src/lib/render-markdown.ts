// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Render a ScoredReport as Markdown. Output is plain CommonMark — no
// HTML, no emoji, no HelloMavens branding. The report itself is
// distributable; consumers can pipe through pandoc to get .docx /
// .pdf, or copy into their preferred editor.
//
// Sections:
//   1. Header                — title + scan timestamp + target alias
//   2. Summary               — overall score, grade, evidence-sufficiency banner
//   3. By category           — table of category aggregates
//   4. By control             — per-control verdicts with evidence + findings text
//   5. Sources & attribution  — CC-BY-SA-4.0 + engine version footer
//
// CC-BY-SA-4.0 §3(a) requires every distributed derivative to carry
// attribution + license + indication of source. The footer satisfies
// this for users who export the markdown to PDF/Word/HTML — they
// don't have to add it themselves.

import type {
  CategoryScoreOutput,
  ControlScoreResult,
  EvaluatorStatus,
  EvidenceConfidence,
  EvidenceSource,
  ScoredReport,
} from '@hellomavens/security-review-for-salesforce-engine';

export interface RenderMarkdownOptions {
  /** ISO timestamp of when the scan ran. Defaults to current time. */
  generatedAt?: string;
  /** Target org alias the scan ran against. */
  alias?: string;
}

export function renderMarkdown(report: ScoredReport, opts: RenderMarkdownOptions = {}): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const alias = opts.alias ?? 'unknown';

  const sections: string[] = [
    renderHeader(generatedAt, alias),
    renderSummary(report),
    renderCategoryTable(report.by_category),
    renderControlSections(report.control_results),
    renderAttribution(report),
  ];

  return sections.join('\n\n') + '\n';
}

function renderHeader(generatedAt: string, alias: string): string {
  return [
    '# Salesforce Security Review',
    '',
    `Scan target: \`${alias}\``,
    '',
    `Generated: \`${generatedAt}\``,
  ].join('\n');
}

function renderSummary(report: ScoredReport): string {
  const sufficiencyNote =
    report.evidence_sufficiency === 'sufficient'
      ? 'Evidence is sufficient for the headline grade to be meaningful.'
      : `Evidence is **insufficient** — over half of in-scope controls returned inconclusive (${formatPercent(report.inconclusive_percent)}). The headline grade may not reflect the true posture; see per-control detail below for which controls need attestation.`;

  const criticalNote =
    report.critical_fail_count > 0
      ? ` ${report.critical_fail_count} Critical-tier control(s) failed; the overall grade is capped at C regardless of category aggregates.`
      : '';

  return [
    '## Summary',
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Overall score | ${report.overall_score} / 100 |`,
    `| Risk grade | **${report.risk_grade}** |`,
    `| Critical fails | ${report.critical_fail_count} |`,
    `| Inconclusive | ${formatPercent(report.inconclusive_percent)} |`,
    `| Evidence sufficiency | ${report.evidence_sufficiency} |`,
    '',
    `${sufficiencyNote}${criticalNote}`,
  ].join('\n');
}

function renderCategoryTable(categories: ReadonlyArray<CategoryScoreOutput>): string {
  if (categories.length === 0) {
    return '## By category\n\n_No categories evaluated._';
  }
  const rows = categories.map((c) => {
    const total = c.pass_count + c.fail_count + c.inconclusive_count + c.na_count;
    return `| ${c.category} | ${c.score} | ${c.pass_count} | ${c.fail_count} | ${c.inconclusive_count} | ${c.na_count} | ${total} |`;
  });
  return [
    '## By category',
    '',
    `| Category | Score | Pass | Fail | Inconclusive | N/A | Total |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: |`,
    ...rows,
  ].join('\n');
}

function renderControlSections(controls: ReadonlyArray<ControlScoreResult>): string {
  if (controls.length === 0) {
    return '## By control\n\n_No controls evaluated._';
  }
  // Group by category, preserving control_id sort within each group.
  const byCategory = new Map<string, ControlScoreResult[]>();
  for (const c of controls) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const blocks: string[] = ['## By control'];
  for (const [category, list] of [...byCategory.entries()].sort()) {
    list.sort((a, b) => a.control_id.localeCompare(b.control_id));
    blocks.push('', `### ${category}`);
    for (const c of list) {
      blocks.push('', renderControl(c));
    }
  }
  return blocks.join('\n');
}

function renderControl(c: ControlScoreResult): string {
  const evidenceList =
    c.evidence_used.length === 0 ? 'none' : c.evidence_used.map(formatEvidenceSource).join(', ');
  const findingsBlock =
    c.findings.length === 0
      ? '_No findings._'
      : c.findings.map((f) => `> ${f.split('\n').join('\n> ')}`).join('\n>\n');
  return [
    `#### ${c.control_id}`,
    '',
    `- **Status**: ${formatStatus(c.status)}`,
    `- **Confidence**: ${formatConfidence(c.confidence)}`,
    `- **Risk tier**: ${c.risk_level} (weight ${c.weight})`,
    `- **Evidence**: ${evidenceList}`,
    '',
    findingsBlock,
  ].join('\n');
}

function renderAttribution(report: ScoredReport): string {
  return [
    '## Sources & attribution',
    '',
    'This report incorporates content from the [Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site), an open standard licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). Per the ShareAlike clause, the SBS-derived content in this report inherits the same license; if you redistribute this report, please retain this attribution.',
    '',
    'The scoring algorithm, evaluator framework, and OWASP / HIPAA / SOC 2 / ISO 27001 cross-walks are authored by HelloMavens LLC and licensed under MIT in our open-source engine at [github.com/Berrismi/sbs-audit-engine](https://github.com/Berrismi/sbs-audit-engine).',
    '',
    `Engine version: \`${report.engine_version}\` · Security Benchmark for Salesforce version: \`${report.sbs_version}\``,
  ].join('\n');
}

// ---------- formatting helpers ----------

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
