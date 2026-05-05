// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  collectEvidence,
  makeExecaCodeAnalyzerSpawner,
  makeNodeTmpdirManager,
  type CollectEvidenceOptions,
  type ConnectionLike,
  type ProgressEvent,
} from '@hellomavens/security-review-for-salesforce-scan-core';
import { runPreflight } from '../../../lib/preflight';
import { makeExecaSfRunner } from '../../../lib/sf-runner';
import { loadCredentials } from '../../../lib/consultant-key';
import { uploadBundle } from '../../../lib/upload-client';
import { clickableLink } from '../../../lib/clickable-link';

export type SecurityReviewRunResult = {
  preflightOk: boolean;
  alias: string;
  reportUrl?: string;
  consultantPreviewUrl?: string;
  bundlePath?: string;
};

export default class SecurityReviewRun extends SfCommand<SecurityReviewRunResult> {
  public static override readonly summary =
    '[CONSULTANT-ONLY] Run a HelloMavens security review against a target Salesforce org.';

  public static override readonly description = `
Today this command is consultant-keyed: the upload step posts to
HelloMavens' hosted scoring backend and requires credentials stored via
\`sf security review login\`. A self-service mode that scores fully
locally with no consultant key and no upload is planned for Phase 8.

Runs preflight checks, collects evidence (SOQL bundle + Health Check API by
default; --include-code-analyzer adds the slow Code Analyzer subprocess),
then either uploads the resulting EvidenceBundle to the HelloMavens scoring
backend (default) or writes it to a local file (--no-upload).

Run \`sf security review login\` once before the first scan to store your
consultant credentials.
`.trim();

  public static override readonly examples = [
    '$ sf security review run --target-org client-prod --client-email contact@client.com',
    '$ sf security review run --target-org client-prod --client-email contact@client.com --include-code-analyzer',
    '$ sf security review run --target-org client-prod --no-upload --output ./bundle.json',
  ];

  public static override readonly flags = {
    'target-org': Flags.requiredOrg(),
    'client-email': Flags.string({
      summary: 'Customer email the report will be issued to. Required unless --no-upload is set.',
      required: false,
    }),
    'no-upload': Flags.boolean({
      summary: 'Skip upload; write the assembled bundle to --output as JSON instead.',
      default: false,
    }),
    output: Flags.file({
      summary:
        'Path to write the bundle when --no-upload is set. Defaults to ./hm-bundle-<alias>-<ts>.json.',
      required: false,
    }),
    'include-code-analyzer': Flags.boolean({
      summary: 'Opt in to running Salesforce Code Analyzer (slow — 5–30 min on real orgs).',
      default: false,
    }),
  };

  public async run(): Promise<SecurityReviewRunResult> {
    const { flags } = await this.parse(SecurityReviewRun);
    const org = flags['target-org'];
    const alias = org.getUsername() ?? 'unknown';

    if (!flags['no-upload'] && !flags['client-email']) {
      throw new Error('--client-email is required unless --no-upload is set.');
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
      throw new Error(`${preflight.message}\n\nRemediation: ${preflight.remediation}`);
    }
    this.log('✓ Preflight passed.');

    // 2. Collect evidence.
    const connection = (await org.getConnection()) as unknown as ConnectionLike;
    const subjectInput = flags['client-email'] ?? alias;
    const subjectId = createHash('sha256').update(subjectInput).digest('hex').slice(0, 32);

    const onlySources: ('soql' | 'health_check_api' | 'code_analyzer')[] = [
      'soql',
      'health_check_api',
    ];
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

    // 3. Upload OR write to disk.
    if (flags['no-upload']) {
      const path =
        flags.output ??
        `./hm-bundle-${alias}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await writeFile(path, JSON.stringify(bundle, null, 2));
      this.log(`✓ Bundle written to ${path}.`);
      return { preflightOk: true, alias, bundlePath: path };
    }

    const creds = await loadCredentials();
    if (!creds) {
      throw new Error('No consultant credentials found. Run `sf security review login` first.');
    }

    const result = await uploadBundle({
      bundle,
      clientEmail: flags['client-email']!,
      consultantConsent: creds.consultantConsent,
      apiKey: creds.apiKey,
      apiBaseUrl: creds.apiBaseUrl,
    });
    if (!result.ok) {
      throw new Error(`Upload failed (${result.status}): ${result.error}`);
    }
    this.log(`✓ Customer report (auth required): ${clickableLink(result.reportUrl!)}`);
    if (result.consultantPreviewUrl) {
      this.log(`✓ Your consultant preview (no auth, expires in 30d):`);
      this.log(`  ${clickableLink(result.consultantPreviewUrl)}`);
    }
    const out: SecurityReviewRunResult = {
      preflightOk: true,
      alias,
      reportUrl: result.reportUrl,
    };
    if (result.consultantPreviewUrl) out.consultantPreviewUrl = result.consultantPreviewUrl;
    return out;
  }
}
