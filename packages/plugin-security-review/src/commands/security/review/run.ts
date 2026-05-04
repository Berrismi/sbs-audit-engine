// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { runPreflight } from '../../../lib/preflight';
import { makeExecaSfRunner } from '../../../lib/sf-runner';

export type SecurityReviewRunResult = {
  preflightOk: boolean;
  alias: string;
};

export default class SecurityReviewRun extends SfCommand<SecurityReviewRunResult> {
  public static override readonly summary =
    'Run a HelloMavens security review against a target Salesforce org.';

  public static override readonly description = `
Phase 5 in flight — Block A ships preflight only. The full evidence-collection
flow (SOQL bundle, Health Check API, Code Analyzer subprocess, evidence
upload) lands in Blocks B–F.

Today this command verifies that:
  - The Salesforce CLI (\`sf\`) is on $PATH
  - Your target org alias has an active auth
  - (TODO Block B) Your user has the required permissions

It then prints a "preflight passed; scan stub" message and exits 0.
`.trim();

  public static override readonly examples = ['$ sf security review run --target-org client-prod'];

  public static override readonly flags = {
    'target-org': Flags.requiredOrg(),
  };

  public async run(): Promise<SecurityReviewRunResult> {
    const { flags } = await this.parse(SecurityReviewRun);
    const org = flags['target-org'];
    const alias = org.getUsername() ?? 'unknown';

    const runner = makeExecaSfRunner();
    const preflightResult = await runPreflight({
      runner,
      alias,
      // Block A stub: real Connection-driven perms fetch lands in Block B when
      // the SOQL bundle wires Connection.tooling.query into scan-core.
      fetchPerms: async () => ({ ApiEnabled: true, ViewSetup: true, ViewAllData: true }),
    });

    if (!preflightResult.ok) {
      this.error(`${preflightResult.message}\n\nRemediation: ${preflightResult.remediation}`, {
        exit: 1,
      });
    }

    this.log('✓ Preflight passed.');
    this.log(
      'Block A scaffold complete — actual scan logic ships in Blocks B (SOQL), C (Health Check), D (Code Analyzer), E (per-evaluator extensions), F (upload).',
    );

    return { preflightOk: true, alias };
  }
}
