<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# sbs-audit-engine

> Open source scoring engine and self-service Salesforce CLI implementing
> the [Security Benchmark for Salesforce (SBS)](https://docs.securitybenchmark.org)
> standard, with enrichments from Salesforce Code Analyzer, OWASP Top 10,
> HIPAA / SOC 2 / ISO 27001 mappings, and a HelloMavens-developed evaluator
> framework and scoring algorithm.

[![CI](https://github.com/Berrismi/sbs-audit-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Berrismi/sbs-audit-engine/actions/workflows/ci.yml)
[![REUSE compliant](https://api.reuse.software/badge/github.com/Berrismi/sbs-audit-engine)](https://api.reuse.software/info/github.com/Berrismi/sbs-audit-engine)

## Status — who this is for today

This repo ships a **fully self-service Salesforce security audit CLI**.
Anyone can install it, point it at a Salesforce org they have access to,
and produce a local report — no HelloMavens API key, no upload, no
hosted service required.

```sh
# Install the Salesforce CLI plugin
sf plugins install @hellomavens/plugin-security-review

# Run a local scan against any org you've authenticated
sf security review run --target-org <alias>

# Outputs land in ./security-review/<run-id>/:
#   report.json   machine-readable findings
#   report.md     terminal-friendly summary
#   report.html   shareable single-file report
```

The optional `sf security review login` + `upload` flow is a side-channel
for HelloMavens consultants who want to push results to the [hosted
scoring service at audit.hellomavens.com](https://audit.hellomavens.com).
It's strictly opt-in — the local `run` command produces a complete report
on its own and never contacts a HelloMavens server unless you explicitly
ask it to.

If you'd rather skip the CLI entirely, the [scoring engine
package](./packages/sbs-engine) is installable on its own: pass it your
own `EvidenceBundle` and call `score()`.

## What this is

Three npm packages, all published at `0.0.0-alpha.47` on the `alpha` dist-tag:

- **`@hellomavens/security-review-for-salesforce-engine`** — typed scoring
  engine, control library, and evaluator framework. Pure TypeScript, no
  Salesforce dependencies, fully testable.
- **`@hellomavens/security-review-for-salesforce-scan-core`** —
  side-effecting evidence collector. Takes a Salesforce `Connection` +
  options, returns an `EvidenceBundle` (SOQL/Tooling, Health Check API,
  Code Analyzer subprocess, Metadata API).
- **`@hellomavens/plugin-security-review`** — Salesforce CLI plugin.
  Installed via `sf plugins install`, invoked as
  `sf security review run --target-org <alias>`. Local-first by default —
  emits `report.json`, `report.md`, and `report.html` to disk. An optional
  `upload` subcommand can push results to HelloMavens' hosted scoring service.

The branded PDF templates, hosted questionnaire UI, and HelloMavens
remediation playbooks are NOT in this repo. They live in the closed
`HelloMavens-SbsAudit` app and consume the engine as a dependency. If you
want the hosted, consultant-supported version of this product, visit
[audit.hellomavens.com](https://audit.hellomavens.com).

## What HelloMavens added

To be transparent about what is built vs. borrowed:

- **Borrowed (CC BY-SA 4.0):** the 54 control definitions from the
  [Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site).
  We pin to a specific upstream commit (currently `main` @ `d4304e1`,
  ahead of latest tagged release `v0.4.1` which carried 42 controls) and
  re-publish a normalized `controls.json` derivative under the same
  CC BY-SA 4.0 license.
- **Borrowed (BSD-3-Clause):** [Salesforce Code Analyzer](https://github.com/forcedotcom/code-analyzer)
  for evidence collection (PMD, ESLint, Flow, RetireJS, SFGE, Regex engines
  bundled). Used in Phase 5 as a child process; not redistributed.
- **Built by HelloMavens (MIT):** the scoring algorithm (weighted by risk
  tier, critical-fail caps grade at C), the evaluator pattern, OWASP +
  regulation mappings beyond what SBS provides, the questionnaire question
  text and skip logic, the CLI orchestration, and all scaffolding/tests.

Per SBS license naming guidance, this is an SBS-compatible scanner — it is
not endorsed by or affiliated with the SBS standard authors.

See [`ATTRIBUTION.md`](./ATTRIBUTION.md) for the full per-source breakdown
and [`upstream-sources.toml`](./upstream-sources.toml) for the machine-
readable pin manifest.

## Status

**Phases 1–5 complete.** Phase 6 polish (sample reports, expanded docs,
custom HelloMavens PMD ruleset) in progress.

The currently published engine, scan-core, and plugin are all at
`0.0.0-alpha.47` under the `alpha` dist-tag.

What's shipping today:

- All 54 control evaluators (questionnaire-evidence path), each backed by
  ≥4 unit tests covering pass/fail/idk/no-evidence.
- `score(EvidenceBundle): ScoredReport` top-level entrypoint with category
  - overall scoring per spec §8 (weighted by each category's Critical+High
    control share) and risk grade A–F with the critical-fail-caps-at-C rule.
- Three integration fixtures (perfect-org, disaster-org, mixed-with-idk)
  proving the math end-to-end. 350+ tests total.
- OWASP Top 10 2021 + HIPAA Security Rule + SOC 2 TSC + ISO 27001:2022
  Annex A + GDPR + CCPA mappings on every control via
  `data/control-enrichments.json` (HelloMavens-authored, MIT, with per-
  category rationale in `control-enrichments.RATIONALE.md`).
- HelloMavens-authored editorial overrides for upstream YAML gaps
  (`data/control-overrides.json` — currently empty; SBS-AUTH-004's
  Critical risk_level is now sourced from the upstream markdown badge
  via the parser's badge fallback).
- Workspace scaffolding (pnpm workspaces, Node 24.15 LTS, TypeScript strict).
- Quality gates verified green in CI (Husky, lint-staged, commitlint,
  gitleaks, ESLint, Prettier, Vitest with coverage thresholds, Semgrep,
  REUSE-lint, license-checker, markdownlint, actionlint, Dependabot).
- `main` branch is protected: PRs required, all status checks must pass,
  branches must be up to date, no force-push, no deletion, conversations
  must resolve.
- `sync-sbs.ts` fetcher pulls the 54 control YAMLs from the pinned SBS
  upstream commit (`main` @ `d4304e1`), merges in HM overrides +
  enrichments, and normalizes them into `controls.json`. Cron-driven
  `upstream-sync.yml` reports drift weekly.

What's also shipped (Phase 5):

- `@hellomavens/security-review-for-salesforce-scan-core` — side-effecting
  evidence collector with SOQL/Tooling, Health Check API, Code Analyzer
  subprocess, and Metadata API sources. ~27 SOQL queries across 25
  controls, plus per-query error handling and applies-when predicates.
- `@hellomavens/plugin-security-review` — Salesforce CLI plugin.
  Local-first `run` command emits `report.json`, `report.md`, and
  `report.html` to disk; optional `upload` subcommand for HelloMavens'
  hosted scoring service.
- 33 of 54 controls are CLI-verified end-to-end (cli_primary +
  cli_corroborating); the remaining 21 are questionnaire-only and ship
  with the same evaluator coverage.

What's stubbed or in flight:

- The custom HelloMavens PMD ruleset for Code Analyzer (placeholder +
  [`packages/sbs-engine/rulesets/TODO.md`](./packages/sbs-engine/rulesets/TODO.md)
  documents how to swap one in later). Today the plugin runs Code
  Analyzer's stock `Security` selector.
- Re-pin to a tagged SBS release once upstream publishes v0.5.0 / v1.0.
  Current pin (`main` @ `d4304e1`) carries 54 controls vs. 42 in
  v0.4.1 — see [Standard implemented](#what-hellomavens-added) below.

## Local development

Requires Node 24.15+ and pnpm 11+.

```sh
pnpm install
pnpm test          # run all package tests
pnpm test:coverage # with coverage report
pnpm typecheck
pnpm lint
pnpm format        # prettier --write
pnpm sync:sbs      # refetch upstream SBS YAML and regenerate controls.json
```

Pre-commit hooks run lint-staged + gitleaks (if installed). Pre-push hooks
run typecheck + tests. CI enforces the rest.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for evaluator-authoring patterns,
the upstream-bump process, and naming guidance.

## License

- Code: MIT (see [`LICENSE`](./LICENSE))
- Derived control data (`packages/sbs-engine/data/controls.json`):
  CC BY-SA 4.0 (per ShareAlike from the SBS standard)
- Per-path license map: [`REUSE.toml`](./REUSE.toml)
- Required notices: [`NOTICE`](./NOTICE)
