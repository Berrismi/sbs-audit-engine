<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# PMD Apex Ruleset — TODO

HelloMavens does not yet ship a custom PMD Apex ruleset. This directory is a
stub so the rest of the system has a stable path to point at when the ruleset
lands.

## When to author this

When HelloMavens has enough Apex security findings across client engagements to
generalize patterns into custom rules. Until then, the default PMD security
ruleset (bundled inside Salesforce Code Analyzer) is sufficient.

## How to drop one in (no code changes elsewhere required)

1. Author the ruleset XML and save it as `pmd-apex-ruleset.xml` in this
   directory (drop the `.example` suffix).
2. Map each new rule to the relevant SBS control(s) in `controls.json` under
   `hellomavens_enrichments.code_analyzer_rules` (field added in Phase 3
   when scan evaluators land).
3. Update `packages/cli/src/...` to pass the ruleset to Code Analyzer:

   ```sh
   sf code-analyzer run \
     --rule-selector pmd \
     --custom-pmd-config <abs-path-to>/pmd-apex-ruleset.xml \
     --target <retrieved-source-dir>
   ```

4. Add unit tests in `packages/sbs-engine/tests/evaluators/` for any new
   evaluators that consume PMD findings.
5. Update `ATTRIBUTION.md` (no new upstream — PMD is already credited via
   Code Analyzer's bundled engine).

## Why this lives in this repo (and not the closed app)

The ruleset is OSS-friendly content (XML config, not HelloMavens IP about
client orgs). Shipping it next to the engine lets community contributors
propose new rules via PR.
