// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

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
]);

interface Options {
  /** Display text for the hyperlink. Defaults to the URL itself. */
  label?: string;
}

export function clickableLink(url: string, options: Options = {}): string {
  const supports =
    process.stdout.isTTY === true &&
    typeof process.env.TERM_PROGRAM === 'string' &&
    SUPPORTED_TERM_PROGRAMS.has(process.env.TERM_PROGRAM);

  if (!supports) return url;

  const text = options.label ?? url;
  // ESC ] 8 ; ; <url> ESC \ <text> ESC ] 8 ; ; ESC \
  // Using  for ESC and \\ for the closing backslash-after-OSC.
  return `]8;;${url}\\${text}]8;;\\`;
}
