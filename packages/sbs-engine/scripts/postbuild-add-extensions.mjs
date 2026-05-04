// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Post-build extension-rewriter.
//
// Our tsconfig uses moduleResolution: "Bundler" which lets source code
// import without `.js` extensions. The published package is type:"module"
// though, and Node ESM strictly requires explicit extensions on relative
// imports. This script walks dist/ after `tsc` and rewrites every bare
// relative import to add `.js`.
//
// Why not switch to moduleResolution NodeNext? It would force every
// internal import in src/ to write `./foo.js` (referencing the .js
// output from .ts source), which is unergonomic and adds noise to every
// PR. The post-build rewrite keeps source clean and the published artifact
// Node-ESM compliant.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Optional CLI arg: path to dist directory to rewrite. Defaults to the
// engine's own dist for the existing engine build call. Other workspace
// packages (e.g. scan-core) pass their own dist path.
const DIST = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..', 'dist');

let rewriteCount = 0;
let fileCount = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (entry.endsWith('.js') || entry.endsWith('.d.ts')) processFile(path);
  }
}

function processFile(path) {
  fileCount += 1;
  const src = readFileSync(path, 'utf-8');

  // Matches: from '...', from "...", import('...'), export ... from '...'
  // Captures: (prefix)(relative-path)(suffix)
  const out = src.replace(
    /(from\s+|import\s*\(\s*)(['"])(\.\.?\/[^'"]+)(['"])/g,
    (_match, lead, openQuote, importPath, closeQuote) => {
      // Already has an extension? Leave it alone.
      // Match common file extensions at the path tail: .js, .mjs, .cjs, .json, .ts, .d.ts
      if (/\.(?:m?js|cjs|json|ts|tsx|d\.ts)$/.test(importPath)) {
        return _match;
      }
      rewriteCount += 1;
      return `${lead}${openQuote}${importPath}.js${closeQuote}`;
    },
  );

  if (out !== src) writeFileSync(path, out);
}

walk(DIST);
console.log(`postbuild: rewrote ${rewriteCount} import(s) across ${fileCount} file(s) in dist/`);
