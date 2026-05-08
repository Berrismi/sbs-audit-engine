// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-002: Pre-Merge Static Code Analysis for Apex and LWC.
//
// CLI evidence path: scan-core's Code Analyzer integration (Block D)
// runs the analyzer against the customer's metadata + returns the
// security-tagged findings list. This is **circumstantial** evidence
// about CODE-002: the audit asks whether SAST runs in the customer's
// CI before merge, not whether their code currently has findings. But
// the volume + breakdown of current findings IS informative — many
// security violations on retrieved code suggests effective pre-merge
// scanning is NOT catching them.
//
// alpha.36+ uses the Security rule-selector by default (see
// scan-core/src/code-analyzer/runner.ts for the multi-org baseline that
// motivated this), so all observed findings are security-tagged: in
// loan-maven the top rules are ApexCRUDViolation (190), ApexFlsViolation
// (131), DatabaseOperationsMustUseWithSharing (8), ApexSOQLInjection (6).
// The narrative below names the top 3 rules + their counts so the
// consultant gets actionable specificity instead of a raw total.
//
// Classification: cli_corroborating. Code Analyzer observations raise
// confidence when paired with questionnaire attestation; questionnaire
// alone is the verdict-bearing source.

import { corroboratingCodeAnalyzerEvaluator } from './_attestation';

const TOP_RULE_SAMPLE = 3;

export const evaluate = corroboratingCodeAnalyzerEvaluator({
  questionId: 'Q-CODE-002',
  passFinding:
    'Respondent attests an automated security scanner (e.g., Salesforce Code Analyzer, PMD) runs on every code change before merge.',
  failFinding:
    'Respondent attests pre-merge static security analysis is NOT in place. SOQL injection and other code-level issues commonly slip through without it.',
  observe: (ca) => {
    const total = ca.findings.length;
    const highOrCritical = ca.findings.filter(
      (f) => f.severity === 'Critical' || f.severity === 'High',
    ).length;
    if (total === 0) {
      return [
        `Code Analyzer (engine: ${ca.engine}) reported 0 security-tagged findings on the retrieved metadata. ` +
          "Suggestive of effective pre-merge SAST, but doesn't prove a CI step exists — the questionnaire arbitrates whether the pipeline enforces this.",
      ];
    }
    const topRules = formatTopRules(ca.findings, TOP_RULE_SAMPLE);
    return [
      `Code Analyzer (engine: ${ca.engine}, security-tagged ruleset) reported ${total} finding(s), ` +
        `${highOrCritical} of severity High or Critical. Top rule(s): ${topRules}. ` +
        'Findings of this volume on retrieved code suggest pre-merge SAST is either absent or not blocking — circumstantial evidence the questionnaire arbitrates.',
    ];
  },
});

/**
 * Tally findings by their `rule` field (already a string per the
 * CodeAnalyzerFinding shape — the parser normalizes whatever Code
 * Analyzer's per-version JSON schema emits down to a flat rule name).
 * Returns the top N as a comma-separated "RuleName (count)" string,
 * tie-broken alphabetically.
 */
function formatTopRules(findings: ReadonlyArray<{ rule: string }>, topN: number): string {
  const counts = new Map<string, number>();
  for (const f of findings) {
    counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted
    .slice(0, topN)
    .map(([name, n]) => `${name} (${n})`)
    .join(', ');
}
