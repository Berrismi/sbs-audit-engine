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

[![CI](https://github.com/Berrismi/sbs-audit-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Berrismi/sbs-audit-engine/actions/workflows/ci.yml)
[![REUSE compliant](https://api.reuse.software/badge/github.com/Berrismi/sbs-audit-engine)](https://api.reuse.software/info/github.com/Berrismi/sbs-audit-engine)

## What this is

Two npm packages today, three on the roadmap, one repo:

- **`@hellomavens/security-review-for-salesforce-engine`** — typed scoring
  engine, control library, and evaluator framework. Pure TypeScript, no
  Salesforce dependencies, fully testable. _(Renamed from
  `@hellomavens/sbs-engine` at `0.0.0-alpha.5` — see Migration below.)_
- **`@hellomavens/security-review-for-salesforce-scan-core`** _(Phase 5)_ —
  side-effecting evidence collector. Takes a Salesforce `Connection` +
  options, returns an `EvidenceBundle` (SOQL bundle, Health Check API,
  Code Analyzer subprocess output).
- **`@hellomavens/plugin-security-review`** _(Phase 5)_ — Salesforce CLI
  plugin shell. Installed via `sf plugins install`, invoked as
  `sf security review run --target-org <alias>`. Thin shell over the two
  packages above.

The branded report templates, hosted questionnaire UI, and HelloMavens
remediation playbooks are NOT in this repo. They live in the closed
`HelloMavens-SbsAudit` app and consume the engine as a dependency. If you
want the hosted, consultant-friendly version of this product, visit
[hellomavens.com/audit](https://hellomavens.com/) (link goes live with launch).

## Migration from `@hellomavens/sbs-engine`

Versions `0.0.0-alpha.0` through `0.0.0-alpha.4` were published under
`@hellomavens/sbs-engine`. Starting `0.0.0-alpha.5`, the package is published
as `@hellomavens/security-review-for-salesforce-engine` to honor the
[SBS naming guidance](https://github.com/Salesforce-Security-Benchmark/docs-site/blob/main/LICENSE.md)
that derivative works should not echo the `<vendor> SBS` shape.

To migrate:

```diff
 // package.json
 {
   "dependencies": {
-    "@hellomavens/sbs-engine": "0.0.0-alpha.4"
+    "@hellomavens/security-review-for-salesforce-engine": "0.0.0-alpha.5"
   }
 }
```

```diff
 // your code
-import { score, type EvidenceBundle } from '@hellomavens/sbs-engine';
-import controls from '@hellomavens/sbs-engine/controls';
+import { score, type EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
+import controls from '@hellomavens/security-review-for-salesforce-engine/controls';
```

The exported API is identical — only the package name changed. If the long
name is awkward in import lines, consider a TypeScript path alias in your
`tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@engine/*": ["./node_modules/@hellomavens/security-review-for-salesforce-engine/*"]
    }
  }
}
```

The old package has been deprecated on npm. New work should not depend on
`@hellomavens/sbs-engine`.

## What HelloMavens added

To be transparent about what is built vs. borrowed:

- **Borrowed (CC BY-SA 4.0):** the 54 control definitions from the
  [Security Benchmark for Salesforce](https://github.com/Salesforce-Security-Benchmark/docs-site).
  We pin to a specific upstream version (currently v0.4.1) and re-publish a
  normalized `controls.json` derivative under the same CC BY-SA 4.0 license.
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

**Phases 1–4 + 4.5 polish complete.** Phase 5 (consultant CLI) is in flight.

The currently published engine is
`@hellomavens/security-review-for-salesforce-engine@0.0.0-alpha.5` under the
`alpha` dist-tag. (`@hellomavens/sbs-engine@<=0.0.0-alpha.4` is deprecated;
see Migration above.)

What's shipping today:

- All 42 control evaluators (questionnaire-evidence path), each backed by
  ≥4 unit tests covering pass/fail/idk/no-evidence.
- `score(EvidenceBundle): ScoredReport` top-level entrypoint with category
  - overall scoring per spec §8 (weighted by each category's Critical+High
    control share) and risk grade A–F with the critical-fail-caps-at-C rule.
- Three integration fixtures (perfect-org, disaster-org, mixed-with-idk)
  proving the math end-to-end. 260 tests total.
- OWASP Top 10 2021 + HIPAA Security Rule + SOC 2 TSC + ISO 27001:2022
  Annex A + GDPR + CCPA mappings on every control via
  `data/control-enrichments.json` (HelloMavens-authored, MIT, with per-
  category rationale in `control-enrichments.RATIONALE.md`).
- HelloMavens-authored editorial overrides for upstream YAML gaps
  (`data/control-overrides.json` — currently pins SBS-AUTH-004 to Critical).
- Workspace scaffolding (pnpm workspaces, Node 24.15 LTS, TypeScript strict).
- Quality gates verified green in CI (Husky, lint-staged, commitlint,
  gitleaks, ESLint, Prettier, Vitest with coverage thresholds, Semgrep,
  REUSE-lint, license-checker, markdownlint, actionlint, Dependabot).
- `main` branch is protected: PRs required, all status checks must pass,
  branches must be up to date, no force-push, no deletion, conversations
  must resolve.
- `sync-sbs.ts` fetcher pulls the 42 control YAMLs from the pinned SBS
  upstream tag (v0.4.1), merges in HM overrides + enrichments, and
  normalizes them into `controls.json`. Cron-driven `upstream-sync.yml`
  reports drift weekly.

What's stubbed or in flight:

- SOQL / Code Analyzer / Health Check evidence paths in individual
  evaluators (Phase 5 with the consultant CLI — in flight).
- The CLI shell itself (Phase 5 — was previously the
  `@hellomavens/sbs-scan` stub at `packages/cli/`; that stub has been
  removed and `packages/plugin-security-review/` will replace it).
- The custom HelloMavens PMD ruleset (placeholder + `rulesets/TODO.md`
  documents how to swap one in later via Salesforce Code Analyzer).
- Note: 42 controls today, not 54. Spec assumed SBS 1.0; current upstream
  is v0.4.1. Count grows as SBS approaches 1.0.

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
