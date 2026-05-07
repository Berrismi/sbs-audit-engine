// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-004: Require Field History Tracking for Sensitive Fields.
//
// CLI evidence path: shared `custom-objects-priority-100` Metadata API
// probe returns each CustomObject's `enableHistory` flag + child fields'
// `trackHistory` flags. The evaluator surfaces the inventory of objects
// with field history infrastructure enabled + count of fields with
// trackHistory.
//
// Classification: cli_corroborating. The metadata surfaces WHICH fields
// have trackHistory enabled; the questionnaire (Q-DATA-004) confirms
// WHETHER the customer's documented sensitive-field list is covered by
// that tracking. The "is this field sensitive?" classification is
// inherently customer-policy territory (no platform primitive can tag
// regulated data without DLP scan output) so a pure cli_primary path
// would over-claim.
//
// Outcomes:
//   - 0 objects inspected → inconclusive (defer to questionnaire; no
//                           CustomObject metadata to read)
//   - N objects, 0 with enableHistory → inconclusive (no field history
//                                       infrastructure exists; customer
//                                       must enable + configure)
//   - N objects, M with enableHistory but 0 tracked fields → inconclusive
//                                       with warning (object-level
//                                       tracking enabled but no fields
//                                       actually being tracked = misconfig)
//   - N objects, K total tracked fields → inconclusive surfacing inventory
//                                       (defer to questionnaire whether
//                                       the customer's sensitive-field
//                                       list is fully covered)

import { metadataApiEvaluator } from './_metadata-api';

const CUSTOM_OBJECT_TYPE = 'CustomObject';

interface ObjectTrackingSummary {
  fullName: string;
  enableHistory: boolean;
  trackedFieldCount: number;
  totalFieldCount: number;
}

export const evaluate = metadataApiEvaluator({
  questionId: 'Q-DATA-004',
  passFinding:
    'Respondent attests every field they have identified as sensitive has Field History Tracking enabled.',
  failFinding:
    'Respondent attests at least one sensitive field is NOT covered by Field History Tracking. Without it, unauthorized changes go undetected.',
  metadataType: CUSTOM_OBJECT_TYPE,
  evaluateMetadata: (records) => {
    if (records.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          'No CustomObject metadata available to inspect for Field History Tracking. Defer to questionnaire.',
        ],
      };
    }

    const summaries = collectTrackingSummary(records);
    const objectsWithHistory = summaries.filter((s) => s.enableHistory);
    const totalTrackedFields = objectsWithHistory.reduce((acc, s) => acc + s.trackedFieldCount, 0);

    if (objectsWithHistory.length === 0) {
      return {
        status: 'inconclusive',
        findings: [
          `0 of ${summaries.length} CustomObject(s) inspected have Field History Tracking enabled at the object level. Without enableHistory, no field-level tracking is possible. Defer to questionnaire to confirm whether the org has a documented sensitive-field list and whether tracking infrastructure is intentionally absent or pending configuration.`,
        ],
      };
    }

    if (totalTrackedFields === 0) {
      const sample = formatObjectSample(objectsWithHistory);
      return {
        status: 'inconclusive',
        findings: [
          `${objectsWithHistory.length} of ${summaries.length} CustomObject(s) have enableHistory=true at the object level but ZERO fields actually have trackHistory=true on any of them. ${sample} This is a likely misconfiguration: object-level tracking is enabled but no fields have been selected for tracking. Defer to questionnaire to confirm intent.`,
        ],
      };
    }

    const sample = formatObjectInventorySample(objectsWithHistory);
    return {
      status: 'inconclusive',
      findings: [
        `${totalTrackedFields} field(s) with trackHistory enabled across ${objectsWithHistory.length} of ${summaries.length} CustomObject(s) inspected. ${sample} Whether this covers every sensitive field per the customer's documented list is questionnaire territory (Q-DATA-004).`,
      ],
    };
  },
});

/**
 * Walk CustomObject records and extract enableHistory + per-field
 * trackHistory counts. Defensive: tolerates missing fullName (skip),
 * missing fields array (counts as 0 tracked), single-field shape (jsforce
 * one-element form).
 */
function collectTrackingSummary(
  records: ReadonlyArray<Record<string, unknown>>,
): ObjectTrackingSummary[] {
  const out: ObjectTrackingSummary[] = [];
  for (const record of records) {
    const fullName = typeof record['fullName'] === 'string' ? record['fullName'] : null;
    if (!fullName) continue;
    const enableHistory = record['enableHistory'] === true;
    const fields = extractFields(record['fields']);
    const trackedFieldCount = fields.filter((f) => f['trackHistory'] === true).length;
    out.push({
      fullName,
      enableHistory,
      trackedFieldCount,
      totalFieldCount: fields.length,
    });
  }
  out.sort((a, b) => {
    if (b.trackedFieldCount !== a.trackedFieldCount) {
      return b.trackedFieldCount - a.trackedFieldCount;
    }
    return a.fullName.localeCompare(b.fullName);
  });
  return out;
}

/**
 * Normalize the `fields` field on a CustomObject record into an array.
 * jsforce returns:
 *   - An array when there are multiple fields
 *   - A single object when there's exactly one
 *   - Undefined when the object has no custom fields
 */
function extractFields(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null);
}

/**
 * "Top entities by tracked-field count: Account (3), Contact (2), +N more"
 * — caps at 5 named entries with a "+N more" tail.
 */
function formatObjectInventorySample(summaries: ReadonlyArray<ObjectTrackingSummary>): string {
  const named = summaries.slice(0, 5).map((s) => `${s.fullName} (${s.trackedFieldCount})`);
  const moreCount = Math.max(0, summaries.length - named.length);
  return `Top objects by tracked-field count: ${named.join(', ')}${moreCount > 0 ? ` (+${moreCount} more object(s))` : ''}.`;
}

/**
 * Plain object-name list (no per-object counts) — used in the misconfig
 * finding where the count is uniformly zero. Caps at 5 with "+N more".
 */
function formatObjectSample(summaries: ReadonlyArray<ObjectTrackingSummary>): string {
  const named = summaries.slice(0, 5).map((s) => s.fullName);
  const moreCount = Math.max(0, summaries.length - named.length);
  return `Sample: ${named.join(', ')}${moreCount > 0 ? ` (+${moreCount} more object(s))` : ''}.`;
}
