// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Smoke tests for the production node:fs-backed TmpdirManager. Each
// test creates an isolated parentDir under os.tmpdir() so the touches
// don't bleed into the workspace.

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, stat, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeNodeTmpdirManager } from '../../src/code-analyzer/tmpdir';

async function makeIsolatedParent(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'hm-scan-test-parent-'));
}

describe('makeNodeTmpdirManager', () => {
  it('creates a fresh writable directory under parentDir, prefixed `.hm-scan-`', async () => {
    const parent = await makeIsolatedParent();
    try {
      const mgr = makeNodeTmpdirManager({ parentDir: parent });
      const dir = await mgr.create();

      expect(dir.startsWith(join(parent, '.hm-scan-'))).toBe(true);
      const stats = await stat(dir);
      expect(stats.isDirectory()).toBe(true);

      await mgr.cleanup(dir);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('defaults parentDir to process.cwd() when no option is passed', async () => {
    // Save + restore cwd so the test isn't order-dependent. Use an
    // isolated tmpdir as the simulated "project root". macOS resolves
    // /var/folders → /private/var/folders, so compare via realpath to
    // canonicalize both sides.
    const originalCwd = process.cwd();
    const isolatedParent = await makeIsolatedParent();
    process.chdir(isolatedParent);
    try {
      const mgr = makeNodeTmpdirManager();
      const dir = await mgr.create();

      const realDir = await realpath(dir);
      const realParent = await realpath(isolatedParent);
      expect(realDir.startsWith(join(realParent, '.hm-scan-'))).toBe(true);

      await mgr.cleanup(dir);
    } finally {
      process.chdir(originalCwd);
      await rm(isolatedParent, { recursive: true, force: true });
    }
  });

  it('reads a file written into the tmpdir', async () => {
    const parent = await makeIsolatedParent();
    try {
      const mgr = makeNodeTmpdirManager({ parentDir: parent });
      const dir = await mgr.create();
      const filePath = join(dir, 'test.json');
      await writeFile(filePath, '{"hello":"world"}', 'utf8');

      const contents = await mgr.readFile(filePath);

      expect(contents).toBe('{"hello":"world"}');
      await mgr.cleanup(dir);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('cleanup removes the directory and all its contents', async () => {
    const parent = await makeIsolatedParent();
    try {
      const mgr = makeNodeTmpdirManager({ parentDir: parent });
      const dir = await mgr.create();
      await writeFile(join(dir, 'a.txt'), 'a', 'utf8');
      await writeFile(join(dir, 'b.txt'), 'b', 'utf8');

      await mgr.cleanup(dir);

      // After cleanup the parent should not still contain the .hm-scan-* dir.
      const remaining = await readdir(parent);
      expect(remaining.filter((name) => name.startsWith('.hm-scan-'))).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('cleanup is idempotent — calling on a missing path does not throw', async () => {
    const mgr = makeNodeTmpdirManager();
    await expect(
      mgr.cleanup(join(tmpdir(), 'definitely-does-not-exist-xyz-abc')),
    ).resolves.not.toThrow();
  });
});
