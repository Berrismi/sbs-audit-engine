// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Parses the JSON output of `sf code-analyzer run --output-file <f>` into
// our normalized CodeAnalyzerFinding shape (defined by the engine package
// at packages/sbs-engine/src/types.ts).
//
// Schema: Code Analyzer v5.x emits an object whose top-level keys include
//   - violations: VLn[]
// where each violation has `rule` (string), `engine` (string), `severity`
// (1=Critical..5=Info), `tags` (string[]), `message` (string), `locations`
// (Location[]), and `primaryLocationIndex` (number into `locations`).
// Each location carries `file` (string) and `startLine` (number).
//
// alpha.37 migrated this parser from the v4-era shape (`results[]` +
// `primaryLocation` field) to the v5 shape after end-to-end verification
// against loan-maven surfaced the schema drift. We pin `v5.12.0` in
// upstream-sources.toml and don't support v4. If a future v6 changes the
// shape again, the runner's "missing the violations array" error message
// is the canary — bump `parseCodeAnalyzerOutput` then.
//
// Parser is defensive — skips malformed individual violations rather than
// crashing the whole scan; only a missing `violations` array (or
// non-object input) is treated as fatal.

import type { CodeAnalyzerFinding } from '@hellomavens/security-review-for-salesforce-engine';

export interface ParsedCodeAnalyzerOutput {
  /** Reporting engine (pmd, sfge, eslint, retire-js, regex, flow, cpd).
   * Pulled from the first violation; falls back to 'code-analyzer' when
   * there are no violations. */
  engine: string;
  findings: CodeAnalyzerFinding[];
}

const NUMERIC_SEVERITY: Record<number, CodeAnalyzerFinding['severity']> = {
  1: 'Critical',
  2: 'High',
  3: 'Moderate',
  4: 'Low',
  5: 'Info',
};

const NAMED_SEVERITIES = new Set<CodeAnalyzerFinding['severity']>([
  'Critical',
  'High',
  'Moderate',
  'Low',
  'Info',
]);

interface RawLocation {
  file?: unknown;
  startLine?: unknown;
}

interface RawViolation {
  engine?: unknown;
  rule?: unknown;
  severity?: unknown;
  message?: unknown;
  locations?: unknown;
  primaryLocationIndex?: unknown;
}

interface RawOutput {
  violations?: unknown;
}

export function parseCodeAnalyzerOutput(raw: unknown): ParsedCodeAnalyzerOutput {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Code Analyzer output is not an object');
  }
  const root = raw as RawOutput;
  if (!Array.isArray(root.violations)) {
    throw new Error('Code Analyzer output is missing the `violations` array');
  }

  const findings: CodeAnalyzerFinding[] = [];
  let firstEngine: string | undefined;

  for (const entry of root.violations as RawViolation[]) {
    const rule = typeof entry.rule === 'string' ? entry.rule : undefined;
    const message = typeof entry.message === 'string' ? entry.message : '';
    const loc = pickPrimaryLocation(entry);
    const file = typeof loc?.file === 'string' ? loc.file : undefined;
    const line = typeof loc?.startLine === 'number' ? loc.startLine : undefined;

    if (!rule || !file || line === undefined) continue;

    const severity = normalizeSeverity(entry.severity);
    findings.push({ rule, severity, file, line, message });

    if (firstEngine === undefined && typeof entry.engine === 'string') {
      firstEngine = entry.engine;
    }
  }

  return { engine: firstEngine ?? 'code-analyzer', findings };
}

/**
 * Resolve `entry.locations[entry.primaryLocationIndex]` defensively.
 * Falls back to `locations[0]` when primaryLocationIndex is missing or
 * out of range; returns undefined when locations is missing entirely
 * (the violation will then be skipped by the caller's file/line check).
 */
function pickPrimaryLocation(entry: RawViolation): RawLocation | undefined {
  if (!Array.isArray(entry.locations) || entry.locations.length === 0) {
    return undefined;
  }
  const idx =
    typeof entry.primaryLocationIndex === 'number' &&
    entry.primaryLocationIndex >= 0 &&
    entry.primaryLocationIndex < entry.locations.length
      ? entry.primaryLocationIndex
      : 0;
  const candidate = entry.locations[idx];
  return candidate && typeof candidate === 'object' ? (candidate as RawLocation) : undefined;
}

function normalizeSeverity(raw: unknown): CodeAnalyzerFinding['severity'] {
  if (typeof raw === 'number') {
    return NUMERIC_SEVERITY[raw] ?? 'Info';
  }
  if (typeof raw === 'string' && NAMED_SEVERITIES.has(raw as CodeAnalyzerFinding['severity'])) {
    return raw as CodeAnalyzerFinding['severity'];
  }
  return 'Info';
}
