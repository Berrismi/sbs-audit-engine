<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# @hellomavens/plugin-security-review

> Salesforce CLI plugin that runs the HelloMavens security review against a
> target Salesforce org. Wraps the
> [`@hellomavens/security-review-for-salesforce-engine`](../sbs-engine) scoring
> engine and the `scan-core` evidence collector in a thin `sf` plugin shell.

## Status

**Phase 5, Block A** — scaffolding + preflight checks. Command bodies stub
out the actual scan + upload flow until later blocks ship:

- Block B: SOQL bundle + `scan-core` evidence collection
- Block C: Salesforce Health Check API integration
- Block D: Salesforce Code Analyzer subprocess wiring
- Block E: per-evaluator CLI evidence paths
- Block F: backend `/api/scan/upload` + plugin's `upload` command + `login`
  command (consultant API key storage)
- Block G: docs + smoke test against a Developer Edition org

## Install (when shipped)

```sh
sf plugins install @hellomavens/plugin-security-review
```

## Usage (target shape — most commands stubbed in Block A)

```sh
# One-shot scan + upload + report URL
sf security review run --target-org client-prod --client-email contact@client.com

# Upload a previously-collected evidence bundle
sf security review upload bundle.json --client-email contact@client.com

# Store the HelloMavens consultant API key in your OS keychain
sf security review login
```

## Development

```sh
pnpm test       # vitest
pnpm typecheck
pnpm build      # emits to dist/
```

The plugin is private (`"private": true`) until Block G publishes. Until then,
local linking via `sf plugins link <path>` is the way to test it against your
own sf install.

## License

MIT. See repo-root [`LICENSE`](../../LICENSE) and [`ATTRIBUTION.md`](../../ATTRIBUTION.md).
