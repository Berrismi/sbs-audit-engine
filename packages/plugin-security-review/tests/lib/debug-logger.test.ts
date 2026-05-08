// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDebugLogger, makeScanStartedPayload } from '../../src/lib/debug-logger';

describe('makeDebugLogger — disabled', () => {
  it('returns a no-op logger when enabled=false', async () => {
    const logger = makeDebugLogger({ enabled: false, outputDir: '/does/not/matter' });
    expect(logger.enabled).toBe(false);
    expect(logger.path).toBe('');
    // Event call must not throw or write anything.
    await expect(logger.event('any-phase', 'any-event', { x: 1 })).resolves.toBeUndefined();
  });
});

describe('makeDebugLogger — enabled', () => {
  it('writes one JSON-lines entry per event() call to <outputDir>/.hm-debug.log', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hm-dbg-'));
    const logger = makeDebugLogger({ enabled: true, outputDir: dir });

    expect(logger.enabled).toBe(true);
    expect(logger.path).toBe(`${dir}/.hm-debug.log`);

    await logger.event('preflight', 'started');
    await logger.event(
      'evidence',
      'query_ok',
      { query_id: 'acs-001-permset-inventory', row_count: 28 },
      'info',
    );
    await logger.event('upload', 'failed', { status: 500 }, 'error');

    const raw = await readFile(logger.path, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(3);

    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({
      phase: 'preflight',
      event: 'started',
      level: 'info',
    });
    expect(parsed[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed[1]).toMatchObject({
      phase: 'evidence',
      event: 'query_ok',
      level: 'info',
      data: { query_id: 'acs-001-permset-inventory', row_count: 28 },
    });
    expect(parsed[2]).toMatchObject({
      phase: 'upload',
      event: 'failed',
      level: 'error',
      data: { status: 500 },
    });
  });

  it('omits data field when empty so log lines stay compact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hm-dbg-'));
    const logger = makeDebugLogger({ enabled: true, outputDir: dir });

    await logger.event('score', 'started');
    await logger.event('score', 'finished', {});

    const lines = (await readFile(logger.path, 'utf8')).trim().split('\n');
    for (const l of lines) {
      const parsed = JSON.parse(l);
      expect(parsed).not.toHaveProperty('data');
    }
  });

  it('appends to an existing log file rather than overwriting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hm-dbg-'));
    const logger = makeDebugLogger({ enabled: true, outputDir: dir });

    await logger.event('preflight', 'started');
    // Second logger over the same dir simulates a re-run.
    const logger2 = makeDebugLogger({ enabled: true, outputDir: dir });
    await logger2.event('preflight', 'started');

    const lines = (await readFile(logger.path, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('makeScanStartedPayload — PII guarantees', () => {
  it('records alias presence as a boolean, never the alias value', () => {
    const payload = makeScanStartedPayload({
      engineVersion: '0.0.0-alpha.45',
      alias: 'mike@example.com',
      uploadModeRequested: 'auto',
      questionnaireMode: 'interactive',
      includeCodeAnalyzer: false,
    });
    expect(payload.alias_present).toBe(true);
    // The alias string itself must never make it into the payload.
    expect(JSON.stringify(payload)).not.toContain('mike@example.com');
    expect(JSON.stringify(payload)).not.toContain('example.com');
  });

  it('records flag values that are themselves enumerated, not free-text', () => {
    const payload = makeScanStartedPayload({
      engineVersion: '0.0.0-alpha.45',
      alias: 'x',
      uploadModeRequested: 'local',
      questionnaireMode: 'file',
      includeCodeAnalyzer: true,
    });
    expect(payload.upload_mode_requested).toBe('local');
    expect(payload.questionnaire_mode).toBe('file');
    expect(payload.include_code_analyzer).toBe(true);
    expect(payload.engine_version).toBe('0.0.0-alpha.45');
  });
});
