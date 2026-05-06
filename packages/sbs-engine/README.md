<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# @hellomavens/security-review-for-salesforce-engine

> Open source scoring engine implementing the
> [Security Benchmark for Salesforce (SBS)](https://docs.securitybenchmark.org)
> standard, with HelloMavens-developed evaluators, evidence framework, and
> scoring algorithm.

[![npm version](https://img.shields.io/npm/v/@hellomavens/security-review-for-salesforce-engine?label=npm)](https://www.npmjs.com/package/@hellomavens/security-review-for-salesforce-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Renamed from `@hellomavens/sbs-engine`** as of `0.0.0-alpha.5`. See the
> [Migration section in the repo README](https://github.com/Berrismi/sbs-audit-engine#migration-from-hellomavenssbs-engine)
> for details. The old package is deprecated; this package supersedes it.

## Install

```sh
pnpm add @hellomavens/security-review-for-salesforce-engine
# or
npm i @hellomavens/security-review-for-salesforce-engine
```

> Phase 1 alpha. The API will change before 0.1.0. Pin exactly:
> `"@hellomavens/security-review-for-salesforce-engine": "0.0.0-alpha.10"`.

## What this is

A typed scoring engine and 54-control library (mirroring SBS upstream
`main` @ `d4304e1`; latest tagged release `v0.4.1` carried 42) for
auditing Salesforce orgs against the open
[Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site).

Built by HelloMavens. Implements the SBS standard — does not author it.
Per SBS license naming guidance, this is an SBS-compatible scanner, not
an official SBS project.

## Usage (current alpha)

```ts
import {
  ENGINE_VERSION,
  evaluateAcs004,
  type EvaluatorInput,
} from '@hellomavens/security-review-for-salesforce-engine';
import controls from '@hellomavens/security-review-for-salesforce-engine/controls';

console.log(`engine v${ENGINE_VERSION}, SBS v${controls.sbs_version}`);
console.log(`${controls.controls.length} controls loaded`);
```

The full evaluator surface plus the `score()` entry point ship in Phase 3 (already
shipped); CLI evidence paths (SOQL / Code Analyzer / Health Check) ship alongside
the consultant CLI in Phase 5.

## What HelloMavens added

To be transparent about what is built vs. borrowed:

- **Borrowed (CC BY-SA 4.0):** the 54 control definitions from SBS
  upstream `main` @ `d4304e1` (ahead of latest tagged `v0.4.1`),
  normalized into `data/controls.json` (also CC BY-SA 4.0 per
  ShareAlike).
- **Borrowed (Apache-2.0/BSD/MIT):** runtime dependencies, see ATTRIBUTION.md.
- **Built by HelloMavens (MIT):** scoring algorithm, evaluator pattern,
  OWASP/HIPAA/SOC 2/ISO 27001 mappings, types, tests, fetcher tooling.

## Exports

| Path                                                          | Contents                                                |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `@hellomavens/security-review-for-salesforce-engine`          | `ENGINE_VERSION`, `score()`, types, evaluators          |
| `@hellomavens/security-review-for-salesforce-engine/controls` | The full normalized control library JSON (CC BY-SA 4.0) |
| `@hellomavens/security-review-for-salesforce-engine/types`    | TypeScript types only                                   |

## License

- Code: [MIT](./LICENSE)
- `data/controls.json` (derived from SBS): CC BY-SA 4.0
- Required notices: [NOTICE](./NOTICE)
- Per-source attribution: [ATTRIBUTION.md](./ATTRIBUTION.md)

## Links

- Source repo: [github.com/Berrismi/sbs-audit-engine](https://github.com/Berrismi/sbs-audit-engine) (will move to `hellomavens` GitHub org)
- Hosted audit (consultant + questionnaire surfaces): hellomavens.com/audit (coming soon)
- Issues: [github.com/Berrismi/sbs-audit-engine/issues](https://github.com/Berrismi/sbs-audit-engine/issues)
