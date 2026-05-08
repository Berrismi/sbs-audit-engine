// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Orchestrates the Code Analyzer flow:
//   1. sf project retrieve start --target-org <alias> --metadata "..." --output-dir <tmp>
//   2. sf code-analyzer run --workspace <tmp> --rule-selector <selector> --output-file <tmp>/findings.json
//   3. Read + parse the JSON output
//   4. Apply severity threshold filter
//   5. Cleanup the tmpdir (always, via try/finally)
//
// Spawner + tmpdir manager are injected so unit tests don't fork real
// subprocesses or touch the real filesystem. Production wiring uses
// execa + node:fs.promises + node:os.tmpdir.
//
// Rule selector default = 'Security' (alpha.36+):
//   alpha.36 multi-org baseline (ProdProksel 18 ApexClasses + 2 triggers,
//   loan-maven 34 ApexClasses + 2 triggers) compared the default
//   'Recommended' selector against 'Security':
//
//     ProdProksel default     :  356 findings (26 Security-tagged, 7.3%)
//     ProdProksel Security    :  ~26 findings (all High severity)
//
//     loan-maven default      : 1058 findings (197 Security-tagged, 18.6%)
//     loan-maven Security     :  336 findings (335 High, 1 Moderate)
//
//   65-67% of default-selector findings carry the noise tags
//   (CodeStyle / BestPractices / Performance / ErrorProne / Documentation),
//   which dilutes the security signal CODE-002 wants to corroborate.
//   The Security selector keeps exactly the rules SBS audit_procedures
//   reference (top rules on loan-maven: ApexCRUDViolation 190,
//   ApexFlsViolation 131, DatabaseOperationsMustUseWithSharing 8,
//   ApexSOQLInjection 6, ApexSharingViolations 1).
//
//   Runtime cost: Security selector activates the Salesforce Graph
//   Engine (sfge) for FLS analysis, taking ~55 sec on loan-maven vs
//   ~7 sec for default. Worth the latency for a corroborating signal
//   that's actually actionable.
//
//   Callers can override via `ruleSelector: 'Recommended'` if they need
//   the noisy general-purpose surface (we don't — every consumer of
//   this is the security-review CLI).

import type { CodeAnalyzerFinding } from '@hellomavens/security-review-for-salesforce-engine';
import { parseCodeAnalyzerOutput } from './parse';

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

export type CodeAnalyzerSpawner = (
  binary: string,
  args: readonly string[],
) => Promise<SubprocessResult>;

export interface TmpdirManager {
  create(): Promise<string>;
  cleanup(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

export interface RunCodeAnalyzerOptions {
  alias: string;
  /** Required. In production, pass `makeExecaCodeAnalyzerSpawner()`; in
   * tests, pass a fake. Required (rather than defaulted) so production
   * code paths stay explicit. */
  spawner: CodeAnalyzerSpawner;
  /** Required. In production, pass `makeNodeTmpdirManager()`; in tests,
   * pass a fake. */
  tmpdir: TmpdirManager;
  metadataTypes?: readonly string[];
  severityThreshold?: CodeAnalyzerFinding['severity'];
  /**
   * Rule selector forwarded to `sf code-analyzer run --rule-selector`.
   * Defaults to `'Security'` (see comment block at the top of this file
   * for the alpha.36 baseline that motivated this default). Pass
   * `'Recommended'` to recover the historic noisy-default behavior.
   * Multiple selectors can be combined with the colon syntax Code
   * Analyzer accepts natively (e.g., `'Security:Apex'`).
   */
  ruleSelector?: string;
}

const DEFAULT_RULE_SELECTOR = 'Security';

export type CodeAnalyzerExecution =
  | { kind: 'ok'; engine: string; findings: CodeAnalyzerFinding[] }
  | { kind: 'failed'; phase: 'retrieve' | 'analyze' | 'parse'; error: { message: string } };

const DEFAULT_METADATA_TYPES = ['ApexClass', 'ApexTrigger', 'LightningComponentBundle', 'Flow'];

const SEVERITY_RANK: Record<CodeAnalyzerFinding['severity'], number> = {
  Critical: 0,
  High: 1,
  Moderate: 2,
  Low: 3,
  Info: 4,
};

export async function runCodeAnalyzer(
  opts: RunCodeAnalyzerOptions,
): Promise<CodeAnalyzerExecution> {
  const spawner = opts.spawner;
  const tmpdirMgr = opts.tmpdir;
  const metadataTypes = opts.metadataTypes ?? DEFAULT_METADATA_TYPES;

  const dir = await tmpdirMgr.create();
  try {
    // sf project retrieve start expects one --metadata flag per type.
    // Comma-joined values trip the metadata-registry parser (it tries to
    // resolve the whole comma-string as a single fullName) — alpha.37
    // fixes this by emitting `--metadata <type>` per type.
    const metadataFlags = metadataTypes.flatMap((t) => ['--metadata', t]);
    const retrieveResult = await spawner('sf', [
      'project',
      'retrieve',
      'start',
      '--target-org',
      opts.alias,
      ...metadataFlags,
      '--output-dir',
      dir,
    ]);
    if (retrieveResult.exitCode !== 0) {
      return {
        kind: 'failed',
        phase: 'retrieve',
        error: { message: retrieveResult.stderr || 'sf project retrieve start exited non-zero' },
      };
    }

    const outputFile = `${dir}/findings.json`;
    const ruleSelector = opts.ruleSelector ?? DEFAULT_RULE_SELECTOR;
    const analyzeResult = await spawner('sf', [
      'code-analyzer',
      'run',
      '--workspace',
      dir,
      '--rule-selector',
      ruleSelector,
      '--output-file',
      outputFile,
    ]);
    if (analyzeResult.exitCode !== 0) {
      return {
        kind: 'failed',
        phase: 'analyze',
        error: { message: analyzeResult.stderr || 'sf code-analyzer run exited non-zero' },
      };
    }

    let parsed;
    try {
      const raw = await tmpdirMgr.readFile(outputFile);
      parsed = parseCodeAnalyzerOutput(JSON.parse(raw));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'failed', phase: 'parse', error: { message } };
    }

    const findings = opts.severityThreshold
      ? parsed.findings.filter(
          (f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK[opts.severityThreshold!],
        )
      : parsed.findings;

    return { kind: 'ok', engine: parsed.engine, findings };
  } finally {
    await tmpdirMgr.cleanup(dir);
  }
}
