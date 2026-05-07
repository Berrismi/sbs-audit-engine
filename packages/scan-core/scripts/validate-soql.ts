// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// validate-soql.ts — author-time validation that every SOQL query in the
// default bundle parses correctly against a real Salesforce org's schema.
//
// Why this exists: alpha.14 + alpha.15 each shipped a control whose SOQL
// referenced a fabricated PermissionSet / ConnectedApplication field name
// (`PermissionsApprovedConnectedAppsAccess`, `OptionsAdminApprovalRequired`).
// Both queries carried `appliesWhen: fieldsExist(...)` gates, so the bad
// SOQL never reached the wire — it just silently field-gate-skipped on every
// consumer org, defeating the cli_corroborating classification. alpha.16
// fixed both with a direct DE describe round-trip; this script makes that
// validation a one-command author-time check so the bug class can't recur.
//
// Strategy: for each SoqlQueryDef in DEFAULT_SOQL_QUERIES, append `LIMIT 0`
// to the SOQL and execute it via `sf data query`. LIMIT 0 returns 0 rows
// without scanning data (cheap), but Salesforce still parses the full query
// and rejects with NO_SUCH_COLUMN / NO_SUCH_OBJECT when a field/object name
// is wrong. That's exactly the error class we need to catch.
//
// Three outcomes per query:
//   PASS   — query executed cleanly (or LIMIT 0 returned 0 rows). The
//            field/object names are real on the target org.
//   SKIP   — query failed with a column/object-not-found error AND the
//            query carries an `appliesWhen` gate. This is the expected
//            DE-edition-gate behavior (the runtime gate would skip the
//            same query against this org). Not a bug.
//   FAIL   — query failed with a column/object-not-found error AND has no
//            `appliesWhen` gate, OR failed with any non-shape-related
//            error (auth, network, etc.). Investigate.
//
// Usage:
//   pnpm --filter @hellomavens/security-review-for-salesforce-scan-core \
//     run validate:soql --target-org hm-cli-validation
//
// Or from the workspace root:
//   pnpm validate:soql --target-org hm-cli-validation
//
// Add new queries to `src/soql/queries.ts` and re-run before merging. CI
// does NOT run this (no live org credentials in CI); it's an author-time
// gate by convention.

import { execFileSync } from 'node:child_process';
import { DEFAULT_SOQL_QUERIES } from '../src/soql/queries';
import type { SoqlQueryDef } from '../src/types';

interface ValidationResult {
  query: SoqlQueryDef;
  outcome: 'pass' | 'skip' | 'fail';
  message: string;
}

function parseArgs(argv: readonly string[]): { targetOrg: string } {
  const idx = argv.indexOf('--target-org');
  if (idx === -1 || idx === argv.length - 1) {
    throw new Error(
      'Missing --target-org <alias>. Pass the alias of an authenticated `sf` org ' +
        '(e.g. `--target-org hm-cli-validation`).',
    );
  }
  const targetOrg = argv[idx + 1];
  if (!targetOrg) {
    throw new Error('--target-org value cannot be empty.');
  }
  return { targetOrg };
}

// Append LIMIT 0 unless the query already carries one. LIMIT 0 makes the
// describe-and-parse work happen without scanning rows — fast, free, and
// still surfaces NO_SUCH_COLUMN errors at the Salesforce parser layer.
function withLimitZero(soql: string): string {
  return /\bLIMIT\b/i.test(soql) ? soql : `${soql} LIMIT 0`;
}

function runQueryDryRun(
  query: SoqlQueryDef,
  targetOrg: string,
): { ok: true } | { ok: false; stderr: string } {
  const args = ['data', 'query', '--target-org', targetOrg, '--query', withLimitZero(query.soql)];
  if (query.source === 'tooling') {
    args.push('--use-tooling-api');
  }
  try {
    execFileSync('sf', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
    return { ok: true };
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr ?? '')
        : '';
    const stdout =
      err && typeof err === 'object' && 'stdout' in err
        ? String((err as { stdout: unknown }).stdout ?? '')
        : '';
    return { ok: false, stderr: stderr + stdout };
  }
}

const SHAPE_ERROR_PATTERNS = [
  /No such column/i,
  /sObject type .+ is not supported/i,
  /Didn't understand relationship/i,
  /INVALID_FIELD/i,
  /INVALID_TYPE/i,
];

function isShapeError(stderr: string): boolean {
  return SHAPE_ERROR_PATTERNS.some((re) => re.test(stderr));
}

function classify(query: SoqlQueryDef, targetOrg: string): ValidationResult {
  const result = runQueryDryRun(query, targetOrg);
  if (result.ok) {
    return { query, outcome: 'pass', message: 'parsed cleanly' };
  }
  const shape = isShapeError(result.stderr);
  if (shape && query.appliesWhen) {
    return {
      query,
      outcome: 'skip',
      message: 'shape-related error caught by appliesWhen gate (expected DE-skip)',
    };
  }
  if (shape) {
    return {
      query,
      outcome: 'fail',
      message: 'shape error AND no appliesWhen gate to catch it at runtime',
    };
  }
  return {
    query,
    outcome: 'fail',
    message: `non-shape error: ${firstNonEmptyLine(result.stderr) || '(no stderr)'}`,
  };
}

function firstNonEmptyLine(s: string): string {
  for (const line of s.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('›') && !trimmed.startsWith('Warning:')) {
      return trimmed.slice(0, 200);
    }
  }
  return '';
}

function main(): void {
  const { targetOrg } = parseArgs(process.argv.slice(2));
  console.log(`validate-soql: target org = ${targetOrg}`);
  console.log(`validate-soql: ${DEFAULT_SOQL_QUERIES.length} queries to validate\n`);

  const results: ValidationResult[] = [];
  for (const q of DEFAULT_SOQL_QUERIES) {
    process.stdout.write(`  ${q.id} ... `);
    const r = classify(q, targetOrg);
    results.push(r);
    const tag = r.outcome === 'pass' ? 'PASS' : r.outcome === 'skip' ? 'SKIP (gated)' : 'FAIL';
    console.log(`${tag} — ${r.message}`);
  }

  const passed = results.filter((r) => r.outcome === 'pass').length;
  const skipped = results.filter((r) => r.outcome === 'skip').length;
  const failed = results.filter((r) => r.outcome === 'fail');

  console.log('\nSummary:');
  console.log(`  PASS:  ${passed}`);
  console.log(`  SKIP:  ${skipped} (gated, expected on this org)`);
  console.log(`  FAIL:  ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  - ${f.query.id}: ${f.message}`);
    }
    process.exit(1);
  }
}

main();
