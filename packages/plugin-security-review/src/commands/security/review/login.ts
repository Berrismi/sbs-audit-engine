// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { saveCredentials, getCredentialsPath } from '../../../lib/consultant-key';
import {
  CONSULTANT_DISCLAIMER_TEXT,
  CONSULTANT_DISCLAIMER_VERSION,
} from '../../../lib/consultant-disclaimer';

export type SecurityReviewLoginResult = { loggedIn: boolean; path: string };

export default class SecurityReviewLogin extends SfCommand<SecurityReviewLoginResult> {
  public static override readonly summary =
    'Store the HelloMavens consultant API key, backend base URL, and engagement-disclaimer attestation for future scan uploads.';

  public static override readonly examples = [
    '$ sf security review login --api-base-url https://app.hellomavens.com',
  ];

  public static override readonly flags = {
    'api-base-url': Flags.url({
      summary: 'Base URL of the HelloMavens scoring backend.',
      required: true,
    }),
  };

  public async run(): Promise<SecurityReviewLoginResult> {
    const { flags } = await this.parse(SecurityReviewLogin);

    // 1. Display the engagement disclaimer + require explicit accept.
    this.log('\n' + CONSULTANT_DISCLAIMER_TEXT + '\n');
    const accepted = await this.confirm({
      message: 'Accept the HelloMavens consultant engagement disclaimer',
      defaultAnswer: false,
    });
    if (!accepted) {
      // Throw rather than this.error() so command-test runs don't trip
      // sf-plugins-core's process-exit signal handler.
      throw new Error('Engagement disclaimer was not accepted. Aborting login.');
    }
    const signedAt = new Date().toISOString();

    // 2. Capture API key (masked).
    const apiKey = await this.secretPrompt({
      message: 'HelloMavens consultant API key',
    });
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API key is required. Aborting login.');
    }

    // 3. Persist creds + consent. URL.toString() canonicalizes with a
    //    trailing slash on hostname-only URLs; strip it so the stored
    //    base URL is clean and `new URL('/path', baseUrl)` still resolves
    //    correctly.
    const apiBaseUrl = flags['api-base-url'].toString().replace(/\/$/, '');
    await saveCredentials({
      apiKey: apiKey.trim(),
      apiBaseUrl,
      consultantConsent: {
        version: CONSULTANT_DISCLAIMER_VERSION,
        signedAt,
      },
    });
    const path = getCredentialsPath();
    this.log(`✓ Saved consultant credentials + engagement attestation to ${path}.`);
    return { loggedIn: true, path };
  }
}
