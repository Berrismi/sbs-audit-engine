// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { uploadBundle } from '../../src/lib/upload-client';

const FAKE_BUNDLE = {
  subject_id: 'x',
  collected_at: '2026-05-04T00:00:00Z',
  evidence: [],
};

const FAKE_CONSENT = {
  version: 'consultant_engagement_v1',
  signedAt: '2026-05-04T00:00:00Z',
};

describe('uploadBundle', () => {
  it('POSTs with consultant header and returns reportUrl on 200', async () => {
    let captured!: { url: string; init: RequestInit };
    const fetcher = async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({ report_id: 'r-1', report_url: 'https://app.x/audit/report/r-1' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const result = await uploadBundle({
      bundle: FAKE_BUNDLE,
      clientEmail: 'c@x.com',
      consultantConsent: FAKE_CONSENT,
      apiKey: 'hm_test',
      apiBaseUrl: 'https://app.x',
      fetcher,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reportUrl).toBe('https://app.x/audit/report/r-1');
    expect(captured.url).toBe('https://app.x/api/scan/upload');
    const headers = captured.init.headers as Record<string, string>;
    expect(headers['x-hm-consultant-key']).toBe('hm_test');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(captured.init.body as string)).toEqual({
      client_email: 'c@x.com',
      consultant_consent: {
        version: 'consultant_engagement_v1',
        signed_at: '2026-05-04T00:00:00Z',
      },
      bundle: FAKE_BUNDLE,
    });
  });

  it('returns ok:false with the verbatim backend error on non-200', async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ error: 'Invalid consultant key.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    const result = await uploadBundle({
      bundle: FAKE_BUNDLE,
      clientEmail: 'c@x.com',
      consultantConsent: FAKE_CONSENT,
      apiKey: 'wrong',
      apiBaseUrl: 'https://app.x',
      fetcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/Invalid consultant key/);
    }
  });

  it('falls back to a status-only message when the body is not JSON', async () => {
    const fetcher = async () => new Response('upstream timeout', { status: 504 });
    const result = await uploadBundle({
      bundle: FAKE_BUNDLE,
      clientEmail: 'c@x.com',
      consultantConsent: FAKE_CONSENT,
      apiKey: 'k',
      apiBaseUrl: 'https://app.x',
      fetcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(504);
      expect(result.error).toMatch(/504/);
    }
  });
});
