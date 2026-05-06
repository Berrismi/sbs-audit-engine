// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Parser for upstream SBS markdown (one file per category at
// benchmark/{category}.md in the SBS docs-site repo). Extracts each
// control's title, control_statement, description, risk_level (from a
// Starlight `<Badge>` element), risk_narrative, audit_procedure,
// remediation_steps, and default_value.
//
// Section schema is consistent across all 9 categories at SBS v0.4.1 —
// see tests/data/fixtures/upstream-sample.md for the exact structure
// this parser handles. Drift detection: parse-sbs-markdown tests run
// against the fixture (stable); the integrity tests in controls.test.ts
// run against the synced controls.json (real upstream output) and would
// fail loudly if a section ever goes missing in upstream.

import type { RiskLevel } from '../../src/types';

export interface MarkdownExtract {
  title: string;
  control_statement: string;
  description: string;
  risk_level: RiskLevel | null;
  risk_narrative: string;
  audit_procedure: string;
  remediation_steps: string;
  default_value: string | null;
}

// Heading separator is `: ` in nearly every upstream control, but a few
// (e.g., SBS-DEP-004 @ v0.4.1) use ` — ` (em-dash). Accept both so a typo
// upstream doesn't silently lose the entire control's prose.
const HEADING_RE = /^###\s+(SBS-[A-Z]+-\d+)\s*[:—]\s*(.+?)\s*$/;
// Bold-prefix section markers in fixed schema order (per SBS v0.4.1):
const SECTION_NAMES = [
  'Control Statement',
  'Description',
  'Risk',
  'Audit Procedure',
  'Remediation',
  'Default Value',
] as const;
type SectionName = (typeof SECTION_NAMES)[number];

const BADGE_RE = /<Badge\s+type="(?<type>[^"]+)"\s+text="(?<text>[^"]+)"\s*\/>/;
const BADGE_TEXT_TO_RISK: Record<string, RiskLevel> = {
  Critical: 'Critical',
  High: 'High',
  Moderate: 'Moderate',
};

/**
 * Split a category markdown file into per-control sections, then parse
 * each section's bold-prefixed blocks. Returns a map keyed by control id
 * with verbatim markdown for each prose field — leaves formatting (bold,
 * inline code, sub-bullets) intact so the renderer can present it via
 * react-markdown.
 */
export function parseMarkdown(md: string): Map<string, MarkdownExtract> {
  const out = new Map<string, MarkdownExtract>();
  const lines = md.split('\n');

  // Find all control heading line indices first, then slice between them.
  const headings: { id: string; title: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = HEADING_RE.exec(lines[i] ?? '');
    if (m) {
      headings.push({ id: m[1] ?? '', title: m[2] ?? '', line: i });
    }
  }

  for (let h = 0; h < headings.length; h += 1) {
    const start = headings[h]!.line + 1;
    const end = headings[h + 1]?.line ?? lines.length;
    const sectionLines = lines.slice(start, end);
    const blocks = splitIntoSections(sectionLines);

    out.set(headings[h]!.id, {
      title: headings[h]!.title,
      control_statement: stripInlineSection(blocks.get('Control Statement') ?? '').trim(),
      description: blocks.get('Description')?.trim() ?? '',
      risk_level: extractRiskLevel(blocks.get('Risk') ?? ''),
      risk_narrative: extractRiskNarrative(blocks.get('Risk') ?? ''),
      audit_procedure: blocks.get('Audit Procedure')?.trim() ?? '',
      remediation_steps: blocks.get('Remediation')?.trim() ?? '',
      default_value: blocks.has('Default Value')
        ? (blocks.get('Default Value')?.trim() ?? null)
        : null,
    });
  }
  return out;
}

/**
 * Walk a control's body and bucket lines by which `**SectionName:**`
 * block they belong to. The first matching marker on a line opens the
 * section; the section captures every subsequent line (including blanks
 * and sub-paragraphs marked with their own `**Inner:**` blocks like
 * "Example models:") until the next top-level marker is seen.
 *
 * "Top-level" here means: a marker whose label matches one of the six
 * known section names. Inner bold-prefixed blocks (e.g., "Example
 * models:") are NOT in that set, so they pass through unchanged into
 * the parent section's content.
 */
function splitIntoSections(lines: string[]): Map<SectionName, string> {
  const out = new Map<SectionName, string>();
  let current: SectionName | null = null;
  let buf: string[] = [];

  const flush = (): void => {
    if (current) out.set(current, buf.join('\n'));
    buf = [];
  };

  for (const line of lines) {
    const opener = matchSectionOpener(line);
    if (opener) {
      flush();
      current = opener.section;
      // Keep the inline remainder after the marker on the same line, if any.
      if (opener.inline) buf.push(opener.inline);
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

// Section aliases for upstream variation. Foundational controls in
// `benchmark/foundations.md` (SBS-FDNS-*) frame the risk discussion as
// "Rationale" rather than "Risk" because the controls are about
// foundational governance posture rather than specific threat scenarios.
// We bucket Rationale prose into the 'Risk' section so risk_narrative
// gets populated; risk_level still falls back to YAML for these
// (foundations.md doesn't carry a Risk badge).
const SECTION_ALIASES: Record<string, SectionName> = {
  Rationale: 'Risk',
};

function matchSectionOpener(line: string): { section: SectionName; inline: string } | null {
  for (const name of SECTION_NAMES) {
    // Accept both `**Section:**` (typical) and `**Section**:` (upstream
    // inconsistency, e.g., SBS-INT-004 @ v0.4.1 puts the colon outside
    // the bold markers).
    const inside = `**${name}:**`;
    const outside = `**${name}**:`;
    const idxInside = line.indexOf(inside);
    if (idxInside !== -1) {
      return { section: name, inline: line.slice(idxInside + inside.length).trim() };
    }
    const idxOutside = line.indexOf(outside);
    if (idxOutside !== -1) {
      return { section: name, inline: line.slice(idxOutside + outside.length).trim() };
    }
  }
  for (const [alias, section] of Object.entries(SECTION_ALIASES)) {
    const inside = `**${alias}:**`;
    const outside = `**${alias}**:`;
    const idxInside = line.indexOf(inside);
    if (idxInside !== -1) {
      return { section, inline: line.slice(idxInside + inside.length).trim() };
    }
    const idxOutside = line.indexOf(outside);
    if (idxOutside !== -1) {
      return { section, inline: line.slice(idxOutside + outside.length).trim() };
    }
  }
  return null;
}

/**
 * Control Statement is rendered as a single sentence on the cover/exec
 * pages, so collapse whitespace there. (Other sections preserve markdown
 * formatting verbatim.)
 */
function stripInlineSection(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function extractRiskLevel(riskBlock: string): RiskLevel | null {
  const m = BADGE_RE.exec(riskBlock);
  if (!m?.groups) return null;
  return BADGE_TEXT_TO_RISK[m.groups['text'] ?? ''] ?? null;
}

function extractRiskNarrative(riskBlock: string): string {
  // Strip the badge element and any trailing two-space markdown line
  // breaks left over after its removal, then trim leading blank lines.
  return riskBlock
    .replace(BADGE_RE, '')
    .replace(/^\s*\n/, '')
    .trim();
}
