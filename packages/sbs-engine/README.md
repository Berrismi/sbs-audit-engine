<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# @hellomavens/sbs-engine

> Open source scoring engine implementing the
> [Security Benchmark for Salesforce (SBS)](https://docs.securitybenchmark.org)
> standard, with HelloMavens-developed evaluators, evidence framework, and
> scoring algorithm.

[![npm version](https://img.shields.io/npm/v/@hellomavens/sbs-engine?label=npm)](https://www.npmjs.com/package/@hellomavens/sbs-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```sh
pnpm add @hellomavens/sbs-engine
# or
npm i @hellomavens/sbs-engine
```

> Phase 1 alpha. The API will change before 0.1.0. Pin exactly:
> `"@hellomavens/sbs-engine": "0.0.0-alpha.0"`.

## What this is

A typed scoring engine and 42-control library (growing toward SBS 1.0's
54 controls) for auditing Salesforce orgs against the open
[Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site).

Built by HelloMavens. Implements the SBS standard — does not author it.
Per SBS license naming guidance, this is an SBS-compatible scanner, not
an official SBS project.

## Usage (current alpha)

```ts
import { ENGINE_VERSION, evaluateAcs004, type EvaluatorInput } from '@hellomavens/sbs-engine';
import controls from '@hellomavens/sbs-engine/controls';

console.log(`engine v${ENGINE_VERSION}, SBS v${controls.sbs_version}`);
console.log(`${controls.controls.length} controls loaded`);
```

The full evaluator surface (other 41 evaluators + the `score()` entry point

- category/risk-grade scoring) lands in Phase 3.

## What HelloMavens added

To be transparent about what is built vs. borrowed:

- **Borrowed (CC BY-SA 4.0):** the 54 control definitions from SBS v0.4.1
  upstream, normalized into `data/controls.json` (also CC BY-SA 4.0 per
  ShareAlike).
- **Borrowed (Apache-2.0/BSD/MIT):** runtime dependencies, see ATTRIBUTION.md.
- **Built by HelloMavens (MIT):** scoring algorithm, evaluator pattern,
  OWASP/HIPAA/SOC 2/ISO 27001 mappings, types, tests, fetcher tooling.

## Exports

| Path                               | Contents                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| `@hellomavens/sbs-engine`          | `ENGINE_VERSION`, types, evaluators (currently just `evaluateAcs004`) |
| `@hellomavens/sbs-engine/controls` | The full normalized control library JSON (CC BY-SA 4.0)               |
| `@hellomavens/sbs-engine/types`    | TypeScript types only                                                 |

## License

- Code: [MIT](./LICENSE)
- `data/controls.json` (derived from SBS): CC BY-SA 4.0
- Required notices: [NOTICE](./NOTICE)
- Per-source attribution: [ATTRIBUTION.md](./ATTRIBUTION.md)

## Links

- Source repo: [github.com/Berrismi/sbs-audit-engine](https://github.com/Berrismi/sbs-audit-engine) (will move to `hellomavens` GitHub org)
- Hosted audit (consultant + questionnaire surfaces): hellomavens.com/audit (coming soon)
- Issues: [github.com/Berrismi/sbs-audit-engine/issues](https://github.com/Berrismi/sbs-audit-engine/issues)
