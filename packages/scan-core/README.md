<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# @hellomavens/security-review-for-salesforce-scan-core

> Side-effecting evidence collector for the HelloMavens security review.
> Takes a Salesforce `Connection` + options, returns an `EvidenceBundle`
> the [`@hellomavens/security-review-for-salesforce-engine`](../sbs-engine)
> can score.

## Status

**Phase 5, Block B** — initial skeleton ships:

- Public `collectEvidence({ connection, ... })` entrypoint
- SOQL executor with per-query error handling (org missing feature, query
  timeout, invalid SObject)
- Per-query progress events (run, ok, skipped, failed)
- EvidenceBundle assembler that maps SOQL results to engine `Evidence`
  variants
- An initial query bundle of 4–5 representative queries (one per category)
  proving the pattern; the full ~20-query bundle lands in Block B.1

What ships in later blocks:

- Block B.1: remaining ACS / OAUTH / INT / CPORTAL queries (~15 more)
- Block C: Salesforce Health Check API integration
- Block D: Salesforce Code Analyzer subprocess wiring (`sf code-analyzer run`)
- Block E: per-evaluator extensions in the engine consume the new evidence
  variants

## Public API (current)

```ts
import { collectEvidence } from '@hellomavens/security-review-for-salesforce-scan-core';

const bundle = await collectEvidence({
  connection, // a @salesforce/core Connection (structurally)
  subjectId: 'audit-id-123',
  onlySources: ['soql'], // optional; defaults to all available
  onProgress: (event) => console.log(event),
});
// bundle is an EvidenceBundle ready for engine.score(bundle)
```

The `connection` parameter is typed as a structural `ConnectionLike` interface
so tests can supply a fake without pulling in `@salesforce/core`.

## Design notes

- **Per-query error handling**: each query is wrapped in a try/catch; failure
  emits a `failed` progress event but doesn't abort the bundle. Failed
  queries become `inconclusive` evidence the report viewer can flag.
- **Applies-when predicates**: queries that depend on a feature (e.g.,
  Communities for CPORTAL queries) carry an `appliesWhen` predicate; if it
  returns false, the query is skipped (`na`, not `inconclusive`).
- **No subprocess in the executor**: the executor only talks to the
  Connection. Subprocess work (Code Analyzer) lives in
  `src/code-analyzer/` (Block D); HTTP work (Health Check API) lives in
  `src/health-check/` (Block C). Each source is independently testable.

## License

MIT. See repo-root [`LICENSE`](../../LICENSE) and [`ATTRIBUTION.md`](../../ATTRIBUTION.md).
