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
import { score } from '@hellomavens/security-review-for-salesforce-engine';
import { runPreflight } from '../../../lib/preflight';
import { makeExecaSfRunner } from '../../../lib/sf-runner';
import { loadCredentials } from '../../../lib/consultant-key';
import { uploadBundle } from '../../../lib/upload-client';
import { clickableLink } from '../../../lib/clickable-link';
import { renderMarkdown } from '../../../lib/render-markdown';

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
  };

  public async run(): Promise<SecurityReviewRunResult> {
    const { flags } = await this.parse(SecurityReviewRun);
    const org = flags['target-org'];
    const alias = org.getUsername() ?? 'unknown';

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
      throw new Error(`${preflight.message}\n\nRemediation: ${preflight.remediation}`);
    }
    this.log('✓ Preflight passed.');

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

    const collectOpts: CollectEvidenceOptions = {
      connection,
      subjectId,
      onlySources,
      onProgress: (event: ProgressEvent) => {
        if (event.type === 'query_ok') {
          this.log(
            `  ✓ ${event.query.id} (${event.rowCount} row${event.rowCount === 1 ? '' : 's'})`,
          );
        } else if (event.type === 'query_failed') {
          this.log(`  ✗ ${event.query.id}: ${event.error.message}`);
        } else if (event.type === 'query_skipped') {
          this.log(`  · ${event.query.id} skipped (${event.reason})`);
        } else {
          this.log(`  · ${event.query.id}`);
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
    const { bundle } = await collectEvidence(collectOpts);

    // 4. Score locally with the open-source engine. Same scoring runs
    //    server-side in upload mode — these should match. (Determinism
    //    is enforced by the engine's score() purity.)
    this.log('· Scoring bundle locally...');
    const report = score(bundle);

    // 5. Always emit findings.json + report.json + report.md to --output-dir.
    const outputDir = resolve(flags['output-dir']);
    await mkdir(outputDir, { recursive: true });
    const findingsPath = join(outputDir, 'findings.json');
    const reportPath = join(outputDir, 'report.json');
    const reportMarkdownPath = join(outputDir, 'report.md');
    const generatedAt = new Date().toISOString();
    await writeFile(findingsPath, JSON.stringify(bundle, null, 2));
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await writeFile(reportMarkdownPath, renderMarkdown(report, { generatedAt, alias }));
    this.log(`✓ findings.json written to ${findingsPath}`);
    this.log(
      `✓ report.json written to ${reportPath}  (overall: ${report.overall_score}/100, grade ${report.risk_grade})`,
    );
    this.log(`✓ report.md written to ${reportMarkdownPath}`);

    // 6. Upload if in upload mode.
    if (uploadMode === 'local') {
      return {
        preflightOk: true,
        alias,
        uploadMode: 'local',
        findingsPath,
        reportPath,
        reportMarkdownPath,
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
      reportUrl: uploadResult.reportUrl,
    };
    if (uploadResult.consultantPreviewUrl)
      out.consultantPreviewUrl = uploadResult.consultantPreviewUrl;
    return out;
  }
}
