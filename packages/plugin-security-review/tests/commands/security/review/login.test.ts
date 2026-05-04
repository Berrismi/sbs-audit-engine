// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SecurityReviewLogin from '../../../../src/commands/security/review/login';
import { loadCredentials } from '../../../../src/lib/consultant-key';

let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), 'hm-login-'));
  process.env.HM_CONFIG_DIR = tempHome;
});

afterEach(async () => {
  vi.restoreAllMocks();
  // sf-plugins-core's SfCommand._run adds permanent SIGINT/SIGTERM listeners
  // each invocation. Vitest's teardown emits these and the listeners call
  // this.exit(130), polluting the test result. Strip them after each test.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) {
    process.removeAllListeners(sig);
  }
  await rm(tempHome, { recursive: true, force: true });
});

function stubPrompts({ accept, apiKey }: { accept: boolean; apiKey?: string }) {
  const confirmSpy = vi.spyOn(SecurityReviewLogin.prototype, 'confirm').mockResolvedValue(accept);
  const secretSpy = apiKey
    ? vi.spyOn(SecurityReviewLogin.prototype, 'secretPrompt').mockResolvedValue(apiKey)
    : vi.spyOn(SecurityReviewLogin.prototype, 'secretPrompt');
  return { confirmSpy, secretSpy };
}

describe('sf security review login', () => {
  it('persists API key + base URL + consent metadata after the consultant accepts the disclaimer', async () => {
    stubPrompts({ accept: true, apiKey: 'hm_abc' });

    const result = await SecurityReviewLogin.run(['--api-base-url', 'https://app.example.com']);

    expect(result.loggedIn).toBe(true);
    const stored = await loadCredentials();
    expect(stored?.apiKey).toBe('hm_abc');
    expect(stored?.apiBaseUrl).toBe('https://app.example.com');
    expect(stored?.consultantConsent.version).toBe('consultant_engagement_v1');
    expect(new Date(stored!.consultantConsent.signedAt).getTime()).toBeGreaterThan(
      Date.now() - 5000,
    );
  });

  it('aborts without persisting when the consultant declines the disclaimer', async () => {
    const { secretSpy } = stubPrompts({ accept: false });

    await expect(
      SecurityReviewLogin.run(['--api-base-url', 'https://app.example.com']),
    ).rejects.toThrow(/disclaimer/i);

    expect(secretSpy).not.toHaveBeenCalled();
    expect(await loadCredentials()).toBeNull();
  });

  it('trims whitespace around the API key and base URL before persisting', async () => {
    stubPrompts({ accept: true, apiKey: '  hm_padded  ' });

    await SecurityReviewLogin.run(['--api-base-url', 'https://app.example.com']);

    const stored = await loadCredentials();
    expect(stored?.apiKey).toBe('hm_padded');
    expect(stored?.apiBaseUrl).toBe('https://app.example.com');
  });
});
