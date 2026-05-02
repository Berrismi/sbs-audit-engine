#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { ENGINE_VERSION } from '@hellomavens/sbs-engine';

const HELP = `
@hellomavens/sbs-scan (engine v${ENGINE_VERSION})

The consultant CLI is not implemented in Phase 1. It is delivered in Phase 5
of the build plan. See:

  https://github.com/hellomavens/sbs-audit-engine
  docs/hellomavens-master-prompt.md (Phase 5 — Consultant CLI)

When implemented, it will support:

  sbs-scan auth
  sbs-scan scan --target-org <alias>
  sbs-scan upload <bundle.json>
`;

process.stdout.write(HELP);
process.exit(0);
