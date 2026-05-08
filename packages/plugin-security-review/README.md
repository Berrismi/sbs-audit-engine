<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# Salesforce Security Review

[![npm](https://img.shields.io/npm/v/%40hellomavens%2Fplugin-security-review?label=%40hellomavens%2Fplugin-security-review&color=informational)](https://www.npmjs.com/package/@hellomavens/plugin-security-review)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![Engine: CC BY-SA 4.0 content](https://img.shields.io/badge/engine%20content-CC%20BY--SA%204.0-orange.svg)](../sbs-engine/ATTRIBUTION.md)

A Salesforce CLI plugin that runs a comprehensive security review of any org
you have `sf` CLI access to. It scores 54 controls from the
[Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site)
(SBS) using a mix of read-only Salesforce APIs (SOQL, Health Check, Limits,
Metadata) and a short operator questionnaire — then emits a local
machine-readable bundle plus Markdown / HTML reports.

**Local-first.** No network calls beyond `sf` itself. No upload by default.
No accounts, no logins, no email collection. Anyone with `sf` authed to an
org can run it.

## Install

```sh
# Install the Salesforce CLI if you haven't already:
# https://developer.salesforce.com/tools/salesforcecli

sf plugins install @hellomavens/plugin-security-review
```

## Quick start

```sh
# 1. Make sure your target org is authed:
sf org login web --alias my-org

# 2. Run the review:
sf security review run --target-org my-org

# 3. Open the report:
open ./report.html      # macOS
xdg-open ./report.html  # Linux
start ./report.html     # Windows
```

You'll be prompted to answer a short questionnaire (the questions a CLI
can't auto-detect — written policies, governance practices, manual
reviews) before the scan starts. Your answers are saved locally so you can
re-run non-interactively next time.

## What you get

Four files written to `--output-dir` (default: current working directory):

| File            | Format              | Use                                                 |
| --------------- | ------------------- | --------------------------------------------------- |
| `report.html`   | Self-contained HTML | Open in a browser; print to PDF for sharing         |
| `report.md`     | CommonMark          | Read in any editor; pipe to pandoc for .docx / .pdf |
| `report.json`   | Scored report       | Programmatic consumption (CI gates, dashboards)     |
| `findings.json` | Raw evidence bundle | Audit trail; the input the score was derived from   |

The report includes:

- **Overall score (0-100) + risk grade (A/B/C/D/F).** Critical-tier fails
  cap the grade at C regardless of category aggregates.
- **Per-category breakdown** for each of the 12 SBS categories (Access
  Control, Authentication, Data Protection, etc.).
- **Per-control verdicts** with status (pass / fail / inconclusive / N/A),
  evidence used (SOQL / Health Check / Metadata / questionnaire), and
  human-readable findings text.
- **Evidence-sufficiency banner** that flags when too many controls
  returned inconclusive for the headline grade to be meaningful.

## Usage

### Interactive (default)

```sh
sf security review run --target-org my-org --output-dir ./reports/2026-q2
```

Walks you through the operator questionnaire, then runs the scan. Answers
are saved at `~/.config/hellomavens/questionnaire/<alias>-<timestamp>.yml`
and the path is printed at the end so you can replay the same answers
non-interactively next time.

### Non-interactive (CI / scripts)

```sh
# Use a saved answer file:
sf security review run --target-org my-org \
  --questionnaire ~/.config/hellomavens/questionnaire/my-org-2026-05-08.yml

# Or skip the questionnaire entirely (CLI evidence only — controls that
# need operator input will be reported as inconclusive):
sf security review run --target-org my-org --no-questionnaire
```

### Optional: include Salesforce Code Analyzer

```sh
sf security review run --target-org my-org --include-code-analyzer
```

This adds a Code Analyzer subprocess pass over your retrieved Apex / LWC,
catching SOQL-injection / FLS-bypass / IDOR-style patterns. Adds 1-5
minutes to the scan and produces a few additional findings in the CODE
and CPORTAL categories.

### Bug reports: enable `--debug`

```sh
sf security review run --target-org my-org --debug
```

Writes a JSON-lines diagnostic log to `<output-dir>/.hm-debug.log`. **PII
guarantees:** the log records aggregate counts, query IDs, durations, and
flag presence — never row data, credentials, alias values, or anything
queryable from your org. Safe to attach to a GitHub issue alongside
`report.json`.

## Flags

| Flag                       | Default       | Notes                                        |
| -------------------------- | ------------- | -------------------------------------------- |
| `--target-org <alias>`     | (required)    | Pass any org `sf` can authenticate to        |
| `--output-dir <path>`      | `.`           | Created if missing                           |
| `--questionnaire <path>`   | (TTY: prompt) | YAML answer file from a previous run         |
| `--no-questionnaire`       | `false`       | Skip questionnaire entirely                  |
| `--include-code-analyzer`  | `false`       | Adds 1-5 min, broader CODE coverage          |
| `--debug`                  | `false`       | Writes `.hm-debug.log` (PII-free aggregates) |
| `--upload` / `--no-upload` | auto          | HelloMavens consultant flag — see below      |

## How it works

The plugin orchestrates four moving pieces:

1. **Preflight** — verifies `sf` is installed, your target-org is authed,
   and you have the `ApiEnabled` / `ViewSetup` / `ViewAllData` permissions
   the scan needs. No data is touched.
2. **Questionnaire** — short multiple-choice + yes/no questions about
   policies and processes that a CLI can't auto-detect. Answers map to
   evidence the scoring engine consumes.
3. **Evidence collection** — runs ~30 read-only SOQL queries plus
   Salesforce Health Check, Limits REST, and Metadata API calls. Optional
   Salesforce Code Analyzer pass. All queries scoped to setup / metadata
   objects; no rows from your business data are read.
4. **Scoring** — the open-source
   [`@hellomavens/security-review-for-salesforce-engine`](../sbs-engine)
   reads the merged evidence bundle and produces verdicts per control,
   per category, and overall. Pure function of the bundle — same input,
   same report.

## Privacy and security

- **No data leaves your machine** unless you explicitly `--upload` (see
  below). The default flow is fully local.
- **Read-only.** Every API call the scan makes is read-only. No mutations,
  no reconfigurations, no installs.
- **No row data in the report.** `findings.json` contains setup metadata
  (permission set names, Health Check rule IDs, etc.) but not your
  business records.
- **Configurable PII surface.** Permission set member counts and audit
  trail entries appear in the bundle by design — that's how the controls
  are scored. If your org defines that as PII, scrub `findings.json`
  before sharing.

## For HelloMavens consultants

If you've previously run `sf security review login` and stored a
consultant API key, `sf security review run` will also upload the bundle
to the HelloMavens scoring backend and return a branded report URL — no
flag needed. To force local-only even when credentials exist, pass
`--no-upload`. To force upload (and error if creds are missing), pass
`--upload --client-email <client>`.

OSS users without a consultant key never see this path.

## Comparison with audit.hellomavens.com

The HelloMavens audit web app at [audit.hellomavens.com](https://audit.hellomavens.com)
runs the same scoring engine against the same questionnaire registry.
What it adds:

- A guided web form with branded reports + persistent storage.
- HelloMavens consulting follow-up if you want help interpreting the
  results or remediating findings.

The OSS plugin is for operators who want to self-audit, integrate with
CI, or simply prefer staying on their own machine. Same controls, same
math, same SBS pin.

## Versioning

This plugin tracks the
[`@hellomavens/security-review-for-salesforce-engine`](../sbs-engine)
release series. The `<engine version>` is recorded in every report's
footer, so reports remain reproducible against a specific engine pin.

## Development

```sh
pnpm install
pnpm build       # tsc -p tsconfig.build.json + extension fixup
pnpm test        # vitest, ~120 tests
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings=0
```

To test locally against your own `sf` install:

```sh
sf plugins link packages/plugin-security-review
```

`scripts/gen-random-answers.mjs` produces a valid random answer YAML
against the bundled registry for non-interactive smoke tests.

## Sources & attribution

This plugin scores controls drawn from the
[Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Per the ShareAlike clause, derivatives that incorporate SBS control text
inherit the same license — every report this plugin emits carries that
attribution in its footer.

The plugin code, the scoring engine, and the evaluator framework are
authored by HelloMavens LLC and licensed under MIT. See [`LICENSE`](../../LICENSE),
[`ATTRIBUTION.md`](../../ATTRIBUTION.md), and [`NOTICE`](../../NOTICE) at the
repo root for the full breakdown.

## Reporting issues

Bug reports + feature requests welcome at
[github.com/Berrismi/sbs-audit-engine/issues](https://github.com/Berrismi/sbs-audit-engine/issues).
Please include the output of `sf security review run --debug` when filing
something scan-related — the resulting `.hm-debug.log` is PII-free by
design.
