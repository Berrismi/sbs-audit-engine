// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  loadCredentials,
  saveCredentials,
  getCredentialsPath,
  type Credentials,
} from '../../src/lib/consultant-key';

const FAKE_CREDS: Credentials = {
  apiKey: 'hm_abc',
  apiBaseUrl: 'https://api.example',
  consultantConsent: {
    version: 'consultant_engagement_v1',
    signedAt: '2026-05-04T00:00:00Z',
  },
};

let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), 'hm-creds-'));
  process.env.HM_CONFIG_DIR = tempHome;
});

describe('saveCredentials/loadCredentials', () => {
  it('writes JSON with mode 0600 and round-trips on read', async () => {
    await saveCredentials(FAKE_CREDS);
    const path = getCredentialsPath();
    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(FAKE_CREDS);
    expect(await loadCredentials()).toEqual(FAKE_CREDS);
  });

  it('returns null when the credentials file does not exist', async () => {
    expect(await loadCredentials()).toBeNull();
  });

  it('throws a friendly error when the credentials file is malformed', async () => {
    const path = getCredentialsPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'not-json');
    await expect(loadCredentials()).rejects.toThrow(/credentials file/i);
  });

  it('honors HM_CONFIG_DIR env override', () => {
    expect(getCredentialsPath().startsWith(tempHome)).toBe(true);
  });
});
