// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockPreflight = vi.hoisted(() => ({ runPreflight: vi.fn() }));
const mockRunner = vi.hoisted(() => ({ makeExecaSfRunner: vi.fn(() => ({})) }));
const mockKey = vi.hoisted(() => ({ loadCredentials: vi.fn() }));
const mockClient = vi.hoisted(() => ({ uploadBundle: vi.fn() }));
const mockScanCore = vi.hoisted(() => ({
  collectEvidence: vi.fn(),
  makeExecaCodeAnalyzerSpawner: vi.fn(() => ({})),
  makeNodeTmpdirManager: vi.fn(() => ({})),
}));

vi.mock('../../../../src/lib/preflight', () => mockPreflight);
vi.mock('../../../../src/lib/sf-runner', () => mockRunner);
vi.mock('../../../../src/lib/consultant-key', () => mockKey);
vi.mock('../../../../src/lib/upload-client', () => mockClient);
vi.mock('@hellomavens/security-review-for-salesforce-scan-core', () => mockScanCore);

import SecurityReviewRun from '../../../../src/commands/security/review/run';

const FAKE_BUNDLE = {
  subject_id: 'subj-1',
  collected_at: '2026-05-04T00:00:00Z',
  evidence: [{ source: 'soql' as const, query: 'SELECT Id FROM User', rows: [], query_id: 'q-1' }],
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

function fakeOrg(alias = 'client-prod') {
  return {
    getUsername: () => alias,
    getConnection: vi.fn(async () => ({
      /* opaque ConnectionLike */
    })),
  };
}

/**
 * Spy `parse` so we don't invoke oclif's flag resolution (which hits
 * @salesforce/core for real Org auth lookup). The test calls
 * SecurityReviewRun.run([]), but the parsed flags are whatever we return.
 */
function stubParse(flags: Record<string, unknown>): void {
  // `parse` is protected on SfCommand; vi.spyOn's signature only accepts
  // public method names. Cast through `any` so the spy is installed at
  // runtime — the typecheck can't see protected methods on the prototype.
  vi.spyOn(
    SecurityReviewRun.prototype as unknown as { parse: () => unknown },
    'parse',
  ).mockResolvedValue({
    flags,
    args: {},
    argv: [],
    raw: [],
    metadata: { flags: {} },
  } as never);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'hm-run-'));
  for (const m of [
    mockPreflight.runPreflight,
    mockKey.loadCredentials,
    mockClient.uploadBundle,
    mockScanCore.collectEvidence,
  ]) {
    m.mockReset();
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) {
    process.removeAllListeners(sig);
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe('sf security review run', () => {
  it('errors if --client-email is missing without --no-upload', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'no-upload': false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/--client-email is required/i);
    expect(mockScanCore.collectEvidence).not.toHaveBeenCalled();
  });

  it('runs preflight → collectEvidence → upload and returns reportUrl on success', async () => {
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'client-email': 'c@x.com',
      'no-upload': false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockClient.uploadBundle.mockResolvedValue({
      ok: true,
      reportId: 'r-1',
      reportUrl: 'https://app.example/audit/report/r-1',
    });

    const result = await SecurityReviewRun.run([]);

    expect(result.preflightOk).toBe(true);
    expect(result.reportUrl).toBe('https://app.example/audit/report/r-1');
    expect(result.bundlePath).toBeUndefined();

    const passed = mockScanCore.collectEvidence.mock.calls[0]![0];
    expect(passed.onlySources).toEqual(['soql', 'health_check_api']);
    expect(passed.codeAnalyzer).toBeUndefined();
    expect(mockClient.uploadBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        bundle: FAKE_BUNDLE,
        clientEmail: 'c@x.com',
        consultantConsent: FAKE_CREDS.consultantConsent,
        apiKey: FAKE_CREDS.apiKey,
        apiBaseUrl: FAKE_CREDS.apiBaseUrl,
      }),
    );
  });

  it('--include-code-analyzer toggles onlySources + supplies codeAnalyzer opts', async () => {
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'client-email': 'c@x.com',
      'no-upload': false,
      'include-code-analyzer': true,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockClient.uploadBundle.mockResolvedValue({
      ok: true,
      reportId: 'r-1',
      reportUrl: 'https://x',
    });

    await SecurityReviewRun.run([]);

    const passed = mockScanCore.collectEvidence.mock.calls[0]![0];
    expect(passed.onlySources).toContain('code_analyzer');
    expect(passed.codeAnalyzer).toBeDefined();
    expect(passed.codeAnalyzer.alias).toBe('client-prod');
  });

  it('--no-upload writes the bundle to --output and returns bundlePath, no upload', async () => {
    const outputPath = join(tempDir, 'out.json');
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'no-upload': true,
      output: outputPath,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });

    const result = await SecurityReviewRun.run([]);

    expect(result.bundlePath).toBe(outputPath);
    expect(result.reportUrl).toBeUndefined();
    expect(mockClient.uploadBundle).not.toHaveBeenCalled();
    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    expect(written).toEqual(FAKE_BUNDLE);
    // Sanity: file actually exists
    expect((await stat(outputPath)).size).toBeGreaterThan(0);
  });

  it('errors when upload fails', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'client-email': 'c@x.com',
      'no-upload': false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockClient.uploadBundle.mockResolvedValue({ ok: false, status: 500, error: 'boom' });

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/500.*boom/);
  });

  it('errors when uploading without stored credentials', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'client-email': 'c@x.com',
      'no-upload': false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockKey.loadCredentials.mockResolvedValue(null);

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/sf security review login/i);
  });

  it('propagates preflight failures', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'client-email': 'c@x.com',
      'no-upload': false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({
      ok: false,
      code: 'org_not_authed',
      message: 'No active auth.',
      remediation: 'Run sf org login web.',
    });

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/No active auth/);
    expect(mockScanCore.collectEvidence).not.toHaveBeenCalled();
  });
});
