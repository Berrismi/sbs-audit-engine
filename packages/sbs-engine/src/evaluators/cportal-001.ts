// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CPORTAL-001: Prevent Insecure Direct Object Reference (IDOR) in
// Portal Apex.
//
// CLI evidence path: scan-core's Code Analyzer integration runs the
// security-tagged ruleset (alpha.36 default — see runner.ts) against
// the customer's retrieved metadata. We filter the resulting findings
// to the 5 rules that map to the SBS-CPORTAL-001 audit_procedure:
//
//   - ApexCRUDViolation                  (PMD)  — CRUD enforcement
//   - ApexFlsViolation                   (sfge) — FLS enforcement
//   - ApexSharingViolations              (PMD)  — sharing model
//   - DatabaseOperationsMustUseWithSharing (sfge) — without-sharing risks
//   - ApexSOQLInjection                  (PMD)  — SOQL injection
//
// These are the rule-name signals that correspond to the audit_procedure's
// "verify with sharing / CRUD-FLS / dynamic SOQL sanitization" steps.
//
// Classification: cli_corroborating (alpha.39 promotion from
// questionnaire_only). Code Analyzer doesn't know which Apex is
// portal-exposed — that's the audit_procedure's first step (identify
// `@AuraEnabled` / `@InvocableMethod` / `@RestResource` accessible to
// portal users), and the in-scope subset is questionnaire territory
// (the upcoming Tooling API SymbolTable work in alpha.40 will provide
// the inventory). Until then: CLI surfaces every IDOR-shaped finding
// across ALL retrieved Apex; questionnaire arbitrates which subset is
// in portal scope. This matches the same shape as CODE-002 — strong
// corroborating signal, not verdict-bearing.

import { corroboratingCodeAnalyzerEvaluator } from './_attestation';
import type { CodeAnalyzerFinding } from '../types';

const IDOR_RULE_NAMES = new Set([
  'ApexCRUDViolation',
  'ApexFlsViolation',
  'ApexSharingViolations',
  'DatabaseOperationsMustUseWithSharing',
  'ApexSOQLInjection',
] as const);

const TOP_RULE_SAMPLE = 3;

export const evaluate = corroboratingCodeAnalyzerEvaluator({
  questionId: 'Q-CPORTAL-001',
  passFinding:
    'Respondent attests no portal Apex method accepts a record ID directly from the user — every record lookup is bound to the logged-in user context.',
  failFinding:
    'Respondent attests they cannot confirm portal Apex methods are free of parameter-based record access. This is the canonical IDOR (insecure direct object reference) vector for portals.',
  observe: (ca) => {
    const idor = ca.findings.filter((f) => IDOR_RULE_NAMES.has(f.rule as never));
    if (idor.length === 0) {
      return [
        `Code Analyzer (engine: ${ca.engine}, security-tagged ruleset) reported 0 IDOR-shaped findings ` +
          `(ApexCRUDViolation, ApexFlsViolation, ApexSharingViolations, DatabaseOperationsMustUseWithSharing, ApexSOQLInjection) ` +
          'on retrieved Apex. Suggestive of compliant portal Apex — questionnaire arbitrates which methods are actually in @AuraEnabled / @InvocableMethod / @RestResource portal scope.',
      ];
    }
    const top = formatTopRules(idor, TOP_RULE_SAMPLE);
    const filesAffected = new Set(idor.map((f) => f.file)).size;
    return [
      `Code Analyzer (engine: ${ca.engine}, security-tagged ruleset) reported ${idor.length} IDOR-shaped finding(s) ` +
        `across ${filesAffected} Apex file(s). Top rule(s): ${top}. ` +
        'Critical-tier risk surface — the audit_procedure scopes to portal-exposed Apex specifically; questionnaire (Q-CPORTAL-001) confirms which findings sit in @AuraEnabled / @InvocableMethod / @RestResource methods accessible to portal users.',
    ];
  },
});

function formatTopRules(findings: ReadonlyArray<CodeAnalyzerFinding>, topN: number): string {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([n, c]) => `${n} (${c})`)
    .join(', ');
}
