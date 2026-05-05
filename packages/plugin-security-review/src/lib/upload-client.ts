// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import type { ConsultantConsent } from './consultant-key';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface UploadInput {
  bundle: EvidenceBundle;
  clientEmail: string;
  consultantConsent: ConsultantConsent;
  apiKey: string;
  apiBaseUrl: string;
  fetcher?: Fetcher;
}

export type UploadResult =
  | { ok: true; reportId: string; reportUrl: string; consultantPreviewUrl?: string }
  | { ok: false; status: number; error: string };

export async function uploadBundle(input: UploadInput): Promise<UploadResult> {
  const fetcher = input.fetcher ?? fetch;
  const url = new URL('/api/scan/upload', input.apiBaseUrl).toString();
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hm-consultant-key': input.apiKey,
    },
    body: JSON.stringify({
      client_email: input.clientEmail,
      // Plugin field name → server field name (camelCase → snake_case).
      consultant_consent: {
        version: input.consultantConsent.version,
        signed_at: input.consultantConsent.signedAt,
      },
      bundle: input.bundle,
    }),
  });

  if (res.status === 200) {
    const body = (await res.json()) as {
      report_id: string;
      report_url: string;
      consultant_preview_url?: string;
    };
    return {
      ok: true,
      reportId: body.report_id,
      reportUrl: body.report_url,
      consultantPreviewUrl: body.consultant_preview_url,
    };
  }

  let errorMessage = `Upload failed with status ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: string; details?: unknown };
    if (body.error) errorMessage = body.error;
    // Backend's Zod errors come back as { error, details: { fieldErrors, formErrors } }.
    // Surface the details so consultants can see which field failed validation.
    if (body.details) errorMessage += `\nDetails: ${JSON.stringify(body.details, null, 2)}`;
  } catch {
    // body wasn't JSON; keep the status-only message.
  }
  return { ok: false, status: res.status, error: errorMessage };
}
