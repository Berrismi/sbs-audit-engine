<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# sbs-audit-engine

> Open source scoring engine and consultant CLI implementing the [Security
> Benchmark for Salesforce (SBS)](https://docs.securitybenchmark.org)
> standard, with enrichments from Salesforce Code Analyzer, OWASP Top 10,
> HIPAA / SOC 2 / ISO 27001 mappings, and a HelloMavens-developed evaluator
> framework and scoring algorithm.

[![CI](https://github.com/hellomavens/sbs-audit-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/hellomavens/sbs-audit-engine/actions/workflows/ci.yml)
[![REUSE compliant](https://api.reuse.software/badge/github.com/hellomavens/sbs-audit-engine)](https://api.reuse.software/info/github.com/hellomavens/sbs-audit-engine)

## What this is

Two packages, one engine:

- **`@hellomavens/sbs-engine`** — typed scoring engine, control library, and
  evaluator framework. Pure TypeScript, no Salesforce dependencies, fully
  testable.
- **`@hellomavens/sbs-scan`** — consultant CLI that runs evidence-based scans
  against a real Salesforce org and produces a scored audit bundle.

The branded report templates, hosted questionnaire UI, and HelloMavens
remediation playbooks are NOT in this repo. They live in the closed
`HelloMavens-SbsAudit` app and consume this engine as a dependency. If you
want the hosted, consultant-friendly version of this product, visit
[hellomavens.com/audit](https://hellomavens.com/) (link goes live with launch).

## What HelloMavens added

To be transparent about what is built vs. borrowed:

- **Borrowed (CC BY-SA 4.0):** the 54 control definitions from the
  [Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site).
  We pin to a specific upstream version (currently v0.4.1) and re-publish a
  normalized `controls.json` derivative under the same CC BY-SA 4.0 license.
- **Borrowed (BSD-3-Clause):** [Salesforce Code Analyzer](https://github.com/forcedotcom/code-analyzer)
  for evidence collection (PMD, ESLint, Flow, RetireJS, SFGE, Regex engines
  bundled).
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

**Phase 1 of the build plan.** What's running today:

- Workspace scaffolding (pnpm workspaces, Node 24.15 LTS, TypeScript strict).
- Quality gates wired up (Husky, lint-staged, commitlint, gitleaks, ESLint,
  Prettier, Vitest with coverage thresholds, Semgrep, REUSE-lint, license-
  checker, markdownlint, actionlint, Dependabot).
- Reference evaluator for SBS-ACS-004 (test-first per TDD) — established the
  pattern for the other 53 evaluators landing in Phase 3.
- `sync-sbs.ts` fetcher script that pulls control YAML from the pinned SBS
  upstream tag.
- CI green on all gates.

What's stubbed:

- The other 53 evaluators (Phase 3).
- The CLI (Phase 5; current `sbs-scan` binary prints a help message pointing
  to the build plan).
- The custom HelloMavens PMD ruleset (placeholder file +
  `rulesets/TODO.md` describe how to swap in a real ruleset later).

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
