// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Orchestrates the Code Analyzer flow:
//   1. sf project retrieve start --target-org <alias> --metadata "..." --output-dir <tmp>
//   2. sf code-analyzer run --workspace <tmp> --output-file <tmp>/findings.json
//   3. Read + parse the JSON output
//   4. Apply severity threshold filter
//   5. Cleanup the tmpdir (always, via try/finally)
//
// Spawner + tmpdir manager are injected so unit tests don't fork real
// subprocesses or touch the real filesystem. Production wiring uses
// execa + node:fs.promises + node:os.tmpdir.

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
}

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
    const retrieveResult = await spawner('sf', [
      'project',
      'retrieve',
      'start',
      '--target-org',
      opts.alias,
      '--metadata',
      metadataTypes.join(','),
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
    const analyzeResult = await spawner('sf', [
      'code-analyzer',
      'run',
      '--workspace',
      dir,
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
