// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { readFile } from 'node:fs/promises';
import type { EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import { loadCredentials } from '../../../lib/consultant-key';
import { uploadBundle } from '../../../lib/upload-client';

export type SecurityReviewUploadResult = {
  uploaded: boolean;
  reportUrl?: string;
  consultantPreviewUrl?: string;
};

export default class SecurityReviewUpload extends SfCommand<SecurityReviewUploadResult> {
  public static override readonly summary =
    'Upload a previously-collected EvidenceBundle to the HelloMavens scoring backend.';

  public static override readonly examples = [
    '$ sf security review upload --bundle ./bundle.json --client-email contact@client.com',
  ];

  public static override readonly flags = {
    bundle: Flags.file({
      summary: 'Path to a JSON-serialized EvidenceBundle.',
      char: 'b',
      required: true,
      exists: true,
    }),
    'client-email': Flags.string({
      summary: 'Email of the customer the report should be issued to.',
      required: true,
    }),
  };

  public async run(): Promise<SecurityReviewUploadResult> {
    const { flags } = await this.parse(SecurityReviewUpload);

    const creds = await loadCredentials();
    if (!creds) {
      throw new Error('No consultant credentials found. Run `sf security review login` first.');
    }

    const raw = await readFile(flags.bundle, 'utf8');
    let bundle: EvidenceBundle;
    try {
      bundle = JSON.parse(raw) as EvidenceBundle;
    } catch (err) {
      throw new Error(`Could not parse bundle file ${flags.bundle}: ${(err as Error).message}`);
    }

    const result = await uploadBundle({
      bundle,
      clientEmail: flags['client-email'],
      consultantConsent: creds.consultantConsent,
      apiKey: creds.apiKey,
      apiBaseUrl: creds.apiBaseUrl,
    });

    if (!result.ok) {
      throw new Error(`Upload failed (${result.status}): ${result.error}`);
    }

    this.log(`✓ Customer report (auth required): ${result.reportUrl}`);
    if (result.consultantPreviewUrl) {
      this.log(`✓ Your consultant preview (no auth, expires in 30d):`);
      this.log(`  ${result.consultantPreviewUrl}`);
    }
    const out: SecurityReviewUploadResult = { uploaded: true, reportUrl: result.reportUrl };
    if (result.consultantPreviewUrl) out.consultantPreviewUrl = result.consultantPreviewUrl;
    return out;
  }
}
