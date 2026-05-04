// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';

export type SecurityReviewUploadResult = {
  uploaded: false;
  reason: 'block_f_not_implemented';
};

export default class SecurityReviewUpload extends SfCommand<SecurityReviewUploadResult> {
  public static override readonly summary =
    'Upload a previously-collected EvidenceBundle to the HelloMavens scoring backend.';

  public static override readonly description = `
Phase 5 stub — implemented in Block F when the backend /api/scan/upload
endpoint and the consultant API-key flow land. For now, this command exits
with a friendly message pointing at the plan file.
`.trim();

  public static override readonly examples = [
    '$ sf security review upload bundle.json --client-email contact@client.com',
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
    await this.parse(SecurityReviewUpload);
    this.warn(
      'sf security review upload is a Block F stub. The backend endpoint, consultant key flow, and HM_API_BASE_URL wiring all land together in Block F.',
    );
    this.log(
      'See the implementation plan at ~/.claude/plans/we-re-starting-phase-5-reactive-church.md (Block F) for status.',
    );
    return { uploaded: false, reason: 'block_f_not_implemented' };
  }
}
