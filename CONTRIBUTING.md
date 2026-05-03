<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# Contributing to sbs-audit-engine

Thanks for your interest. A few things to know before you open a PR.

## Project shape

This repo is the **open source engine** for the HelloMavens Salesforce Security
Audit product. It implements the [Security Benchmark for Salesforce (SBS)](https://docs.securitybenchmark.org)
standard and ships:

- `packages/sbs-engine` — the scoring engine, control library, and evaluator
  functions.
- `packages/cli` — the consultant CLI (`@hellomavens/sbs-scan`) for running
  evidence-based scans against a real Salesforce org.

The branded report templates, hosted questionnaire UI, and remediation
playbooks are NOT in this repo; they live in the closed `HelloMavens-SbsAudit`
app and consume this engine as a dependency.

## Naming guidance (per SBS license)

When describing this project, use phrasing like "implements the Security
Benchmark for Salesforce" or "SBS-compatible scanner." Do not imply this is an
official SBS project — the SBS standard is authored by the SBS contributors,
not by us.

## Local development

Requires Node 24.15+ and pnpm 11+.

```sh
pnpm install
pnpm test          # runs all package tests
pnpm typecheck     # full workspace tsc --noEmit
pnpm lint          # eslint
pnpm format        # prettier --write
```

## Adding a new evaluator

Each SBS control gets one evaluator function in `packages/sbs-engine/src/evaluators/`.
The pattern is **test-first**:

1. Read the SBS control YAML (`packages/sbs-engine/data/controls.json`).
2. Write the test file at `packages/sbs-engine/tests/evaluators/{control-id}.test.ts`
   with at least four cases: pass, fail, na, inconclusive. Watch it fail.
3. Implement `packages/sbs-engine/src/evaluators/{control-id}.ts`. Watch it pass.
4. Verify coverage stays at the engine's 90% threshold.

See `packages/sbs-engine/src/evaluators/acs-004.ts` and its test for the
canonical pattern.

## Bumping the SBS pin

The SBS standard lives upstream at [github.com/Salesforce-Security-Benchmark/docs-site](https://github.com/Salesforce-Security-Benchmark/docs-site).
We pin to a specific tag in [`upstream-sources.toml`](./upstream-sources.toml).

To bump:

1. Update `[sbs] ref` in `upstream-sources.toml`.
2. Run `pnpm sync:sbs` to refetch the YAML and regenerate `controls.json`.
3. Diff the regenerated `controls.json`. Reconcile any field changes by hand
   if needed.
4. Update `ATTRIBUTION.md` if the upstream README or naming guidance changed.
5. Run the full test suite — integration tests should fail loudly if the
   shape of a control changed.
6. Open a PR titled `chore(sbs): bump to v{X.Y.Z}`.

The cron-driven `.github/workflows/upstream-sync.yml` opens this PR for you
when a new SBS tag drops.

## Bumping the Code Analyzer pin

Same shape:

1. Update `[code_analyzer] ref` in `upstream-sources.toml`.
2. Update the npm dep range in `packages/cli/package.json`.
3. Re-run integration tests against a real org if any rule output shape
   changed.
4. PR titled `chore(code-analyzer): bump to v{X.Y.Z}`.

## Conventional commits

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org).
The `commit-msg` git hook enforces this via commitlint. Allowed types:

```text
feat | fix | docs | chore | refactor | test | perf | ci | build | revert
```

## Quality gates

Local pre-commit runs lint-staged + gitleaks (if installed).
Local pre-push runs `pnpm typecheck && pnpm test`.
CI runs all of the above plus Semgrep, license-checker, REUSE-lint,
markdownlint, and actionlint as hard gates.

`--no-verify` is not allowed by default. If a hook fails for the wrong reason,
fix the hook, not the bypass.

## License

By contributing you agree that:

- Code contributions are licensed under MIT (this repo's primary license).
- Contributions to `packages/sbs-engine/data/controls.json` (derived from SBS)
  carry CC BY-SA 4.0 per ShareAlike.

See [`REUSE.toml`](./REUSE.toml) for the per-path license map.
