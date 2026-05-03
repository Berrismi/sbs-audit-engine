// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// sync-sbs.ts
//
// Pull SBS control metadata from the pinned upstream tag of
// github.com/Salesforce-Security-Benchmark/docs-site and write a normalized
// controls.json snapshot.
//
// Run with:  pnpm --filter @hellomavens/sbs-engine sync:sbs
//
// IMPORTANT
// - Reads the SBS pin from ../../upstream-sources.toml (the engine repo root).
// - Re-fetches everything from scratch; controls.json is fully regenerated.
// - The output carries the same Creative Commons Attribution-ShareAlike
//   4.0 International license as SBS itself (since the control text is
//   derived from SBS). The SPDX identifier is set in data/controls.LICENSE.txt.
// - Phase 1 scope: extract structured YAML metadata + control title from the
//   benchmark markdown. Full description / audit_procedure / remediation_steps
//   parsing is deferred to Phase 3 when we implement evaluators that need them.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import type {
  CategoryPrefix,
  Control,
  ControlLibrary,
  RemediationScope,
  RiskLevel,
} from '../src/types';

// -----------------------------------------------------------------------------
// Path helpers
// -----------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(ENGINE_ROOT, '..', '..');
const UPSTREAM_SOURCES = resolve(REPO_ROOT, 'upstream-sources.toml');
const OUTPUT_PATH = resolve(ENGINE_ROOT, 'data', 'controls.json');
const OVERRIDES_PATH = resolve(ENGINE_ROOT, 'data', 'control-overrides.json');
const ENRICHMENTS_PATH = resolve(ENGINE_ROOT, 'data', 'control-enrichments.json');

// -----------------------------------------------------------------------------
// Upstream pin
// -----------------------------------------------------------------------------

interface UpstreamSources {
  sbs: { repo: string; ref: string; control_metadata_path: string };
}

function readUpstreamPin(): UpstreamSources['sbs'] {
  const raw = readFileSync(UPSTREAM_SOURCES, 'utf-8');
  const parsed = parseToml(raw) as unknown as UpstreamSources;
  return parsed.sbs;
}

// -----------------------------------------------------------------------------
// GitHub fetchers
// -----------------------------------------------------------------------------

const GH_API = 'https://api.github.com';

async function ghJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sbs-audit-engine/sync-sbs',
  };
  const token = process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'];
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GH_API}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub ${path} returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function ghRaw(repoAndPath: string, ref: string): Promise<string> {
  // raw.githubusercontent.com URL shape: {owner}/{repo}/{ref}/{path...}
  // repoAndPath comes in as `{owner}/{repo}/{path}`; we splice the ref between repo and path.
  const parts = repoAndPath.split('/');
  const owner = parts[0];
  const repo = parts[1];
  const filePath = parts.slice(2).join('/');
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  const headers: Record<string, string> = {
    'User-Agent': 'sbs-audit-engine/sync-sbs',
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Raw fetch ${url} returned ${res.status}`);
  }
  return res.text();
}

interface GhContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}

interface GhCommit {
  sha: string;
}

// -----------------------------------------------------------------------------
// SBS YAML schema (upstream)
// -----------------------------------------------------------------------------

interface SbsYaml {
  control_id: string;
  /** Optional because some upstream YAMLs (e.g., SBS-AUTH-004 @ v0.4.1)
   * omit the field. Override via `control-overrides.json`. */
  risk_level?: RiskLevel;
  remediation: { scope: RemediationScope; entity_type?: string };
  task: { title_template: string };
}

// -----------------------------------------------------------------------------
// HelloMavens overrides + enrichments
// -----------------------------------------------------------------------------

interface ControlOverridesFile {
  schema_version: string;
  description?: string;
  overrides: Record<string, { risk_level?: RiskLevel; rationale: string }>;
}

interface ControlEnrichmentsFile {
  schema_version: string;
  description?: string;
  sources?: Record<string, string>;
  enrichments: Record<
    string,
    {
      owasp: string[];
      regulations: {
        hipaa?: string[];
        soc2?: string[];
        iso27001?: string[];
        gdpr?: string[];
        ccpa?: string[];
      };
    }
  >;
}

function readOverrides(): ControlOverridesFile {
  const raw = readFileSync(OVERRIDES_PATH, 'utf-8');
  return JSON.parse(raw) as ControlOverridesFile;
}

function readEnrichments(): ControlEnrichmentsFile {
  const raw = readFileSync(ENRICHMENTS_PATH, 'utf-8');
  return JSON.parse(raw) as ControlEnrichmentsFile;
}

/**
 * Resolve a control's risk_level. Preference order:
 *   1. control-overrides.json (HelloMavens-authored editorial fix).
 *   2. Upstream YAML.
 *   3. Default to 'High' and warn — better than crashing on a null.
 */
function resolveRiskLevel(yaml: SbsYaml, overrides: ControlOverridesFile): RiskLevel {
  const override = overrides.overrides[yaml.control_id]?.risk_level;
  if (override) {
    console.log(
      `  [override] ${yaml.control_id} risk_level = ${override} (was ${yaml.risk_level ?? 'null'})`,
    );
    return override;
  }
  if (yaml.risk_level) return yaml.risk_level;
  console.warn(
    `  [warn] ${yaml.control_id} has no risk_level upstream and no override; defaulting to 'High'.`,
  );
  return 'High';
}

// -----------------------------------------------------------------------------
// Markdown title + control-statement extraction
// -----------------------------------------------------------------------------

interface MarkdownExtract {
  title: string;
  control_statement: string;
}

function parseMarkdown(md: string): Map<string, MarkdownExtract> {
  const out = new Map<string, MarkdownExtract>();
  const lines = md.split('\n');
  let currentId: string | null = null;
  let currentTitle: string | null = null;
  let collectingStatement = false;
  let statementBuf: string[] = [];

  const flush = (): void => {
    if (currentId && currentTitle) {
      out.set(currentId, {
        title: currentTitle,
        control_statement: statementBuf.join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
    statementBuf = [];
    collectingStatement = false;
  };

  for (const line of lines) {
    const headingMatch = /^###\s+(SBS-[A-Z]+-\d+):\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      currentId = headingMatch[1] ?? null;
      currentTitle = headingMatch[2] ?? null;
      continue;
    }

    if (line.startsWith('**Control Statement:**')) {
      collectingStatement = true;
      statementBuf.push(line.replace('**Control Statement:**', '').trim());
      continue;
    }

    if (collectingStatement) {
      if (line.trim() === '' || line.startsWith('**')) {
        collectingStatement = false;
      } else {
        statementBuf.push(line.trim());
      }
    }
  }
  flush();
  return out;
}

// -----------------------------------------------------------------------------
// Category mapping
// -----------------------------------------------------------------------------

const CATEGORY_TO_MARKDOWN: Record<CategoryPrefix, string> = {
  ACS: 'access-controls.md',
  AUTH: 'authentication.md',
  CODE: 'code-security.md',
  CPORTAL: 'customer-portals.md',
  DATA: 'data-security.md',
  DEP: 'deployments.md',
  INT: 'integrations.md',
  OAUTH: 'oauth-security.md',
  SECCONF: 'security-configuration.md',
};

function categoryFromId(id: string): CategoryPrefix {
  const prefix = id.split('-')[1];
  if (!prefix || !(prefix in CATEGORY_TO_MARKDOWN)) {
    throw new Error(`Unknown category prefix in control id: ${id}`);
  }
  return prefix as CategoryPrefix;
}

// -----------------------------------------------------------------------------
// Risk → weight (HelloMavens enrichment)
// -----------------------------------------------------------------------------

function weightFromRiskLevel(risk: RiskLevel): number {
  switch (risk) {
    case 'Critical':
      return 5;
    case 'High':
      return 3;
    case 'Moderate':
      return 2;
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const sbs = readUpstreamPin();
  const overrides = readOverrides();
  const enrichments = readEnrichments();
  console.log(`Syncing SBS from ${sbs.repo} @ ${sbs.ref}`);
  console.log(
    `Loaded ${Object.keys(overrides.overrides).length} override(s), ` +
      `${Object.keys(enrichments.enrichments).length} enrichment entries.`,
  );

  // Resolve the actual commit SHA the tag points to (so the snapshot is exact).
  const commit = await ghJson<GhCommit>(`/repos/${sbs.repo}/commits/${sbs.ref}`);
  console.log(`Resolved ${sbs.ref} → ${commit.sha}`);

  // List all YAML files under control-metadata at the pinned tag.
  const yamlListing = await ghJson<GhContent[]>(
    `/repos/${sbs.repo}/contents/${sbs.control_metadata_path}?ref=${sbs.ref}`,
  );
  const yamlFiles = yamlListing.filter((f) => f.type === 'file' && f.name.endsWith('.yaml'));
  console.log(`Found ${yamlFiles.length} control YAML files`);

  // Fetch all YAML in parallel.
  const yamls = await Promise.all(
    yamlFiles.map(async (f) => {
      const raw = await ghRaw(`${sbs.repo}/${f.path}`, sbs.ref);
      return { file: f, parsed: parseYaml(raw) as SbsYaml };
    }),
  );

  // Group by category, fetch one markdown file per category, parse titles + statements.
  const categories = new Set(yamls.map(({ parsed }) => categoryFromId(parsed.control_id)));
  const markdownByCategory = new Map<CategoryPrefix, Map<string, MarkdownExtract>>();
  await Promise.all(
    [...categories].map(async (cat) => {
      const md = await ghRaw(`${sbs.repo}/benchmark/${CATEGORY_TO_MARKDOWN[cat]}`, sbs.ref);
      markdownByCategory.set(cat, parseMarkdown(md));
    }),
  );

  // Build controls.
  const controls: Control[] = yamls
    .map(({ file, parsed }) =>
      buildControl(file, parsed, markdownByCategory, sbs, overrides, enrichments),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  // Warn (don't fail) on controls without enrichment entries.
  const missingEnrichments = controls.map((c) => c.id).filter((id) => !enrichments.enrichments[id]);
  if (missingEnrichments.length > 0) {
    console.warn(
      `[warn] ${missingEnrichments.length} control(s) have no enrichment entry: ${missingEnrichments.join(', ')}.`,
    );
  }

  const library: ControlLibrary = {
    sbs_version: sbs.ref.replace(/^v/, ''),
    upstream_ref: sbs.ref,
    upstream_sha: commit.sha,
    fetched_at: new Date().toISOString(),
    engine_version: '0.0.0-dev',
    controls,
  };

  // REUSE-IgnoreStart
  // The string literals below build the SPDX header that gets written to
  // controls.LICENSE.txt. fsfe/reuse-action v6 parses source files for
  // SPDX expressions and would otherwise read the literal as a malformed
  // expression on this file (the trailing `',` breaks the parser).
  const header = [
    '// SPDX-FileCopyrightText: 2026 HelloMavens LLC (additions)',
    '// SPDX-FileCopyrightText: Security Benchmark for Salesforce contributors (source content)',
    '// SPDX-License-Identifier: CC-BY-SA-4.0',
    '//',
    '// AUTO-GENERATED — do not edit by hand. Run `pnpm sync:sbs` to regenerate.',
    '// Source: https://github.com/Salesforce-Security-Benchmark/docs-site',
    `// Pinned to ${sbs.ref} (${commit.sha}).`,
    '',
  ].join('\n');
  // REUSE-IgnoreEnd

  // controls.json must be valid JSON, so the SPDX header lives in a sibling
  // companion file. JSON cannot carry comments.
  writeFileSync(OUTPUT_PATH, JSON.stringify(library, null, 2) + '\n', 'utf-8');
  writeFileSync(OUTPUT_PATH.replace(/\.json$/, '.LICENSE.txt'), header, 'utf-8');

  console.log(`Wrote ${controls.length} controls to ${OUTPUT_PATH}`);
}

function buildControl(
  file: GhContent,
  yaml: SbsYaml,
  markdownByCategory: Map<CategoryPrefix, Map<string, MarkdownExtract>>,
  sbs: UpstreamSources['sbs'],
  overrides: ControlOverridesFile,
  enrichments: ControlEnrichmentsFile,
): Control {
  const category = categoryFromId(yaml.control_id);
  const markdown = markdownByCategory.get(category)?.get(yaml.control_id);
  const riskLevel = resolveRiskLevel(yaml, overrides);
  const enrichment = enrichments.enrichments[yaml.control_id];

  return {
    id: yaml.control_id,
    category,
    title: markdown?.title ?? `[TODO: title for ${yaml.control_id}]`,
    control_statement:
      markdown?.control_statement ?? `[TODO: control statement for ${yaml.control_id}]`,
    description: '[TODO: full description from upstream markdown — Phase 3]',
    risk_level: riskLevel,
    risk_narrative: '[TODO: risk narrative from upstream markdown — Phase 3]',
    audit_procedure: ['[TODO: audit procedure from upstream markdown — Phase 3]'],
    remediation_steps: ['[TODO: remediation steps from upstream markdown — Phase 3]'],
    default_value: '[TODO: default value from upstream markdown — Phase 3]',
    remediation: yaml.remediation,
    task_title_template: yaml.task.title_template,
    sources: [
      {
        type: 'sbs',
        upstream_repo: sbs.repo,
        upstream_ref: sbs.ref,
        upstream_path: file.path,
      },
    ],
    hellomavens_enrichments: {
      weight: weightFromRiskLevel(riskLevel),
      owasp: enrichment?.owasp ?? [],
      regulations: enrichment?.regulations ?? {},
    },
  };
}

main().catch((err: unknown) => {
  console.error('sync-sbs failed:', err);
  process.exit(1);
});
