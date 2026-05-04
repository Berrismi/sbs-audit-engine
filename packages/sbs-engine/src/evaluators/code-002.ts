// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-CODE-002: Pre-Merge Static Code Analysis for Apex and LWC.
//
// CLI evidence path: scan-core's Code Analyzer integration (Block D)
// runs the analyzer against the customer's metadata + returns the full
// findings list. This is **circumstantial** evidence about CODE-002:
// the audit asks whether SAST runs in the customer's CI before merge,
// not whether their code currently has findings. But the size + severity
// of current findings IS informative — many high-severity findings
// suggests effective pre-merge scanning is NOT catching them.
//
// Classification: cli_corroborating. Code Analyzer observations raise
// confidence when paired with questionnaire attestation; questionnaire
// alone is the verdict-bearing source.

import { corroboratingCodeAnalyzerEvaluator } from './_attestation';

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
        `Code Analyzer (engine: ${ca.engine}) reported 0 findings on the retrieved metadata. ` +
          "Suggestive of effective pre-merge SAST, but doesn't prove a CI step exists — the questionnaire arbitrates whether the pipeline enforces this.",
      ];
    }
    return [
      `Code Analyzer (engine: ${ca.engine}) reported ${total} finding(s), ` +
        `${highOrCritical} of severity High or Critical. Many high-severity findings on retrieved code suggests ` +
        'pre-merge SAST is either absent or not blocking — circumstantial evidence the questionnaire arbitrates.',
    ];
  },
});
