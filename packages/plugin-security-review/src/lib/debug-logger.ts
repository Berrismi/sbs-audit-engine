// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Opt-in debug logger. Writes JSON-lines (one event per line) to
// `<output-dir>/.hm-debug.log` when `--debug` is passed. Used to
// understand WHY a scan produced certain results — not to forensically
// reproduce one.
//
// PII / sensitive-data guarantees (audited at every event call site):
//
//   NEVER LOG:
//     - org row data (SOQL query results, individual user records, etc.)
//     - credentials (consultant API keys, sf access tokens, refresh tokens)
//     - PII (email addresses, names, IPs from event logs)
//     - raw command-line arguments that may contain values like
//       --client-email or --questionnaire <path>
//
//   DO LOG:
//     - engine + plugin versions
//     - aggregate finding counts (how many SOQL queries ran, how many rows
//       were returned per query — not the rows themselves)
//     - subprocess timings (preflight ms, evidence-collection ms,
//       Code Analyzer ms, scoring ms)
//     - flag presence (which flags were set, NOT their values)
//     - error categories (e.g. "field_unavailable", "auth_expired")
//
// The file is intentionally written next to the report bundle (under
// `--output-dir`, not `~/.config/...`) so when an OSS user reports a
// problem they can attach the debug log alongside report.json without
// leaking anything from elsewhere on their machine.

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type DebugEventLevel = 'info' | 'warn' | 'error';

export interface DebugEvent {
  /** ISO timestamp of when the event was recorded. */
  ts: string;
  /** Coarse phase: preflight | questionnaire | evidence | score | emit | upload. */
  phase: string;
  /** Specific event within the phase. */
  event: string;
  /** Severity. Used for downstream filtering (`grep '"level":"error"'`). */
  level: DebugEventLevel;
  /** Aggregate metadata. NEVER include row data, creds, or PII here. */
  data?: Record<string, unknown>;
}

/**
 * Logger interface — implementations are either the real file-writer or a
 * no-op when `--debug` isn't set. Methods are async because the file write is
 * async, but callers should not await individual events (fire-and-forget) —
 * use `flush()` at end of run if synchronous closing is needed.
 */
export interface DebugLogger {
  enabled: boolean;
  /** Path the logger is writing to (or '' when disabled). */
  path: string;
  event: (
    phase: string,
    event: string,
    data?: Record<string, unknown>,
    level?: DebugEventLevel,
  ) => Promise<void>;
}

const NOOP_LOGGER: DebugLogger = {
  enabled: false,
  path: '',
  event: async () => {},
};

/**
 * Build a logger that writes to `<dir>/.hm-debug.log` when enabled, or a
 * no-op when disabled. The file is created lazily on the first event.
 */
export function makeDebugLogger(opts: { enabled: boolean; outputDir: string }): DebugLogger {
  if (!opts.enabled) return NOOP_LOGGER;
  const path = `${opts.outputDir}/.hm-debug.log`;
  let dirEnsured = false;

  return {
    enabled: true,
    path,
    event: async (phase, event, data, level = 'info') => {
      const entry: DebugEvent = {
        ts: new Date().toISOString(),
        phase,
        event,
        level,
        ...(data && Object.keys(data).length > 0 ? { data } : {}),
      };
      if (!dirEnsured) {
        await mkdir(dirname(path), { recursive: true });
        dirEnsured = true;
      }
      await appendFile(path, JSON.stringify(entry) + '\n');
    },
  };
}

/**
 * Build the initial "scan_started" event payload from run-time inputs. Pure
 * helper so callers can log it once and pull the same shape into tests.
 */
export function makeScanStartedPayload(args: {
  engineVersion: string;
  alias: string;
  uploadModeRequested: 'auto' | 'upload' | 'local';
  questionnaireMode: 'interactive' | 'file' | 'skipped';
  includeCodeAnalyzer: boolean;
}): Record<string, unknown> {
  return {
    engine_version: args.engineVersion,
    alias_present: args.alias.length > 0,
    upload_mode_requested: args.uploadModeRequested,
    questionnaire_mode: args.questionnaireMode,
    include_code_analyzer: args.includeCodeAnalyzer,
  };
}
