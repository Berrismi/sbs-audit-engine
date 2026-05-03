<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# Attribution

`sbs-audit-engine` builds on open source standards and tooling that we did not
author. This document credits each upstream and tracks the version we pin to.
The current pinned versions are also machine-readable in [`upstream-sources.toml`](./upstream-sources.toml).

## Standards we implement

### Security Benchmark for Salesforce (SBS)

- **Source:** [github.com/Salesforce-Security-Benchmark/docs-site](https://github.com/Salesforce-Security-Benchmark/docs-site)
- **License:** [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)
- **Pinned version:** v0.4.1
- **What we use:** the 54 control definitions in `control-metadata/SBS-*.yaml`,
  normalized into [`packages/sbs-engine/data/controls.json`](./packages/sbs-engine/data/controls.json).
- **Per the ShareAlike clause:** our derived `controls.json` is itself licensed
  under CC BY-SA 4.0. See [`REUSE.toml`](./REUSE.toml).
- **Naming:** per SBS license naming guidance, this project uses the phrasing
  "implements the Security Benchmark for Salesforce" — we do not claim to be
  an official SBS project.

## Tools we incorporate

### Salesforce Code Analyzer

- **Source:** [github.com/forcedotcom/code-analyzer](https://github.com/forcedotcom/code-analyzer)
- **License:** BSD-3-Clause
- **Pinned version:** v5.12.0
- **What we use:** the umbrella tool, invoked as a child process by our CLI to
  run multiple engines against a target Salesforce org. Code Analyzer bundles
  the following engines internally; each is transitively credited via Code
  Analyzer's own attribution:
  - **PMD** (BSD-style) — Apex + JS rule engine. Source: [github.com/pmd/pmd](https://github.com/pmd/pmd).
  - **ESLint** (MIT) — JS/TS rule engine.
  - **Flow Engine** — Salesforce Flow analysis.
  - **RetireJS** (Apache-2.0) — vulnerable JS dependency detection.
  - **SFGE** (Salesforce Graph Engine) — Apex CRUD/FLS data-flow analysis.
  - **Regex Engine** — custom regex-based rules.

## Frameworks and libraries

A full list of npm dependencies and their licenses is generated and verified in
CI by `license-checker`. See the latest CI run for the current dependency tree.

## What HelloMavens added

To be clear about what is _our_ contribution on top of the above:

- The scoring algorithm in `packages/sbs-engine/src/score.ts` (weighted by risk
  tier with a critical-fail-caps-at-C rule).
- The evaluator pattern in `packages/sbs-engine/src/evaluators/` that maps a
  control + evidence input to `{status, findings, confidence}`.
- The OWASP Top 10 2021, HIPAA Security Rule, SOC 2 Trust Services Criteria,
  ISO 27001:2022 Annex A, GDPR, and CCPA mappings layered onto each control in
  [`packages/sbs-engine/data/control-enrichments.json`](./packages/sbs-engine/data/control-enrichments.json).
  The editorial reasoning per category is in
  [`control-enrichments.RATIONALE.md`](./packages/sbs-engine/data/control-enrichments.RATIONALE.md).
  These mappings are derived from authoritative sources cited in the
  enrichments file's `sources` field; the cross-walk itself is HelloMavens
  editorial work and is MIT-licensed.
- Editorial overrides for SBS controls whose upstream YAML is missing a
  required field, captured in
  [`packages/sbs-engine/data/control-overrides.json`](./packages/sbs-engine/data/control-overrides.json).
  Currently overrides `SBS-AUTH-004` (upstream YAML omits `risk_level`; we
  pin to `Critical` based on the control's narrative).
- The questionnaire question text, "I don't know" inconclusive handling, and
  skip logic.
- The CLI orchestration (Salesforce auth, SOQL bundle, evidence-bundle
  assembly, upload to backend).
- All scaffolding, types, and tests.

These contributions are MIT-licensed.

## Updating attribution

When we bump a pinned version in `upstream-sources.toml`, this file should be
updated in the same PR. CI's REUSE-lint and license-checker steps will catch
any new dependencies whose licensing isn't yet documented here.
