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
    expect(result).toContain(`]8;;${URL}\\Open report]8;;\\`);
    expect(result).not.toContain(`]8;;\\${URL}`);
  });

  it('falls back to raw URL when label provided but terminal unsupported', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    expect(clickableLink(URL, { label: 'Open report' })).toBe(URL);
  });
});
