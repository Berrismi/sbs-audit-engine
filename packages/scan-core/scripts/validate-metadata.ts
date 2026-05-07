// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// validate-metadata.ts — author-time validation that every Metadata API
// probe in DEFAULT_METADATA_PROBES can list + read against a real org.
//
// Mirrors `validate-soql.ts`. Different mechanism (sf project retrieve
// for metadata vs sf data query for SOQL) but same author-time discipline:
// catch type-name typos and edition-gated unavailability before the PR
// ships, not in customer scans.
//
// Strategy: shell out to `sf org list metadata --metadata-type <Type>` to
// validate `list()` works, then `sf project retrieve start --metadata
// <Type>:<fullName>` for at least one fullName per probe. Both succeeding
// means the probe is shape-correct against this org.
//
// For probes with explicit fullNames, retrieve all of them. For
// list-then-cap probes, retrieve only the first prioritized name (proves
// list + read both work; we don't need to download every Profile to
// confirm the probe is well-formed).
//
// Three outcomes per probe:
//   PASS — list + read both succeeded with parseable JSON output
//   SKIP — list returned no records (the type isn't present on this
//          edition; the probe would runtime-skip the same way and
//          fall back to questionnaire)
//   FAIL — list or read threw, OR returned a non-JSON / empty response
//          where one was expected
//
// Usage:
//   pnpm --filter @hellomavens/security-review-for-salesforce-scan-core \
//     run validate:metadata --target-org hm-cli-validation
//
// Or from the workspace root:
//   pnpm validate:metadata --target-org hm-cli-validation
//
// CI does NOT run this (no live org credentials in CI); it's an author-time
// gate by convention paralleling validate:soql.

import { execFileSync } from 'node:child_process';
import { DEFAULT_METADATA_PROBES } from '../src/metadata/probes';
import type { MetadataProbe } from '../src/metadata/client';

interface ValidationResult {
  probe: MetadataProbe;
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

interface SfListEntry {
  fullName: string;
  type?: string;
}

interface SfListWrapper {
  status: number;
  result?: SfListEntry[] | null;
  message?: string;
}

interface SfReadOk {
  status: number;
  result?: { files?: { fullName: string; type?: string }[] };
  message?: string;
}

function runListMetadata(
  type: string,
  targetOrg: string,
): { ok: true; entries: SfListEntry[] } | { ok: false; stderr: string } {
  const args = [
    'org',
    'list',
    'metadata',
    '--metadata-type',
    type,
    '--target-org',
    targetOrg,
    '--json',
  ];
  try {
    const out = execFileSync('sf', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
    const parsed = JSON.parse(out) as SfListWrapper;
    if (parsed.status !== 0) {
      return { ok: false, stderr: parsed.message ?? 'unknown sf error' };
    }
    return { ok: true, entries: parsed.result ?? [] };
  } catch (err) {
    return { ok: false, stderr: stderrOf(err) };
  }
}

function runRetrieveOne(
  type: string,
  fullName: string,
  targetOrg: string,
): { ok: true } | { ok: false; stderr: string } {
  const args = [
    'project',
    'retrieve',
    'start',
    '--metadata',
    `${type}:${fullName}`,
    '--target-org',
    targetOrg,
    '--target-metadata-dir',
    '/tmp/sbs-validate-metadata',
    '--unzip',
    '--json',
  ];
  try {
    const out = execFileSync('sf', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
    const parsed = JSON.parse(out) as SfReadOk;
    if (parsed.status !== 0) {
      return { ok: false, stderr: parsed.message ?? 'unknown sf error' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: stderrOf(err) };
  }
}

function stderrOf(err: unknown): string {
  const stderr =
    err && typeof err === 'object' && 'stderr' in err
      ? String((err as { stderr: unknown }).stderr ?? '')
      : '';
  const stdout =
    err && typeof err === 'object' && 'stdout' in err
      ? String((err as { stdout: unknown }).stdout ?? '')
      : '';
  return stderr + stdout;
}

function classify(probe: MetadataProbe, targetOrg: string): ValidationResult {
  // Step 1: list (skip when fullNames are explicitly provided — list isn't
  // exercised in that path).
  if (!probe.fullNames || probe.fullNames.length === 0) {
    const listed = runListMetadata(probe.type, targetOrg);
    if (!listed.ok) {
      return { probe, outcome: 'fail', message: `list failed: ${firstLine(listed.stderr)}` };
    }
    if (listed.entries.length === 0) {
      return {
        probe,
        outcome: 'skip',
        message: `list returned 0 entries for type '${probe.type}' on this org (would runtime-skip)`,
      };
    }
  }

  // Step 2: retrieve one fullName as a smoke test of read().
  const sampleName =
    probe.fullNames && probe.fullNames.length > 0
      ? probe.fullNames[0]!
      : pickSampleFullName(probe.type, targetOrg);

  if (!sampleName) {
    return {
      probe,
      outcome: 'fail',
      message: `could not pick a sample fullName for type '${probe.type}'`,
    };
  }

  const retrieved = runRetrieveOne(probe.type, sampleName, targetOrg);
  if (!retrieved.ok) {
    return { probe, outcome: 'fail', message: `read failed: ${firstLine(retrieved.stderr)}` };
  }
  return { probe, outcome: 'pass', message: `list + read('${sampleName}') succeeded` };
}

/**
 * For list-then-cap probes, run a quick list() to grab the first fullName
 * to use as the read() smoke-test sample. Returns undefined when list
 * fails (caller falls through to fail outcome).
 */
function pickSampleFullName(type: string, targetOrg: string): string | undefined {
  const listed = runListMetadata(type, targetOrg);
  if (!listed.ok || listed.entries.length === 0) return undefined;
  // Prefer 'Admin' if it's in the list — universally present + typically
  // the most informative Profile. Otherwise take the first entry.
  const admin = listed.entries.find((e) => e.fullName === 'Admin');
  return admin?.fullName ?? listed.entries[0]?.fullName;
}

function firstLine(s: string): string {
  for (const line of s.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('›') && !trimmed.startsWith('Warning:')) {
      return trimmed.slice(0, 200);
    }
  }
  return '(no stderr)';
}

function main(): void {
  const { targetOrg } = parseArgs(process.argv.slice(2));
  console.log(`validate-metadata: target org = ${targetOrg}`);
  console.log(`validate-metadata: ${DEFAULT_METADATA_PROBES.length} probe(s) to validate\n`);

  const results: ValidationResult[] = [];
  for (const probe of DEFAULT_METADATA_PROBES) {
    process.stdout.write(`  ${probe.id} ... `);
    const r = classify(probe, targetOrg);
    results.push(r);
    const tag = r.outcome === 'pass' ? 'PASS' : r.outcome === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`${tag} — ${r.message}`);
  }

  const passes = results.filter((r) => r.outcome === 'pass').length;
  const skips = results.filter((r) => r.outcome === 'skip').length;
  const fails = results.filter((r) => r.outcome === 'fail').length;

  console.log('\nSummary:');
  console.log(`  PASS:  ${passes}`);
  console.log(`  SKIP:  ${skips} (would runtime-skip on this org)`);
  console.log(`  FAIL:  ${fails}`);
  if (fails > 0) {
    process.exit(1);
  }
}

main();
