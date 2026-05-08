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
const mockEngine = vi.hoisted(() => ({ score: vi.fn() }));

vi.mock('../../../../src/lib/preflight', () => mockPreflight);
vi.mock('../../../../src/lib/sf-runner', () => mockRunner);
vi.mock('../../../../src/lib/consultant-key', () => mockKey);
vi.mock('../../../../src/lib/upload-client', () => mockClient);
vi.mock('@hellomavens/security-review-for-salesforce-scan-core', () => mockScanCore);
vi.mock('@hellomavens/security-review-for-salesforce-engine', () => mockEngine);

import SecurityReviewRun from '../../../../src/commands/security/review/run';

const FAKE_BUNDLE = {
  subject_id: 'subj-1',
  collected_at: '2026-05-04T00:00:00Z',
  evidence: [{ source: 'soql' as const, query: 'SELECT Id FROM User', rows: [], query_id: 'q-1' }],
};

const FAKE_REPORT = {
  overall_score: 85,
  risk_grade: 'B',
  critical_fail_count: 0,
  inconclusive_percent: 20,
  evidence_sufficiency: 'sufficient',
  by_category: [],
  control_results: [],
  sbs_version: 'v0.4.1+d4304e1',
  engine_version: '0.0.0-alpha.41',
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
 * @salesforce/core for real Org auth lookup). Tests pre-stub the
 * parsed flags via this helper.
 *
 * Defaults `no-questionnaire: true` so existing tests don't trip the
 * non-TTY guard added in alpha.43. Override per-test by passing
 * `'no-questionnaire': false` (and providing `questionnaire` or relying
 * on stdin.isTTY in test isolation).
 */
function stubParse(flags: Record<string, unknown>): void {
  vi.spyOn(
    SecurityReviewRun.prototype as unknown as { parse: () => unknown },
    'parse',
  ).mockResolvedValue({
    flags: { 'no-questionnaire': true, ...flags },
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
    mockEngine.score,
  ]) {
    m.mockReset();
  }
  // Default scoring stub — individual tests override with .mockReturnValue.
  mockEngine.score.mockReturnValue(FAKE_REPORT);
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) {
    process.removeAllListeners(sig);
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe('sf security review run', () => {
  it('local mode: scans, scores, emits findings.json + report.json, no upload', async () => {
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'output-dir': tempDir,
      'include-code-analyzer': false,
      // upload is undefined → auto-detect from creds (which return null below)
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(null); // OSS user — no creds
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });

    const result = await SecurityReviewRun.run([]);

    expect(result.uploadMode).toBe('local');
    expect(result.findingsPath).toBe(join(tempDir, 'findings.json'));
    expect(result.reportPath).toBe(join(tempDir, 'report.json'));
    expect(result.reportUrl).toBeUndefined();
    expect(mockClient.uploadBundle).not.toHaveBeenCalled();

    // Files actually written
    expect(JSON.parse(await readFile(result.findingsPath, 'utf8'))).toEqual(FAKE_BUNDLE);
    expect(JSON.parse(await readFile(result.reportPath, 'utf8'))).toEqual(FAKE_REPORT);
  });

  it('upload mode (auto-detect): creds present + client-email passed → upload + local emission', async () => {
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'client-email': 'c@x.com',
      'output-dir': tempDir,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS); // HM consultant — creds exist
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockClient.uploadBundle.mockResolvedValue({
      ok: true,
      reportId: 'r-1',
      reportUrl: 'https://app.example/audit/report/r-1',
    });

    const result = await SecurityReviewRun.run([]);

    expect(result.uploadMode).toBe('upload');
    expect(result.reportUrl).toBe('https://app.example/audit/report/r-1');
    // Local files still written even when uploading
    expect((await stat(result.findingsPath)).size).toBeGreaterThan(0);
    expect((await stat(result.reportPath)).size).toBeGreaterThan(0);
    expect(mockClient.uploadBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        bundle: FAKE_BUNDLE,
        clientEmail: 'c@x.com',
        apiKey: FAKE_CREDS.apiKey,
      }),
    );
  });

  it('explicit --no-upload skips upload even when creds are present', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'output-dir': tempDir,
      upload: false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS); // creds present, but --no-upload wins
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });

    const result = await SecurityReviewRun.run([]);

    expect(result.uploadMode).toBe('local');
    expect(mockClient.uploadBundle).not.toHaveBeenCalled();
  });

  it('explicit --upload errors when creds are missing', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'client-email': 'c@x.com',
      'output-dir': tempDir,
      upload: true,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(null);

    await expect(SecurityReviewRun.run([])).rejects.toThrow(
      /no consultant credentials are stored/i,
    );
    expect(mockScanCore.collectEvidence).not.toHaveBeenCalled();
  });

  it('upload mode errors when --client-email is missing', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'output-dir': tempDir,
      upload: true,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/--client-email is required/i);
    expect(mockScanCore.collectEvidence).not.toHaveBeenCalled();
  });

  it('--include-code-analyzer toggles onlySources + supplies codeAnalyzer opts', async () => {
    stubParse({
      'target-org': fakeOrg('client-prod'),
      'output-dir': tempDir,
      upload: false,
      'include-code-analyzer': true,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });

    await SecurityReviewRun.run([]);

    const passed = mockScanCore.collectEvidence.mock.calls[0]![0];
    expect(passed.onlySources).toContain('code_analyzer');
    expect(passed.codeAnalyzer).toBeDefined();
    expect(passed.codeAnalyzer.alias).toBe('client-prod');
  });

  it('errors when upload fails', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'client-email': 'c@x.com',
      'output-dir': tempDir,
      upload: true,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockKey.loadCredentials.mockResolvedValue(FAKE_CREDS);
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });
    mockClient.uploadBundle.mockResolvedValue({ ok: false, status: 500, error: 'boom' });

    await expect(SecurityReviewRun.run([])).rejects.toThrow(/500.*boom/);
  });

  it('propagates preflight failures', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'output-dir': tempDir,
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

  it('always includes metadata_api in onlySources by default (alpha.41+)', async () => {
    stubParse({
      'target-org': fakeOrg(),
      'output-dir': tempDir,
      upload: false,
      'include-code-analyzer': false,
    });
    mockPreflight.runPreflight.mockResolvedValue({ ok: true });
    mockScanCore.collectEvidence.mockResolvedValue({ bundle: FAKE_BUNDLE });

    await SecurityReviewRun.run([]);

    const passed = mockScanCore.collectEvidence.mock.calls[0]![0];
    expect(passed.onlySources).toContain('metadata_api');
    expect(passed.onlySources).toContain('soql');
    expect(passed.onlySources).toContain('health_check_api');
    expect(passed.onlySources).toContain('limits_rest_api');
  });
});
