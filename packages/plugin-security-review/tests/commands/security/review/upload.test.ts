// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockKey = vi.hoisted(() => ({ loadCredentials: vi.fn() }));
const mockClient = vi.hoisted(() => ({ uploadBundle: vi.fn() }));

vi.mock('../../../../src/lib/consultant-key', () => mockKey);
vi.mock('../../../../src/lib/upload-client', () => mockClient);

import SecurityReviewUpload from '../../../../src/commands/security/review/upload';

const FAKE_BUNDLE = {
  subject_id: 'subj-1',
  collected_at: '2026-05-04T00:00:00Z',
  evidence: [{ source: 'soql', query: 'SELECT Id FROM User', rows: [], query_id: 'q-1' }],
};

const FAKE_CREDS = {
  apiKey: 'hm_test',
  apiBaseUrl: 'https://app.example',
  consultantConsent: {
    version: 'consultant_engagement_v1',
    signedAt: '2026-05-04T00:00:00Z',
  },
};

let tempDir: string;
let bundlePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'hm-upload-'));
  bundlePath = join(tempDir, 'bundle.json');
  await writeFile(bundlePath, JSON.stringify(FAKE_BUNDLE));
  mockKey.loadCredentials.mockReset();
  mockClient.uploadBundle.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) {
    process.removeAllListeners(sig);
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe('sf security review upload', () => {
  it('errors with login-first hint when no credentials are stored', async () => {
    mockKey.loadCredentials.mockResolvedValue(null);

    await expect(
      SecurityReviewUpload.run(['--bundle', bundlePath, '--client-email', 'c@x.com']),
    ).rejects.toThrow(/sf security review login/i);
    expect(mockClient.uploadBundle).not.toHaveBeenCalled();
  });

  it('errors when the bundle file is not valid JSON', async () => {
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    await writeFile(bundlePath, 'not-json');

    await expect(
      SecurityReviewUpload.run(['--bundle', bundlePath, '--client-email', 'c@x.com']),
    ).rejects.toThrow(/parse bundle/i);
  });

  it('surfaces the verbatim backend error on non-200', async () => {
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockClient.uploadBundle.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Invalid consultant key.',
    });

    await expect(
      SecurityReviewUpload.run(['--bundle', bundlePath, '--client-email', 'c@x.com']),
    ).rejects.toThrow(/401.*Invalid consultant key/);
  });

  it('returns the report URL on success', async () => {
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockClient.uploadBundle.mockResolvedValue({
      ok: true,
      reportId: 'r-1',
      reportUrl: 'https://app.example/audit/report/r-1',
    });

    const result = await SecurityReviewUpload.run([
      '--bundle',
      bundlePath,
      '--client-email',
      'c@x.com',
    ]);

    expect(result.uploaded).toBe(true);
    expect(result.reportUrl).toBe('https://app.example/audit/report/r-1');
    expect(mockClient.uploadBundle).toHaveBeenCalledWith({
      bundle: FAKE_BUNDLE,
      clientEmail: 'c@x.com',
      consultantConsent: FAKE_CREDS.consultantConsent,
      apiKey: FAKE_CREDS.apiKey,
      apiBaseUrl: FAKE_CREDS.apiBaseUrl,
    });
  });
});
