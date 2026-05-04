// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';

export type SecurityReviewLoginResult = {
  loggedIn: false;
  reason: 'block_f_not_implemented';
};

export default class SecurityReviewLogin extends SfCommand<SecurityReviewLoginResult> {
  public static override readonly summary =
    'Store the HelloMavens consultant API key and backend base URL for future scan uploads.';

  public static override readonly description = `
Phase 5 stub — implemented in Block F. Will prompt for the consultant API key
and HM_API_BASE_URL, then persist them to a file under ~/.config/hellomavens/
(no OS keychain in v1; can be added later via keytar if file storage proves
insufficient).
`.trim();

  public static override readonly examples = [
    '$ sf security review login --api-base-url https://app.hellomavens.com',
  ];

  public static override readonly flags = {
    'api-base-url': Flags.url({
      summary: 'Base URL of the HelloMavens scoring backend (e.g. https://app.hellomavens.com).',
      required: false,
    }),
  };

  public async run(): Promise<SecurityReviewLoginResult> {
    await this.parse(SecurityReviewLogin);
    this.warn(
      'sf security review login is a Block F stub. The consultant key + base-URL persistence flow lands together with the upload endpoint in Block F.',
    );
    this.log(
      'See the implementation plan at ~/.claude/plans/we-re-starting-phase-5-reactive-church.md (Block F) for status.',
    );
    return { loggedIn: false, reason: 'block_f_not_implemented' };
  }
}
