// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-003: Inventory Portal-Exposed Apex Classes and Flows.
//
// CLI evidence path: scan-core's `cportal-003-portal-exposable-apex-inventory`
// Tooling-SOQL query returns every unmanaged + active ApexClass with its
// SymbolTable JSON. The evaluator walks each class's methods, counts
// those carrying `@AuraEnabled`, `@InvocableMethod`, or `@RestResource`
// annotations, and surfaces the inventory at class + method granularity.
//
// alpha.40 multi-org probe (loan-maven, 36 unmanaged ApexClasses):
//   - 64 @AuraEnabled methods across 5+ classes
//   - 10 @InvocableMethod methods across 5+ classes
//   - 0 @RestResource methods on this org
// Confirmed the SymbolTable.methods[].annotations[].name shape this
// evaluator depends on.
//
// Classification: cli_corroborating (alpha.40 promotion from
// questionnaire_only). The CLI inventory is the universe of
// portal-exposABLE methods. Cross-referencing which subset is actually
// accessible to portal user profiles requires a SetupEntityAccess /
// ProfilePermissionSet join + portal-profile identification, which is
// org-policy territory the consultant arbitrates via questionnaire
// (Q-CPORTAL-003). Future enhancement: auto-cross-reference if a
// tractable approach surfaces. For now, the inventory is the
// corroborating signal.
//
// Flow inventory is NOT in this evaluator's scope — see queries.ts
// comment block. Tracked for a future follow-up.

import type { Evaluator, Evidence, EvaluatorResult } from '../types';
import { attestationEvaluator } from './_attestation';

const QUERY_ID = 'cportal-003-portal-exposable-apex-inventory';
const QUESTION_ID = 'Q-CPORTAL-003';

const PORTAL_ANNOTATIONS = new Set(['AuraEnabled', 'InvocableMethod', 'RestResource']);

const PASS_FINDING =
  'Respondent attests an authoritative inventory of portal-exposed Apex classes and Autolaunched Flows is maintained, including documented profile/permission-set access for each component.';
const FAIL_FINDING =
  'Respondent attests no inventory of portal-exposed Apex classes and Flows exists. External attack surface cannot be assessed; security testing has no authoritative scope.';

interface ClassRow {
  className: string;
  /** Method name → list of portal annotation names found on that method. */
  methodsByName: Map<string, string[]>;
}

const baseAttestation = attestationEvaluator({
  questionId: QUESTION_ID,
  passFinding: PASS_FINDING,
  failFinding: FAIL_FINDING,
});

export const evaluate: Evaluator = (input) => {
  const { evidence } = input;
  const inventory = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === QUERY_ID,
  );

  if (!inventory) {
    return baseAttestation(input);
  }

  const exposable = collectPortalExposableMethods(inventory.rows);
  return buildResult(exposable);
};

/**
 * Walk each ApexClass row's SymbolTable and return the set of classes
 * whose methods carry any of `@AuraEnabled` / `@InvocableMethod` /
 * `@RestResource`. The SymbolTable.methods[i].annotations[].name shape
 * was verified empirically against loan-maven (alpha.40 probe).
 *
 * Defensive: tolerates missing/null SymbolTable (compile errors), missing
 * methods array, missing annotations array, and non-string annotation
 * names. A row that doesn't surface any portal-annotated method is
 * dropped from the result — only classes with at least one such method
 * are inventoried.
 */
function collectPortalExposableMethods(rows: ReadonlyArray<Record<string, unknown>>): ClassRow[] {
  const out: ClassRow[] = [];
  for (const row of rows) {
    const className = typeof row['Name'] === 'string' ? row['Name'] : null;
    if (!className) continue;

    const symbolTable = row['SymbolTable'];
    if (!symbolTable || typeof symbolTable !== 'object') continue;
    const methods = (symbolTable as Record<string, unknown>)['methods'];
    if (!Array.isArray(methods)) continue;

    const methodsByName = new Map<string, string[]>();
    for (const m of methods) {
      if (!m || typeof m !== 'object') continue;
      const methodName =
        typeof (m as Record<string, unknown>)['name'] === 'string'
          ? ((m as Record<string, unknown>)['name'] as string)
          : null;
      if (!methodName) continue;
      const annotations = (m as Record<string, unknown>)['annotations'];
      if (!Array.isArray(annotations)) continue;
      const portalAnns: string[] = [];
      for (const a of annotations) {
        if (!a || typeof a !== 'object') continue;
        const annName = (a as Record<string, unknown>)['name'];
        if (typeof annName === 'string' && PORTAL_ANNOTATIONS.has(annName)) {
          portalAnns.push(annName);
        }
      }
      if (portalAnns.length > 0) {
        methodsByName.set(methodName, portalAnns);
      }
    }

    if (methodsByName.size > 0) {
      out.push({ className, methodsByName });
    }
  }
  out.sort((a, b) => a.className.localeCompare(b.className));
  return out;
}

function buildResult(exposable: ClassRow[]): EvaluatorResult {
  if (exposable.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No unmanaged Apex classes carry @AuraEnabled, @InvocableMethod, or @RestResource methods. ' +
          'No portal-exposable Apex surface to inventory; questionnaire arbitrates whether Flow inventory ' +
          'is also clear (Flow inventory is not yet covered by this CLI evidence path).',
      ],
    };
  }

  const totalMethods = exposable.reduce((acc, c) => acc + c.methodsByName.size, 0);
  const annotationCounts = tallyAnnotations(exposable);
  const topClasses = formatTopClasses(exposable, 5);
  const annSummary = Array.from(annotationCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `@${name} (${n})`)
    .join(', ');

  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${exposable.length} Apex class(es) carry portal-exposable methods (${totalMethods} method(s) total: ${annSummary}). ` +
        `Top classes: ${topClasses}. ` +
        'The audit_procedure scopes to classes accessible to portal user profiles — questionnaire (Q-CPORTAL-003) ' +
        'confirms which of these are actually exposed via Experience Cloud + whether the org maintains a documented ' +
        'inventory matching this list.',
    ],
  };
}

function tallyAnnotations(rows: ReadonlyArray<ClassRow>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const anns of r.methodsByName.values()) {
      for (const ann of anns) {
        counts.set(ann, (counts.get(ann) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function formatTopClasses(rows: ReadonlyArray<ClassRow>, topN: number): string {
  const sorted = [...rows].sort((a, b) => b.methodsByName.size - a.methodsByName.size);
  const named = sorted
    .slice(0, topN)
    .map(
      (c) =>
        `${c.className} (${c.methodsByName.size} method${c.methodsByName.size === 1 ? '' : 's'})`,
    );
  const moreCount = Math.max(0, rows.length - named.length);
  return `${named.join(', ')}${moreCount > 0 ? ` (+${moreCount} more class(es))` : ''}`;
}
