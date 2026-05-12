// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { pathToFileURL } from 'node:url';

/**
 * Wrap a URL in an OSC 8 hyperlink escape sequence so it renders as a
 * cmd-clickable link in supportive terminals. Falls back to the raw URL
 * (or the label, if the terminal doesn't support hyperlinks but a label
 * was requested — we still emit the URL so the user can copy it).
 *
 * OSC 8 spec: https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 *
 * Why detect terminal capability rather than always emit the escape sequence:
 * unsupportive terminals render the escape sequence as visible garbage in
 * the output (`]8;;<url>\<text>]8;;\`), which is worse than a raw URL.
 */

const SUPPORTED_TERM_PROGRAMS = new Set([
  'iTerm.app',
  'Apple_Terminal',
  'vscode',
  'WezTerm',
  'ghostty',
  'Hyper',
  'WarpTerminal',
  'Tabby',
]);

/**
 * Some terminals advertise OSC 8 support via their own env vars rather than
 * TERM_PROGRAM. Detect those independently so we still emit clickable links
 * for them.
 */
function detectByEnvVar(): boolean {
  return Boolean(
    process.env.KITTY_WINDOW_ID ||
    process.env.WT_SESSION ||
    process.env.ALACRITTY_LOG ||
    process.env.WEZTERM_EXECUTABLE,
  );
}

interface Options {
  /** Display text for the hyperlink. Defaults to the URL itself. */
  label?: string;
}

export function clickableLink(url: string, options: Options = {}): string {
  const supports =
    process.stdout.isTTY === true &&
    ((typeof process.env.TERM_PROGRAM === 'string' &&
      SUPPORTED_TERM_PROGRAMS.has(process.env.TERM_PROGRAM)) ||
      detectByEnvVar());

  // Falls back to the human-readable form so unsupportive terminals don't
  // get the (less-readable) raw URL. clickableFilePath sets label to the
  // bare path; URL-based callers default label to the URL anyway.
  if (!supports) return options.label ?? url;

  const text = options.label ?? url;
  // OSC 8 hyperlink wraps clickable text. Some terminals (notably Apple
  // Terminal) do not visually distinguish hyperlinks at all — the text looks
  // identical to plain output even though it is cmd-clickable. We wrap the
  // label in ANSI underline + a soft blue color so users see "this is a
  // link" even where the terminal itself does not decorate it.
  //
  // ESC ] 8 ; ; <url> ESC \ <SGR underline+color> <text> <SGR reset> ESC ] 8 ; ; ESC \
  return `]8;;${url}\\[4;38;5;33m${text}[0m]8;;\\`;
}

/**
 * Render an absolute filesystem path as a cmd-clickable link in supportive
 * terminals. The displayed text is the bare path (no `file://` prefix), so
 * unsupportive terminals still show a copyable, recognizable path. Cross-
 * platform: `pathToFileURL` correctly handles drive letters on Windows and
 * percent-encodes special characters.
 */
export function clickableFilePath(absolutePath: string): string {
  const fileUrl = pathToFileURL(absolutePath).href;
  return clickableLink(fileUrl, { label: absolutePath });
}
