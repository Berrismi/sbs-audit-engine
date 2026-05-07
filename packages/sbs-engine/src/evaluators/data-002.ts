// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-002: Maintain an Inventory of Long Text Area Fields Containing
// Regulated Data.
//
// CLI evidence path: scan-core query `data-002-lta-rich-text-field-inventory`
// returns one EntityDefinition row per customizable entity, each with a
// Fields subquery containing only Long Text Area + Rich Text Area fields.
// The evaluator unrolls the parent/child shape, filters out entities with
// 0 LTA/Rich rows, and reports (entity_count, total_field_count) as the
// platform-side inventory size.
//
// Why LTA + Rich Text Area together: both are long-form free-text
// containers used for unstructured commentary. The audit_procedure
// nominally targets "Long Text Area fields", but Rich Text Area is
// functionally the same risk surface (admins use them interchangeably for
// notes/comments/descriptions, and Rich Text Area routinely holds the same
// kind of free-text PII as LTA). A complete inventory needs both.
//
// Classification: cli_corroborating. SOQL surfaces the WHERE-they-live
// (count + per-entity breakdown of LTA/Rich Text fields); the questionnaire
// adjudicates the harder WHICH-of-them-contain-regulated-data question
// (Q-DATA-002) — that classification depends on operational use, retention
// policy, and DLP scan output that aren't queryable via the metadata API.

import { cliAttestationEvaluator } from './_attestation';

const QUERY_ID = 'data-002-lta-rich-text-field-inventory';

interface EntityRollup {
  entity: string;
  fieldCount: number;
}

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-DATA-002',
  passFinding:
    'Respondent attests they keep an up-to-date inventory of every Long Text Area field that contains regulated data.',
  failFinding:
    'Respondent attests they do NOT maintain an inventory of Long Text Area fields containing regulated data. Without it, controls cannot be applied to the right fields.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const rollup = collectRollup(rows);
    if (rollup.length === 0) {
      return {
        status: 'pass',
        findings: [
          'No Long Text Area or Rich Text Area fields exist on any customizable entity in the org. Trivially compliant on the inventory dimension — there is no LTA/Rich-text surface to enumerate. Confirm via questionnaire that no regulated data is stored in any other free-text field type out-of-scope for this query (e.g., Text(255) fields used for notes).',
        ],
      };
    }
    const totalFields = rollup.reduce((acc, r) => acc + r.fieldCount, 0);
    const sampleClause = formatTopEntities(rollup);
    return {
      status: 'inconclusive',
      findings: [
        `${totalFields} Long Text Area / Rich Text Area field(s) inventoried across ${rollup.length} entity(ies).${sampleClause} ` +
          'SOQL surfaces the WHERE-they-live; the documented inventory + per-field regulated-data classification ' +
          'must be verified against the system of record (questionnaire Q-DATA-002).',
      ],
    };
  },
});

/**
 * Walk the EntityDefinition rows + their `Fields` subquery rows. Returns
 * one rollup per entity that has ≥1 LTA/Rich Text field, sorted by
 * fieldCount desc, then alphabetically by entity name (stable order for
 * deterministic findings). Entities with 0 matching fields are dropped —
 * the underlying SOQL returns every customizable entity even if it has no
 * matches, so this filter is the responsibility of the evaluator.
 */
function collectRollup(rows: ReadonlyArray<Record<string, unknown>>): EntityRollup[] {
  const out: EntityRollup[] = [];
  for (const row of rows) {
    const entity = typeof row['QualifiedApiName'] === 'string' ? row['QualifiedApiName'] : null;
    if (!entity) continue;
    const fieldsContainer = row['Fields'];
    if (!isRecord(fieldsContainer)) continue;
    const fieldRows = Array.isArray(fieldsContainer['records']) ? fieldsContainer['records'] : [];
    if (fieldRows.length === 0) continue;
    out.push({ entity, fieldCount: fieldRows.length });
  }
  out.sort((a, b) => {
    if (b.fieldCount !== a.fieldCount) return b.fieldCount - a.fieldCount;
    return a.entity.localeCompare(b.entity);
  });
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Build a "Top entities: Account (3 fields), Case (2 fields), +N more"
 * clause from the rollup. Caps the named list at 5 to keep the finding
 * line PDF-friendly. Returns "" when the input is empty (the caller
 * already handles that path, but keep this defensive).
 */
function formatTopEntities(rollup: ReadonlyArray<EntityRollup>): string {
  if (rollup.length === 0) return '';
  const named = rollup.slice(0, 5);
  const moreCount = Math.max(0, rollup.length - named.length);
  const namedClause = named.map((r) => `${r.entity} (${r.fieldCount})`).join(', ');
  return ` Top entities by field count: ${namedClause}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`;
}
