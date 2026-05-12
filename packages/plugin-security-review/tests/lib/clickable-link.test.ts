// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clickableLink } from '../../src/lib/clickable-link';

const URL = 'https://audit.hellomavens.test/audit/report/r-1?preview=tok';

describe('clickableLink', () => {
  let originalIsTTY: boolean | undefined;
  let originalTermProgram: string | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalTermProgram = process.env.TERM_PROGRAM;
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    if (originalTermProgram === undefined) delete process.env.TERM_PROGRAM;
    else process.env.TERM_PROGRAM = originalTermProgram;
  });

  it('returns the raw URL when stdout is not a TTY (e.g. piped to a file)', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    process.env.TERM_PROGRAM = 'iTerm.app';
    expect(clickableLink(URL)).toBe(URL);
  });

  it('returns the raw URL when TERM_PROGRAM is missing', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    delete process.env.TERM_PROGRAM;
    expect(clickableLink(URL)).toBe(URL);
  });

  it('returns the raw URL when TERM_PROGRAM is unsupported', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.TERM_PROGRAM = 'some-unknown-terminal';
    expect(clickableLink(URL)).toBe(URL);
  });

  it.each(['iTerm.app', 'Apple_Terminal', 'vscode', 'WezTerm', 'ghostty'])(
    'wraps URL in OSC 8 escape sequence when TERM_PROGRAM=%s and stdout is a TTY',
    (termProgram) => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      process.env.TERM_PROGRAM = termProgram;
      const result = clickableLink(URL);
      // OSC 8 hyperlink: ESC ] 8 ; ; <url> ESC \ <text> ESC ] 8 ; ; ESC \
      expect(result).toContain(`]8;;${URL}\\`);
      expect(result).toContain(`]8;;\\`);
      expect(result).toContain(URL);
    },
  );

  it('uses provided label text when given (instead of URL)', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.TERM_PROGRAM = 'iTerm.app';
    const result = clickableLink(URL, { label: 'Open report' });
    // OSC 8 hyperlink: URL appears once as the click target, label appears
    // once as visible text, wrapped in ANSI underline + color so Apple
    // Terminal users see a visible "link" indicator (the terminal itself
    // does not decorate OSC 8 hyperlinks).
    expect(result).toContain(`]8;;${URL}`);
    expect(result).toContain('Open report');
    expect(result).toContain('[4;38;5;33m');
    expect(result).toContain('[0m');
  });

  it('falls back to the label (human-readable form) when terminal unsupported and a label was provided', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    // Label is the human-readable form callers chose; unsupportive terminals
    // should show that, not the raw URL (which is the less-readable form).
    expect(clickableLink(URL, { label: 'Open report' })).toBe('Open report');
  });
});

import { clickableFilePath } from '../../src/lib/clickable-link';

describe('clickableFilePath', () => {
  const ORIGINAL_TERM_PROGRAM = process.env.TERM_PROGRAM;
  const ORIGINAL_IS_TTY = process.stdout.isTTY;

  beforeEach(() => {
    delete process.env.TERM_PROGRAM;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    if (ORIGINAL_TERM_PROGRAM === undefined) delete process.env.TERM_PROGRAM;
    else process.env.TERM_PROGRAM = ORIGINAL_TERM_PROGRAM;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: ORIGINAL_IS_TTY,
      configurable: true,
    });
  });

  it('returns the bare path when terminal does not support OSC 8 hyperlinks', () => {
    expect(clickableFilePath('/tmp/foo/report.html')).toBe('/tmp/foo/report.html');
  });

  it('wraps with OSC 8 + file:// URL in supportive terminals', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.TERM_PROGRAM = 'iTerm.app';
    const out = clickableFilePath('/tmp/foo/report.html');
    // URL form is file:// + absolute path (what terminals follow on click)
    expect(out).toContain('file:///tmp/foo/report.html');
    // Visible label is the bare path so it stays readable in any terminal
    expect(out).toContain('/tmp/foo/report.html');
    // Output is longer than just the URL/label because OSC 8 wraps it
    expect(out.length).toBeGreaterThan('/tmp/foo/report.html'.length);
  });

  it('percent-encodes special characters in the URL while keeping the label readable', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.TERM_PROGRAM = 'iTerm.app';
    const out = clickableFilePath('/tmp/with space/report.html');
    // URL is percent-encoded
    expect(out).toContain('file:///tmp/with%20space/report.html');
    // Label is the raw path (un-encoded) for readability
    expect(out).toContain('/tmp/with space/report.html');
  });
});
