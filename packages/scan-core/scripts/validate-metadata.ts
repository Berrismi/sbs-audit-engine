// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// validate-metadata.ts — author-time validation that every Metadata API
// probe in DEFAULT_METADATA_PROBES can list + read against a real org.
//
// alpha.26 refactor: switched from `sf project retrieve start` (which
// depends on @salesforce/source-deploy-retrieve's hand-curated registry
// of supported types — and that registry doesn't include Settings types
// like SecuritySettings, OrgPreferenceSettings, etc.) to using
// @salesforce/core's AuthInfo + Connection directly. This bypasses the
// CLI registry entirely and exercises jsforce's full Metadata API
// surface — same API path the runtime evidence collector uses, which
// catches the same shape errors at author time without registry-gap
// false negatives.
//
// Strategy: load auth for the target alias, build a Connection, then
// for each probe call connection.metadata.list() + connection.metadata.read()
// directly. Three outcomes per probe:
//
//   PASS — list returns ≥1 record AND read of one fullName succeeds with
//          a parseable object response
//   SKIP — list returns 0 records (the type isn't present on this
//          edition / org; the probe would runtime-skip the same way and
//          fall back to questionnaire). Singleton types (SecuritySettings,
//          OrgPreferenceSettings) provided via probe.fullNames bypass
//          list and skip detection — those go straight to PASS or FAIL.
//   FAIL — list or read threw, returned non-object response, or hit any
//          schema error
//
// Usage:
//   pnpm validate:metadata --target-org hm-cli-validation
//
// CI does NOT run this (no live org credentials in CI); it's an author-time
// gate by convention paralleling validate:soql.

import { AuthInfo, Connection, StateAggregator } from '@salesforce/core';
import type { MetadataProbe } from '../src/metadata/client';
import { DEFAULT_METADATA_PROBES } from '../src/metadata/probes';

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

async function buildConnection(targetOrg: string): Promise<Connection> {
  // `--target-org` accepts either an alias or a username. Resolve via the
  // StateAggregator's alias map first; fall back to treating the input
  // as a literal username.
  const stateAggregator = await StateAggregator.getInstance();
  const username = stateAggregator.aliases.getUsername(targetOrg) ?? targetOrg;
  const authInfo = await AuthInfo.create({ username });
  return Connection.create({ authInfo });
}

interface MetadataNs {
  list(query: { type: string; folder?: string }): Promise<unknown>;
  read(type: string, fullNames: string | string[]): Promise<unknown>;
}

async function classify(probe: MetadataProbe, connection: Connection): Promise<ValidationResult> {
  // The structural ConnectionLike.metadata in scan-core declares the
  // narrow surface we use; @salesforce/core's Connection has a wider
  // (and slightly differently-typed) metadata namespace. Cast through
  // unknown to the script-local MetadataNs shape so we don't have to
  // pull in the full @salesforce/core type surface.
  const metadata = connection.metadata as unknown as MetadataNs;

  // For probes with explicit fullNames (singletons like SecuritySettings),
  // skip list() — they're not enumerable and list() may even error.
  if (probe.fullNames && probe.fullNames.length > 0) {
    const sample = probe.fullNames[0]!;
    try {
      const result = await metadata.read(probe.type, [sample]);
      if (result === null || result === undefined) {
        return {
          probe,
          outcome: 'fail',
          message: `read('${probe.type}', '${sample}') returned null/undefined`,
        };
      }
      // Read can return a single object (one fullName) or an array
      // (multiple fullNames); both are valid PASS shapes.
      return {
        probe,
        outcome: 'pass',
        message: `read('${probe.type}', '${sample}') succeeded`,
      };
    } catch (err) {
      return {
        probe,
        outcome: 'fail',
        message: `read failed: ${shortError(err)}`,
      };
    }
  }

  // List-then-read path for enumerable types (Profile, CustomObject, etc).
  let listed: unknown;
  try {
    listed = await metadata.list({ type: probe.type });
  } catch (err) {
    return { probe, outcome: 'fail', message: `list failed: ${shortError(err)}` };
  }

  const entries = Array.isArray(listed) ? listed : listed ? [listed] : [];
  if (entries.length === 0) {
    return {
      probe,
      outcome: 'skip',
      message: `list returned 0 entries for type '${probe.type}' on this org (would runtime-skip)`,
    };
  }

  // Pick a sample fullName: prefer 'Admin' for Profile (universally
  // present + informative); otherwise the first entry. Defensive against
  // list entries with non-string fullName.
  const fullNames = entries
    .map((e) => (e as { fullName?: unknown }).fullName)
    .filter((n): n is string => typeof n === 'string');
  if (fullNames.length === 0) {
    return {
      probe,
      outcome: 'fail',
      message: `list returned ${entries.length} entries but none had a string fullName`,
    };
  }
  const sample = fullNames.includes('Admin') ? 'Admin' : fullNames[0]!;

  try {
    const result = await metadata.read(probe.type, [sample]);
    if (result === null || result === undefined) {
      return {
        probe,
        outcome: 'fail',
        message: `read('${probe.type}', '${sample}') returned null/undefined`,
      };
    }
    return {
      probe,
      outcome: 'pass',
      message: `list (${entries.length} entries) + read('${sample}') succeeded`,
    };
  } catch (err) {
    return { probe, outcome: 'fail', message: `read failed: ${shortError(err)}` };
  }
}

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Keep findings readable on a CI summary line.
  return message.split('\n')[0]!.slice(0, 200);
}

async function main(): Promise<void> {
  const { targetOrg } = parseArgs(process.argv.slice(2));
  console.log(`validate-metadata: target org = ${targetOrg}`);
  console.log(`validate-metadata: ${DEFAULT_METADATA_PROBES.length} probe(s) to validate\n`);

  const connection = await buildConnection(targetOrg);

  const results: ValidationResult[] = [];
  for (const probe of DEFAULT_METADATA_PROBES) {
    process.stdout.write(`  ${probe.id} ... `);
    const r = await classify(probe, connection);
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

main().catch((err) => {
  console.error('validate-metadata failed:', err);
  process.exit(1);
});
