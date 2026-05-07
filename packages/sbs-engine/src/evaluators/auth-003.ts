// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-AUTH-003: Prohibit Broad or Unrestricted Profile Login IP Ranges.
//
// CLI evidence path: shared `profiles-priority-100` Metadata API probe
// returns each Profile's `loginIpRanges` array. The evaluator inspects
// each range and flags any that effectively cover the whole IPv4 space
// (the audit_procedure's worked example: `0.0.0.0–255.255.255.255`).
//
// Classification: cli_primary. The metadata IS the source of truth for
// this control — `loginIpRanges` either contain an overly-broad range
// or they don't, and the inspection is mechanical. The questionnaire
// fallback exists for orgs where the Metadata API isn't reachable
// (edition-gated absence of the namespace, scoped-down auth, etc.) but
// when metadata evidence is present, the verdict is metadata-derived
// pass/fail at high confidence.
//
// Threshold for "overly broad": a range is overly broad when it spans
// >= 2^24 IPv4 addresses (a /8). This catches the worked example
// (`0.0.0.0–255.255.255.255`, ~4.3 billion addresses) and other
// near-internet-wide ranges (e.g. `1.0.0.0–255.255.255.255`) without
// false-positiving narrower-but-still-large corporate ranges. /8 is the
// largest IANA-allocated block size, so any single range >= /8 strongly
// implies "we just allowlisted everything".
//
// Pass shape: every Profile that HAS loginIpRanges has only narrow
// ranges (< /8 each). Profiles WITHOUT loginIpRanges configured do not
// fail — they're outside this control's scope (see SBS-AUTH-002 for
// the "should every profile have IP restrictions?" question). Fail =
// at least one Profile carries one or more overly-broad ranges.

import { metadataApiEvaluator } from './_metadata-api';

const PROFILE_TYPE = 'Profile';
// /8 = 16,777,216 addresses. A /8 IPv4 block is the largest IANA-allocated
// unit; anything covering >= a /8 in a single range is "effectively the
// internet" by any sensible interpretation. Smaller corporate ranges (a
// few /16s or a handful of /24s) stay below this threshold.
const OVERLY_BROAD_SPAN_THRESHOLD = 16_777_216;

interface LoginIpRange {
  startAddress: string;
  endAddress: string;
  description?: string;
}

interface ProfileWithBroadRanges {
  fullName: string;
  broadRanges: { startAddress: string; endAddress: string; spanCount: number }[];
}

export const evaluate = metadataApiEvaluator({
  questionId: 'Q-AUTH-003',
  passFinding:
    'Respondent attests all profile-level login IP restrictions are narrow enough to actually limit access (no `0.0.0.0/0` or other internet-wide ranges).',
  failFinding:
    'Respondent attests at least one profile has an unrestricted login IP range (e.g., `0.0.0.0/0`) that defeats the purpose of IP allow-listing.',
  metadataType: PROFILE_TYPE,
  evaluateMetadata: (records) => {
    const offenders = collectOverlyBroadProfiles(records);
    if (offenders.length === 0) {
      const inspected = countProfilesWithRanges(records);
      if (inspected === 0) {
        return {
          status: 'inconclusive',
          findings: [
            `No profiles have loginIpRanges configured (across ${records.length} profile(s) inspected). This control's pass condition only applies to profiles that DO have IP restrictions; whether the org SHOULD have IP restrictions is questionnaire territory (Q-AUTH-002). Defer.`,
          ],
        };
      }
      return {
        status: 'pass',
        findings: [
          `All ${inspected} profile(s) with loginIpRanges configured use narrow ranges (each below the /8 threshold of ${OVERLY_BROAD_SPAN_THRESHOLD.toLocaleString()} addresses). No internet-wide allowlists found across ${records.length} profile(s) inspected.`,
        ],
      };
    }

    const sample = formatOffenderSample(offenders);
    return {
      status: 'fail',
      findings: [
        `${offenders.length} profile(s) carry one or more overly-broad login IP ranges (each >= /8 = ${OVERLY_BROAD_SPAN_THRESHOLD.toLocaleString()} addresses, effectively internet-wide). ${sample}`,
      ],
    };
  },
});

/**
 * Walk every Profile record's loginIpRanges and return those with at least
 * one range exceeding the /8 threshold. Defensive: tolerates missing
 * loginIpRanges (treats as no restriction = no offense), missing
 * fullName (skips that record), and unparseable IP addresses (skips that
 * range, doesn't fail the whole record).
 */
function collectOverlyBroadProfiles(
  records: ReadonlyArray<Record<string, unknown>>,
): ProfileWithBroadRanges[] {
  const out: ProfileWithBroadRanges[] = [];
  for (const record of records) {
    const fullName = typeof record['fullName'] === 'string' ? record['fullName'] : null;
    if (!fullName) continue;
    const ranges = extractRanges(record['loginIpRanges']);
    const broadRanges: ProfileWithBroadRanges['broadRanges'] = [];
    for (const r of ranges) {
      const span = ipv4Span(r.startAddress, r.endAddress);
      if (span >= OVERLY_BROAD_SPAN_THRESHOLD) {
        broadRanges.push({
          startAddress: r.startAddress,
          endAddress: r.endAddress,
          spanCount: span,
        });
      }
    }
    if (broadRanges.length > 0) {
      out.push({ fullName, broadRanges });
    }
  }
  out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return out;
}

/**
 * Count Profiles where loginIpRanges has at least one entry. Profiles with
 * an empty/missing loginIpRanges aren't in this control's scope; they're
 * trivially "no overly-broad range" but also "no protection at all".
 */
function countProfilesWithRanges(records: ReadonlyArray<Record<string, unknown>>): number {
  let count = 0;
  for (const record of records) {
    const ranges = extractRanges(record['loginIpRanges']);
    if (ranges.length > 0) count++;
  }
  return count;
}

/**
 * Normalize the loginIpRanges field into an array of { startAddress,
 * endAddress } objects. jsforce returns:
 *   - A single object when the Profile has exactly one range
 *   - An array when there are multiple
 *   - Undefined / missing when there are none
 * Be tolerant of all three; drop entries missing either endpoint.
 */
function extractRanges(raw: unknown): LoginIpRange[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  const out: LoginIpRange[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o['startAddress'] !== 'string' || typeof o['endAddress'] !== 'string') continue;
    const range: LoginIpRange = {
      startAddress: o['startAddress'],
      endAddress: o['endAddress'],
    };
    if (typeof o['description'] === 'string') range.description = o['description'];
    out.push(range);
  }
  return out;
}

/**
 * Span (inclusive count) of an IPv4 range. Returns 0 when either endpoint
 * fails to parse — the caller treats 0 as "not overly broad" which is
 * correct: an unparseable range can't be reliably classified, and we'd
 * rather under-flag than fail-the-Profile on a parse error.
 */
function ipv4Span(start: string, end: string): number {
  const s = parseIpv4(start);
  const e = parseIpv4(end);
  if (s === null || e === null || e < s) return 0;
  return e - s + 1;
}

/**
 * Parse a dotted-quad IPv4 string into a 32-bit integer. Strict: rejects
 * any input that isn't four 0-255 octets. Returns null on failure.
 */
function parseIpv4(addr: string): number | null {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/**
 * Format the first 5 offending profiles + their broad ranges for the
 * finding line. Caps at 5 with a "+N more" tail.
 */
function formatOffenderSample(offenders: ReadonlyArray<ProfileWithBroadRanges>): string {
  const named = offenders.slice(0, 5).map((o) => {
    const firstRange = o.broadRanges[0]!;
    return `${o.fullName} (${firstRange.startAddress}–${firstRange.endAddress})`;
  });
  const moreCount = Math.max(0, offenders.length - named.length);
  return `Sample: ${named.join('; ')}${moreCount > 0 ? ` (+${moreCount} more profile(s))` : ''}.`;
}
