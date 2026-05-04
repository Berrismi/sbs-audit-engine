// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ConsultantConsent {
  version: string;
  signedAt: string;
}

export interface Credentials {
  apiKey: string;
  apiBaseUrl: string;
  consultantConsent: ConsultantConsent;
}

export function getCredentialsPath(): string {
  const root = process.env.HM_CONFIG_DIR ?? join(homedir(), '.config', 'hellomavens');
  return join(root, 'credentials.json');
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  const path = getCredentialsPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export async function loadCredentials(): Promise<Credentials | null> {
  const path = getCredentialsPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    throw new Error(
      `Could not parse credentials file at ${path}. Re-run \`sf security review login\` to recreate it.`,
    );
  }
}
