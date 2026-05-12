// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// `sf security review run` — runs a Salesforce security review against a
// target org. Two modes, governed by the tri-state `--upload` flag:
//
//   1. Local-only (default for OSS users): scans the org, scores the
//      bundle locally with the open-source engine, and emits machine-
//      readable artifacts (findings.json + report.json) under
//      --output-dir. No network calls beyond `sf` itself. No upload.
//      Anyone with `sf` CLI authed to the target org can run this.
//
//   2. Upload + local emission (default for HelloMavens consultants
//      whose machine has cached credentials from `sf security review
//      login`): same scan + local scoring, AND also POSTs the bundle
//      to the closed HelloMavens scoring backend for branded report
//      rendering. Requires `--client-email` plus a previously-stored
//      consultant API key. The backend enforces all auth — the OSS
//      release of this plugin is safe to ship because client-side
//      validation is not load-bearing for security.
//
// Resolution of upload mode:
//   --upload         → upload (errors if no creds)
//   --no-upload      → local only
//   (unset)          → upload if creds exist, else local
//
// This keeps the existing HelloMavens consultant flow unchanged
// (logged-in users still get auto-upload by default) while making the
// OSS path trivial (anyone without creds defaults to local-only,
// no surprise auth prompts).

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  collectEvidence,
  makeExecaCodeAnalyzerSpawner,
  makeNodeTmpdirManager,
  type CollectEvidenceOptions,
  type ConnectionLike,
  type ProgressEvent,
} from '@hellomavens/security-review-for-salesforce-scan-core';
import { ENGINE_VERSION, score } from '@hellomavens/security-review-for-salesforce-engine';
import {
  REGISTRY,
  toQuestionnaireSubmission,
  type AnswerSet,
} from '@hellomavens/security-review-for-salesforce-engine/questionnaire';
import { runPreflight } from '../../../lib/preflight';
import { makeExecaSfRunner } from '../../../lib/sf-runner';
import { loadCredentials } from '../../../lib/consultant-key';
import { uploadBundle } from '../../../lib/upload-client';
import { clickableFilePath, clickableLink } from '../../../lib/clickable-link';
import { makeDebugLogger, makeScanStartedPayload } from '../../../lib/debug-logger';
import { renderHtml } from '../../../lib/render-html';
import { renderMarkdown } from '../../../lib/render-markdown';
import { runQuestionnaire } from '../../../lib/questionnaire-runner';
import { loadAnswersFromYaml } from '../../../lib/questionnaire-loader';
import { saveAnswers } from '../../../lib/questionnaire-storage';

export type SecurityReviewRunResult = {
  preflightOk: boolean;
  alias: string;
  /** Resolved upload mode after applying the auto-detection rule. */
  uploadMode: 'local' | 'upload';
  /** Absolute path to findings.json (bundle). Always written. */
  findingsPath: string;
  /** Absolute path to report.json (ScoredReport). Always written. */
  reportPath: string;
  /** Absolute path to report.md (Markdown rendering). Always written. */
  reportMarkdownPath: string;
  /** Absolute path to report.html (browser/print rendering). Always written. */
  reportHtmlPath: string;
  /** Branded report URL — only set in upload mode. */
  reportUrl?: string;
  /** Consultant preview URL — only set in upload mode. */
  consultantPreviewUrl?: string;
};

export default class SecurityReviewRun extends SfCommand<SecurityReviewRunResult> {
  public static override readonly summary =
    'Run a Salesforce security review against a target org. Outputs findings.json + report.json locally; optionally also uploads to the HelloMavens scoring backend.';

  public static override readonly description = `
Runs preflight checks (sf CLI installed, target org authed), collects
evidence (SOQL bundle + Health Check + Limits + Metadata API by default;
--include-code-analyzer adds the slow Code Analyzer subprocess), and
scores the bundle locally with the open-source engine.

Always emits two files to --output-dir:
  - findings.json — the EvidenceBundle (raw evidence per source)
  - report.json   — the ScoredReport (per-control verdicts + overall grade)

Default upload mode auto-detects: if you've previously run
\`sf security review login\` and have stored consultant credentials,
the bundle is also uploaded to the HelloMavens scoring backend for a
branded report. If you don't have credentials, no upload is attempted.
Pass --no-upload to force local-only even when credentials exist.

If you're not a HelloMavens consultant: run with default flags. You'll
get findings.json + report.json in your current directory. No login
required, no upload, no email.
`.trim();

  public static override readonly examples = [
    '$ sf security review run --target-org client-prod',
    '$ sf security review run --target-org client-prod --output-dir ./reports/2026-q2',
    '$ sf security review run --target-org client-prod --no-upload',
    '$ sf security review run --target-org client-prod --include-code-analyzer',
    '$ sf security review run --target-org client-prod --upload --client-email contact@client.com',
  ];

  public static override readonly flags = {
    'target-org': Flags.requiredOrg(),
    'client-email': Flags.string({
      summary:
        'Customer email the report will be issued to. Required when --upload is set (explicit or auto-detected).',
      required: false,
    }),
    upload: Flags.boolean({
      summary:
        'Upload the bundle to the HelloMavens scoring backend (requires `sf security review login`). Auto-detected from stored credentials when unset; pass --no-upload to force local-only.',
      allowNo: true,
      required: false,
    }),
    'output-dir': Flags.directory({
      summary:
        'Directory to write findings.json and report.json into. Created if missing. Defaults to current working directory.',
      default: '.',
    }),
    'include-code-analyzer': Flags.boolean({
      summary: 'Opt in to running Salesforce Code Analyzer (slow — 1-5 min on real orgs).',
      default: false,
    }),
    questionnaire: Flags.file({
      summary:
        'Path to a YAML answer file (load instead of prompting). Produced by a previous interactive run; useful for CI replay.',
      exists: true,
      required: false,
    }),
    'no-questionnaire': Flags.boolean({
      summary:
        'Skip the questionnaire entirely. Controls that need operator input will be reported as inconclusive.',
      default: false,
    }),
    debug: Flags.boolean({
      summary:
        'Write a JSON-lines diagnostic log to <output-dir>/.hm-debug.log. Aggregates only — no row data, no PII, no credentials. Useful for filing bug reports.',
      default: false,
    }),
  };

  public async run(): Promise<SecurityReviewRunResult> {
    const { flags } = await this.parse(SecurityReviewRun);
    const org = flags['target-org'];
    const alias = org.getUsername() ?? 'unknown';

    // Resolve output dir + initialize debug logger early so every subsequent
    // phase can record diagnostic events. Logger is a no-op when --debug is
    // unset; never logs row data, credentials, or PII regardless.
    const outputDir = resolve(flags['output-dir']);
    await mkdir(outputDir, { recursive: true });
    this.log(`· Reports will be written to: ${clickableFilePath(outputDir)}`);
    this.log('  (use --output-dir <path> to change the location)');
    const debug = makeDebugLogger({ enabled: flags.debug, outputDir });
    if (debug.enabled) {
      this.log(`· --debug on; writing diagnostic log to ${debug.path}`);
    }

    // 1. Preflight (existing).
    const runner = makeExecaSfRunner();
    const preflight = await runPreflight({
      runner,
      alias,
      // Block A's stub fetchPerms — Block B classified it as sufficient
      // until a real perms query lands.
      fetchPerms: async () => ({ ApiEnabled: true, ViewSetup: true, ViewAllData: true }),
    });
    if (!preflight.ok) {
      await debug.event('preflight', 'failed', { message: preflight.message }, 'error');
      throw new Error(`${preflight.message}\n\nRemediation: ${preflight.remediation}`);
    }
    this.log('✓ Preflight passed.');
    await debug.event('preflight', 'ok');

    // 1.5. Questionnaire — interactive (TTY default), file (--questionnaire),
    //      or skipped (--no-questionnaire). Runs before the scan so the
    //      operator does the attentive part first; the long evidence
    //      collection happens after they can walk away.
    let answers: AnswerSet | null = null;
    let questionnaireMode: 'interactive' | 'file' | 'skipped';
    if (flags['no-questionnaire']) {
      this.log(
        '· Questionnaire skipped (--no-questionnaire). Operator-only controls will be inconclusive.',
      );
      questionnaireMode = 'skipped';
    } else if (flags.questionnaire) {
      const loaded = await loadAnswersFromYaml(flags.questionnaire);
      answers = loaded.answers;
      questionnaireMode = 'file';
      this.log(
        `✓ Loaded ${Object.keys(answers).length} questionnaire answer(s) from ${flags.questionnaire}`,
      );
    } else if (process.stdin.isTTY) {
      this.log('');
      this.log('· Questionnaire — answer the next set of short questions to corroborate CLI');
      this.log('  evidence. Press Ctrl-C to abort.');
      answers = await runQuestionnaire({ log: (line) => this.log(line) });
      questionnaireMode = 'interactive';
      const savedPath = await saveAnswers({
        alias,
        registryVersion: REGISTRY.version,
        sbsVersion: REGISTRY.sbsVersion,
        answers,
      });
      this.log(`✓ Answers saved to ${savedPath}`);
      this.log(`  Re-run non-interactively with: --questionnaire ${savedPath}`);
    } else {
      throw new Error(
        'Cannot prompt interactively in a non-TTY environment. Pass --questionnaire <path-to.yml> to load saved answers, or --no-questionnaire to skip.',
      );
    }
    await debug.event('questionnaire', 'resolved', {
      mode: questionnaireMode,
      answer_count: answers ? Object.keys(answers).length : 0,
    });

    // 2. Resolve upload mode.
    const explicitUpload = flags.upload;
    const creds = await loadCredentials();
    const uploadMode: 'local' | 'upload' =
      explicitUpload === true
        ? 'upload'
        : explicitUpload === false
          ? 'local'
          : creds
            ? 'upload'
            : 'local';

    if (uploadMode === 'upload' && !creds) {
      throw new Error(
        '--upload was requested but no consultant credentials are stored. Run `sf security review login` first, or pass --no-upload to run locally.',
      );
    }
    if (uploadMode === 'upload' && !flags['client-email']) {
      throw new Error(
        '--client-email is required when uploading. Pass --client-email <email> or --no-upload to skip the upload step.',
      );
    }
    await debug.event(
      'cli',
      'scan_started',
      makeScanStartedPayload({
        engineVersion: ENGINE_VERSION,
        alias,
        uploadModeRequested:
          flags.upload === true ? 'upload' : flags.upload === false ? 'local' : 'auto',
        questionnaireMode,
        includeCodeAnalyzer: flags['include-code-analyzer'],
      }),
    );

    // 3. Collect evidence.
    const connection = (await org.getConnection()) as unknown as ConnectionLike;
    const subjectInput = flags['client-email'] ?? alias;
    const subjectId = createHash('sha256').update(subjectInput).digest('hex').slice(0, 32);

    const onlySources: (
      | 'soql'
      | 'health_check_api'
      | 'code_analyzer'
      | 'limits_rest_api'
      | 'metadata_api'
    )[] = ['soql', 'health_check_api', 'limits_rest_api', 'metadata_api'];
    if (flags['include-code-analyzer']) onlySources.push('code_analyzer');

    // Per-probe spinner for the metadata_api phase. Probes can run 30-90+
    // seconds on real orgs (chunked metadata.read() calls); without ongoing
    // activity feedback the CLI appears frozen. The spinner overwrites the
    // same line with elapsed-time updates while a probe runs, then yields
    // back to normal scrolling output when the probe completes.
    //
    // TTY-gated: in non-TTY contexts (CI, log capture, --json mode) we just
    // log the start line once. No carriage-return tricks where they would
    // render as garbage.
    const spinner: {
      interval: NodeJS.Timeout | null;
      text: string;
      startedAt: number;
    } = { interval: null, text: '', startedAt: 0 };
    const stopSpinner = (): void => {
      if (spinner.interval) {
        clearInterval(spinner.interval);
        spinner.interval = null;
        if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
      }
    };
    const startSpinner = (initialText: string): void => {
      stopSpinner();
      spinner.text = initialText;
      spinner.startedAt = Date.now();
      if (process.stdout.isTTY) {
        process.stdout.write(initialText);
        spinner.interval = setInterval(() => {
          const elapsed = formatDuration(Date.now() - spinner.startedAt);
          process.stdout.write(`\r\x1b[2K${initialText} — ${elapsed} elapsed`);
        }, 1000);
      } else {
        this.log(initialText);
      }
    };

    const collectOpts: CollectEvidenceOptions = {
      connection,
      subjectId,
      onlySources,
      onProgress: (event: ProgressEvent) => {
        if (event.type === 'query_ok') {
          this.log(
            `  ✓ ${event.query.id} (${event.rowCount} row${event.rowCount === 1 ? '' : 's'})`,
          );
          void debug.event('evidence', 'query_ok', {
            query_id: event.query.id,
            row_count: event.rowCount,
          });
        } else if (event.type === 'query_failed') {
          this.log(`  ✗ ${event.query.id}: ${event.error.message}`);
          void debug.event(
            'evidence',
            'query_failed',
            { query_id: event.query.id, message: event.error.message },
            'error',
          );
        } else if (event.type === 'query_skipped') {
          this.log(`  · ${event.query.id} skipped (${event.reason})`);
          void debug.event('evidence', 'query_skipped', {
            query_id: event.query.id,
            reason: event.reason,
          });
        } else if (event.type === 'query_start') {
          this.log(`  · ${event.query.id}`);
        } else if (event.type === 'phase_start') {
          this.log(`· ${formatPhaseLabel(event.source)} — running...`);
          void debug.event('evidence', 'phase_start', { source: event.source });
        } else if (event.type === 'phase_done') {
          // Defensive: a probe_done event should have stopped any active
          // spinner; clean up here too in case the phase ended without one
          // (e.g., a probe error path).
          stopSpinner();
          this.log(`✓ ${formatPhaseLabel(event.source)} complete (${formatDuration(event.durationMs)})`);
          void debug.event('evidence', 'phase_done', {
            source: event.source,
            duration_ms: event.durationMs,
          });
        } else if (event.type === 'phase_skipped') {
          void debug.event('evidence', 'phase_skipped', {
            source: event.source,
            reason: event.reason,
          });
        } else if (event.type === 'metadata_probe_start') {
          // Replace the static "... done" pattern with a live spinner that
          // shows elapsed time. The bare TTY case (which most users hit) gets
          // an overwriting line; non-TTY logs the start line once.
          startSpinner(`  · ${event.probeId} (${event.index + 1}/${event.total})`);
          void debug.event('evidence', 'metadata_probe_start', {
            probe_id: event.probeId,
            probe_type: event.probeType,
            index: event.index,
            total: event.total,
          });
        } else if (event.type === 'metadata_probe_done') {
          stopSpinner();
          this.log(
            `  ✓ ${event.probeId} (${event.recordsRetrieved} record${event.recordsRetrieved === 1 ? '' : 's'}, ${formatDuration(event.durationMs)})`,
          );
          void debug.event('evidence', 'metadata_probe_done', {
            probe_id: event.probeId,
            duration_ms: event.durationMs,
            records_retrieved: event.recordsRetrieved,
          });
        }
      },
    };
    if (flags['include-code-analyzer']) {
      collectOpts.codeAnalyzer = {
        alias,
        spawner: makeExecaCodeAnalyzerSpawner(),
        tmpdir: makeNodeTmpdirManager(),
      };
    }

    this.log('· Collecting evidence...');
    const evidenceStart = Date.now();
    const collectResult = await collectEvidence(collectOpts);
    let bundle = collectResult.bundle;
    await debug.event('evidence', 'collection_finished', {
      duration_ms: Date.now() - evidenceStart,
      cli_evidence_count: bundle.evidence.length,
    });

    // 3.5. Merge questionnaire-derived evidence into the CLI bundle. The
    //      engine's score() consumes the union — questionnaire-only controls
    //      need it for primary evidence, and cli_corroborating controls use
    //      it as a second signal alongside CLI findings.
    if (answers) {
      const submission = toQuestionnaireSubmission({
        subjectId,
        answers,
        registry: REGISTRY,
        collectedAt: new Date().toISOString(),
      });
      bundle = {
        ...bundle,
        evidence: [...submission.bundle.evidence, ...bundle.evidence],
      };
      this.log(
        `✓ Merged ${submission.bundle.evidence.length} questionnaire answer(s) into bundle.`,
      );
    }

    // 4. Score locally with the open-source engine. Same scoring runs
    //    server-side in upload mode — these should match. (Determinism
    //    is enforced by the engine's score() purity.)
    this.log('· Scoring bundle locally...');
    const scoreStart = Date.now();
    const report = score(bundle);
    await debug.event('score', 'finished', {
      duration_ms: Date.now() - scoreStart,
      overall_score: report.overall_score,
      risk_grade: report.risk_grade,
      critical_fail_count: report.critical_fail_count,
      inconclusive_percent: report.inconclusive_percent,
      evidence_sufficiency: report.evidence_sufficiency,
    });

    // 5. Always emit findings.json + report.json + report.{md,html} to --output-dir.
    //    outputDir was resolved + created at the start of run() so the debug
    //    log can sit alongside the report bundle.
    const findingsPath = join(outputDir, 'findings.json');
    const reportPath = join(outputDir, 'report.json');
    const reportMarkdownPath = join(outputDir, 'report.md');
    const reportHtmlPath = join(outputDir, 'report.html');
    const generatedAt = new Date().toISOString();
    await writeFile(findingsPath, JSON.stringify(bundle, null, 2));
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    const renderOpts = {
      generatedAt,
      alias,
      ...(answers ? { answers, registry: REGISTRY } : {}),
    };
    await writeFile(reportMarkdownPath, renderMarkdown(report, renderOpts));
    await writeFile(reportHtmlPath, renderHtml(report, renderOpts));
    this.log(`✓ findings.json written to ${clickableFilePath(findingsPath)}`);
    this.log(
      `✓ report.json written to ${clickableFilePath(reportPath)}  (overall: ${report.overall_score}/100, grade ${report.risk_grade})`,
    );
    this.log(`✓ report.md written to ${clickableFilePath(reportMarkdownPath)}`);
    this.log(`✓ report.html written to ${clickableFilePath(reportHtmlPath)}`);
    await debug.event('emit', 'done');

    // 6. Upload if in upload mode.
    if (uploadMode === 'local') {
      return {
        preflightOk: true,
        alias,
        uploadMode: 'local',
        findingsPath,
        reportPath,
        reportMarkdownPath,
        reportHtmlPath,
      };
    }

    const uploadResult = await uploadBundle({
      bundle,
      clientEmail: flags['client-email']!,
      consultantConsent: creds!.consultantConsent,
      apiKey: creds!.apiKey,
      apiBaseUrl: creds!.apiBaseUrl,
    });
    if (!uploadResult.ok) {
      throw new Error(`Upload failed (${uploadResult.status}): ${uploadResult.error}`);
    }
    this.log(`✓ Customer report (auth required): ${clickableLink(uploadResult.reportUrl!)}`);
    if (uploadResult.consultantPreviewUrl) {
      this.log(`✓ Your consultant preview (no auth, expires in 30d):`);
      this.log(`  ${clickableLink(uploadResult.consultantPreviewUrl)}`);
    }

    const out: SecurityReviewRunResult = {
      preflightOk: true,
      alias,
      uploadMode: 'upload',
      findingsPath,
      reportPath,
      reportMarkdownPath,
      reportHtmlPath,
      reportUrl: uploadResult.reportUrl,
    };
    if (uploadResult.consultantPreviewUrl)
      out.consultantPreviewUrl = uploadResult.consultantPreviewUrl;
    return out;
  }
}

function formatPhaseLabel(
  source: 'soql' | 'health_check_api' | 'limits_rest_api' | 'metadata_api' | 'code_analyzer',
): string {
  switch (source) {
    case 'soql':
      return 'SOQL / Tooling queries';
    case 'health_check_api':
      return 'Health Check API';
    case 'limits_rest_api':
      return 'Limits REST API';
    case 'metadata_api':
      return 'Metadata API probes';
    case 'code_analyzer':
      return 'Salesforce Code Analyzer';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
