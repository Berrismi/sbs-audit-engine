// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Parses the JSON output of `sf code-analyzer run --output-file <f>` into
// our normalized CodeAnalyzerFinding shape (defined by the engine package
// at packages/sbs-engine/src/types.ts:154-160).
//
// Code Analyzer's output schema can drift between minor versions; this
// parser is defensive — accepts both numeric and named severity, falls
// back gracefully on missing fields, and skips malformed individual
// findings rather than crashing the whole scan. Only a missing `results`
// array (or non-object input) is treated as fatal.

import type { CodeAnalyzerFinding } from '@hellomavens/security-review-for-salesforce-engine';

export interface ParsedCodeAnalyzerOutput {
  /** Reporting engine (pmd, sfge, eslint, retire-js, regex, flow). Pulled
   * from the first finding; falls back to 'code-analyzer' when there are
   * no findings. */
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

interface RawFinding {
  engine?: unknown;
  rule?: unknown;
  severity?: unknown;
  primaryLocation?: { file?: unknown; startLine?: unknown } | unknown;
  message?: unknown;
}

interface RawOutput {
  results?: unknown;
}

export function parseCodeAnalyzerOutput(raw: unknown): ParsedCodeAnalyzerOutput {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Code Analyzer output is not an object');
  }
  const root = raw as RawOutput;
  if (!Array.isArray(root.results)) {
    throw new Error('Code Analyzer output is missing the `results` array');
  }

  const findings: CodeAnalyzerFinding[] = [];
  let firstEngine: string | undefined;

  for (const entry of root.results as RawFinding[]) {
    const rule = typeof entry.rule === 'string' ? entry.rule : undefined;
    const message = typeof entry.message === 'string' ? entry.message : '';
    const loc =
      entry.primaryLocation &&
      typeof entry.primaryLocation === 'object' &&
      entry.primaryLocation !== null
        ? (entry.primaryLocation as { file?: unknown; startLine?: unknown })
        : undefined;
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

function normalizeSeverity(raw: unknown): CodeAnalyzerFinding['severity'] {
  if (typeof raw === 'number') {
    return NUMERIC_SEVERITY[raw] ?? 'Info';
  }
  if (typeof raw === 'string' && NAMED_SEVERITIES.has(raw as CodeAnalyzerFinding['severity'])) {
    return raw as CodeAnalyzerFinding['severity'];
  }
  return 'Info';
}
