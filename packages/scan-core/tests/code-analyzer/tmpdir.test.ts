// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Smoke tests for the production node:fs-backed TmpdirManager. Touches
// real filesystem in the OS temp dir (cleaned up after each test).

import { describe, it, expect } from 'vitest';
import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { makeNodeTmpdirManager } from '../../src/code-analyzer/tmpdir';

describe('makeNodeTmpdirManager', () => {
  it('creates a fresh writable directory under the OS temp root', async () => {
    const mgr = makeNodeTmpdirManager();
    const dir = await mgr.create();

    expect(dir).toContain('hm-scan-');
    const stats = await stat(dir);
    expect(stats.isDirectory()).toBe(true);

    await mgr.cleanup(dir);
  });

  it('reads a file written into the tmpdir', async () => {
    const mgr = makeNodeTmpdirManager();
    const dir = await mgr.create();
    const filePath = join(dir, 'test.json');
    await writeFile(filePath, '{"hello":"world"}', 'utf8');

    const contents = await mgr.readFile(filePath);

    expect(contents).toBe('{"hello":"world"}');
    await mgr.cleanup(dir);
  });

  it('cleanup is idempotent — calling on a missing path does not throw', async () => {
    const mgr = makeNodeTmpdirManager();
    await expect(mgr.cleanup('/tmp/definitely-does-not-exist-xyz-abc')).resolves.not.toThrow();
  });
});
