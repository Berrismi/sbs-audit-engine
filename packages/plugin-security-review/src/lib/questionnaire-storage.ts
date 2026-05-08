// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Persist the operator's answers to a YAML file under the HelloMavens config
// directory so they can re-run the scan non-interactively with
// `--questionnaire <path>`. File mode 0600 mirrors the consultant credentials
// pattern in `consultant-key.ts`.

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import type { AnswerSet } from '@hellomavens/security-review-for-salesforce-engine/questionnaire';

export interface SaveAnswersOptions {
  /** Org alias, used in the filename so multi-org operators can tell saves apart. */
  alias: string;
  /** Registry version stamped at save time so future loads can detect drift. */
  registryVersion: string;
  /** SBS version stamped at save time so loads can detect SBS upgrade. */
  sbsVersion: string;
  /** The validated answer set to persist. */
  answers: AnswerSet;
  /** Override for tests; defaults to ~/.config/hellomavens/. */
  rootDir?: string;
  /** Override for tests; defaults to current time. */
  now?: Date;
}

/**
 * Save answers to `<rootDir>/questionnaire/<alias>-<ISO-ts>.yml`. Returns the
 * absolute path so the caller can print it to the operator.
 */
export async function saveAnswers(opts: SaveAnswersOptions): Promise<string> {
  const root =
    opts.rootDir ?? process.env['HM_CONFIG_DIR'] ?? join(homedir(), '.config', 'hellomavens');
  const dir = join(root, 'questionnaire');
  const at = opts.now ?? new Date();
  const ts = at.toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${opts.alias}-${ts}.yml`);

  const doc = {
    metadata: {
      alias: opts.alias,
      registryVersion: opts.registryVersion,
      sbsVersion: opts.sbsVersion,
      savedAt: at.toISOString(),
    },
    answers: opts.answers,
  };

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path, stringify(doc), { mode: 0o600 });
  return path;
}
