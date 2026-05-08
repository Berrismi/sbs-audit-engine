// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Cross-package coverage test: every SOQL query_id referenced by an
// engine evaluator MUST exist in DEFAULT_SOQL_QUERIES.
//
// Why this exists: alpha.29's CPORTAL-002 PR (#66) accidentally
// overwrote both auth-004 SOQL queries instead of appending the new
// cportal-002 query alongside them. The auth-004 evaluator was wired
// up in alpha.28 looking for `auth-004-external-users-mfa` and
// `auth-004-external-users-mfa-via-permsets`, so the silent removal
// sent every consumer scan from alpha.29 → alpha.33 to questionnaire
// fallback for AUTH-004 — a Critical-tier control. The regression went
// undetected through 4 engine releases because evaluator unit tests
// synthesize evidence in their fixtures (they don't read from the
// actual SOQL bundle); only multi-org runtime verification catches the
// "evaluator wired to query ids that don't exist" case.
//
// This test scans every evaluator source file in
// packages/sbs-engine/src/evaluators and extracts the set of query_ids
// each evaluator references — both via the cliAttestationEvaluator's
// `soqlQueryId:` config and via inline `e.query_id === NAME`
// comparisons. Constant indirection (`soqlQueryId: QUERY_ID` where
// `const QUERY_ID = 'literal'` is defined earlier in the file) is
// resolved via a per-file const map.
//
// The test is regex-based, not AST-based — that's deliberate. The
// patterns we care about are stable conventions in this codebase
// (cliAttestationEvaluator config + inline query_id comparisons), and
// regex keeps the test fast and dependency-free. If the conventions
// drift in a future refactor, the test will silently miss the new
// shape; pair this with multi-org runtime verification before
// shipping.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOQL_QUERIES } from '../../src/soql/queries';

const EVALUATORS_DIR = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'sbs-engine',
  'src',
  'evaluators',
);

interface ReferencedQueryId {
  evaluator: string;
  queryId: string;
  /** Where the reference came from — for failure-message clarity. */
  via: 'soqlQueryId-literal' | 'soqlQueryId-constant' | 'query_id-comparison';
}

/**
 * Build a map of `const NAME = 'literal'` definitions in a single source
 * file. Tolerates optional type annotation (`const NAME: string = '...'`)
 * and either single or double quotes. Multi-line const exprs (template
 * literals etc.) are ignored — we only resolve simple string constants.
 */
function extractConstMap(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /\bconst\s+(\w+)(?:\s*:\s*\w+)?\s*=\s*['"]([^'"]+)['"];/g;
  for (const m of source.matchAll(pattern)) {
    const [, name, value] = m;
    if (name && value) out.set(name, value);
  }
  return out;
}

/**
 * Extract every query_id this evaluator references. Three patterns:
 *
 *  1. `soqlQueryId: 'literal',`                    → queryId = 'literal'
 *  2. `soqlQueryId: NAME,` + `const NAME = '...'`  → queryId = '...'
 *  3. `e.query_id === NAME` + `const NAME = '...'` → queryId = '...'
 *
 * Pattern 1 is used by file-001 / file-002 / acs-005 / etc. Pattern 2 is
 * used by mon-001 / mon-002 / cportal-002 / etc. Pattern 3 is used by
 * multi-query evaluators that branch on the query_id (auth-004, oauth-001,
 * acs-004, dep-006, etc.).
 */
function extractReferencedQueryIds(evaluator: string, source: string): ReferencedQueryId[] {
  const consts = extractConstMap(source);
  const out: ReferencedQueryId[] = [];

  // Pattern 1: soqlQueryId: 'literal'
  for (const m of source.matchAll(/\bsoqlQueryId:\s*['"]([^'"]+)['"]/g)) {
    out.push({ evaluator, queryId: m[1]!, via: 'soqlQueryId-literal' });
  }

  // Pattern 2: soqlQueryId: NAME (where NAME is a const)
  for (const m of source.matchAll(/\bsoqlQueryId:\s*(\w+)\s*,/g)) {
    const name = m[1]!;
    const resolved = consts.get(name);
    if (resolved) {
      out.push({ evaluator, queryId: resolved, via: 'soqlQueryId-constant' });
    }
  }

  // Pattern 3: query_id === NAME (where NAME is a const)
  for (const m of source.matchAll(/\bquery_id\s*===\s*(\w+)\b/g)) {
    const name = m[1]!;
    const resolved = consts.get(name);
    if (resolved) {
      out.push({ evaluator, queryId: resolved, via: 'query_id-comparison' });
    }
  }

  return out;
}

describe('evaluator → SOQL bundle coverage', () => {
  const evaluatorFiles = readdirSync(EVALUATORS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .sort();

  const references: ReferencedQueryId[] = [];
  for (const file of evaluatorFiles) {
    const source = readFileSync(resolve(EVALUATORS_DIR, file), 'utf8');
    references.push(...extractReferencedQueryIds(file, source));
  }

  const bundleIds = new Set(DEFAULT_SOQL_QUERIES.map((q) => q.id));

  it('discovers query_id references across the evaluator surface', () => {
    // Sanity: the test should have found at least 20 references — the
    // engine has 30+ cli-evidence controls. If we discover < 20, the
    // regex patterns probably stopped matching after a refactor.
    expect(references.length).toBeGreaterThan(20);
  });

  it('every evaluator-referenced query_id exists in DEFAULT_SOQL_QUERIES', () => {
    const missing = references.filter((r) => !bundleIds.has(r.queryId));
    if (missing.length > 0) {
      // Build a friendly failure message: which evaluator, which id, how
      // it was referenced. Mirrors the shape that would have caught the
      // alpha.29 auth-004 silent-removal regression.
      const formatted = missing
        .map((m) => `  ${m.evaluator}: '${m.queryId}' (referenced via ${m.via})`)
        .join('\n');
      throw new Error(
        `${missing.length} evaluator-referenced query_id(s) are NOT defined in DEFAULT_SOQL_QUERIES:\n${formatted}\n` +
          `\nFix by adding the missing query block(s) to packages/scan-core/src/soql/queries.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('captures the auth-004 query ids specifically (regression guard)', () => {
    // Defensive: even if the discovery regex breaks later, this hardcoded
    // list ensures auth-004's specific ids never silently disappear from
    // the bundle again. Mirrors the alpha.29 regression: both ids existed
    // in the evaluator source but were absent from the bundle.
    expect(bundleIds.has('auth-004-external-users-mfa')).toBe(true);
    expect(bundleIds.has('auth-004-external-users-mfa-via-permsets')).toBe(true);
  });
});
