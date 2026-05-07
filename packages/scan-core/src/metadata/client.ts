// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Salesforce Metadata API client (Phase 3c Track B foundation).
//
// Retrieves Profile / SecuritySettings / CustomObject / CustomField metadata
// via the @salesforce/core Connection's `metadata` namespace (which delegates
// to jsforce internally). The retrieved shape is the JSON the metadata API
// produces — NOT the raw XML — because per the Track B design review the
// evidence variant chose `jsforce JSON only` (no parser dep). If a future
// control needs raw XML access, this client can be extended without
// breaking existing evidence consumers.
//
// Sister of `health-check/client.ts` and `limits/client.ts`. Same shape:
// `fetchMetadata` returns a tagged-union result with kinds `ok` /
// `unsupported` / `failed`. `unsupported` fires when `connection.metadata`
// is absent (older edition or stripped-down test connection).
//
// Profile cap policy (Q3 of design review): the Metadata API returns every
// Profile in the org via `list({ type: 'Profile' })`, then we cap retrieval
// at 100 Profiles with priority ordering (Standard User → System
// Administrator → integration-shaped → custom alphabetical). The cap +
// caveat is surfaced through `MetadataFetchOk.cap` so evaluators can render
// it in findings.

import type { ConnectionLike } from '../types';

/** A successful retrieval for one metadata type. */
export interface MetadataFetchTypeResult {
  type: string;
  /** The fullName-keyed records returned by Metadata API read(). */
  records: Record<string, unknown>[];
  /** When the org has more fullNames than `cap`, this carries the
   * inventory size + how many we actually retrieved. Undefined when the
   * cap was not hit. */
  cap?: { available: number; retrieved: number };
}

export type MetadataFetchResult =
  | { kind: 'ok'; results: MetadataFetchTypeResult[] }
  | { kind: 'unsupported'; reason: 'no_metadata_namespace' }
  | { kind: 'failed'; error: { message: string } };

/** One metadata-type probe — the unit `validate-metadata` validates and
 *  the unit `collectEvidence` retrieves. */
export interface MetadataProbe {
  /** Stable id for telemetry + tests (e.g. 'profiles-priority-100'). */
  id: string;
  /** Metadata type name as Salesforce expects it: 'Profile',
   * 'SecuritySettings', 'CustomObject'. */
  type: string;
  /** When provided, retrieve exactly these fullNames (e.g. ['SecuritySettings']
   * for the singleton SecuritySettings type). When undefined, list() the
   * type first and apply `cap` + `prioritize`. */
  fullNames?: readonly string[];
  /** Maximum number of records to retrieve when discovered via list().
   * Defaults to 100 (Q3 of Track B design review). Ignored when fullNames
   * is provided. */
  cap?: number;
  /** Optional priority comparator applied before `cap` is enforced. When
   * absent, defaults to `prioritizeProfileNames` for type === 'Profile' and
   * a no-op alphabetical sort otherwise. */
  prioritize?: (names: readonly string[]) => string[];
}

const DEFAULT_PROFILE_CAP = 100;

/**
 * Run all probes and return one MetadataFetchTypeResult per probe (or a
 * top-level `unsupported` / `failed` if the namespace is absent or the
 * first call throws). Sequential to keep total request budget predictable;
 * the Metadata API is rate-limited and parallelizing with no per-org
 * knowledge can trip those limits faster than we'd want for a "simple"
 * scan.
 */
export async function fetchMetadata(
  connection: ConnectionLike,
  probes: readonly MetadataProbe[],
): Promise<MetadataFetchResult> {
  if (!connection.metadata) {
    return { kind: 'unsupported', reason: 'no_metadata_namespace' };
  }
  const results: MetadataFetchTypeResult[] = [];
  for (const probe of probes) {
    try {
      results.push(await fetchOneProbe(connection, probe));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'failed', error: { message: `${probe.id}: ${message}` } };
    }
  }
  return { kind: 'ok', results };
}

async function fetchOneProbe(
  connection: ConnectionLike,
  probe: MetadataProbe,
): Promise<MetadataFetchTypeResult> {
  // Asserted by the caller (`fetchMetadata` returns 'unsupported' when
  // metadata is absent); narrowing here is purely for downstream typing.
  const m = connection.metadata!;

  // Path A: explicit fullNames provided — read() directly, no list() round-trip.
  if (probe.fullNames && probe.fullNames.length > 0) {
    const records = await readRecords(m, probe.type, probe.fullNames);
    return { type: probe.type, records };
  }

  // Path B: discovery — list, prioritize, cap, then read.
  const listed = await m.list({ type: probe.type });
  const allNames = listed.map((p) => p.fullName).filter((n): n is string => typeof n === 'string');
  const prioritized = (probe.prioritize ?? defaultPrioritizer(probe.type))(allNames);
  const cap = probe.cap ?? DEFAULT_PROFILE_CAP;
  const toRead = prioritized.slice(0, cap);
  const records = await readRecords(m, probe.type, toRead);
  const result: MetadataFetchTypeResult = { type: probe.type, records };
  if (allNames.length > cap) {
    result.cap = { available: allNames.length, retrieved: toRead.length };
  }
  return result;
}

/**
 * Wrap jsforce's `metadata.read()` to always return an array, even when
 * the underlying API returns a single object for a one-element fullName
 * list. Matches the inventory-shape evaluators expect.
 *
 * The Salesforce Metadata API caps each `read()` call at **10 fullNames**.
 * Larger batches return `EXCEEDED_ID_LIMIT: record limit reached. cannot
 * submit more than 10 records in this operation.` This helper chunks the
 * input into groups of 10 and concatenates the per-chunk results so callers
 * see a single flat array regardless of input size.
 *
 * Discovered empirically while running the multi-org verification on
 * alpha.29 (validate:metadata succeeded because it only smoke-tested ONE
 * fullName per probe; runtime reads of full Profile inventories failed).
 * The cap isn't documented in the Salesforce Metadata API SOAP reference
 * with a specific number — only as "limit reached" — but 10 is the
 * empirically observed ceiling and matches several community forum reports.
 */
const METADATA_READ_CHUNK_SIZE = 10;

async function readRecords(
  m: NonNullable<ConnectionLike['metadata']>,
  type: string,
  fullNames: readonly string[],
): Promise<Record<string, unknown>[]> {
  if (fullNames.length === 0) return [];
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < fullNames.length; i += METADATA_READ_CHUNK_SIZE) {
    const chunk = fullNames.slice(i, i + METADATA_READ_CHUNK_SIZE);
    const raw = await m.read<Record<string, unknown>>(type, [...chunk]);
    if (Array.isArray(raw)) {
      out.push(...raw);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/**
 * Default priority comparator for Profile fullNames. Standard / well-known
 * profiles sort first, then integration-shaped names, then alphabetical
 * remainder. Kept stable + transitive so list().slice(0, cap) is
 * deterministic across runs. Per Q3 of the Track B design review
 * (recommended cap = 100, priority order documented).
 */
export function prioritizeProfileNames(names: readonly string[]): string[] {
  // Lower score = higher priority. The patterns are tested in order; the
  // first match wins. Names that match no pattern fall to the final tier
  // and sort alphabetically.
  const PATTERNS: ReadonlyArray<RegExp> = [
    /^Standard User$/i,
    /^System Administrator$/i,
    /^Admin$/i,
    /^Integration User$/i,
    /Integration/i,
    /\bAPI\b/i,
    /Service/i,
  ];
  const score = (name: string): number => {
    for (let i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i]!.test(name)) return i;
    }
    return PATTERNS.length;
  };
  return [...names].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

/** Pick a default prioritizer per type. Profile gets the named-pattern
 *  prioritizer; everything else gets a stable alphabetical sort. */
function defaultPrioritizer(type: string): (names: readonly string[]) => string[] {
  if (type === 'Profile') return prioritizeProfileNames;
  return (names) => [...names].sort((a, b) => a.localeCompare(b));
}
