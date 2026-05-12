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

**Phase 5 complete** — `0.0.0-alpha.48` on the `alpha` dist-tag.

Four evidence sources ship today, all wired through a single
`collectEvidence({ connection, ... })` entrypoint:

- **SOQL / Tooling API** — ~27 queries across 25 controls (ACS, AUTH,
  OAUTH, INT, CPORTAL, MON, DATA, DEP categories), with per-query error
  handling, applies-when predicates, and progress events
  (`run`/`ok`/`skipped`/`failed`).
- **Salesforce Health Check API** — pulls the org's HC score and risk
  groups via REST.
- **Salesforce Code Analyzer subprocess** — invokes `sf code-analyzer run`
  with the `Security` rule selector and parses findings into the bundle.
- **Metadata API read** — chunked `metadata.read()` in batches of 10
  (working around the 10-record cap) for SecuritySettings, ConnectedApp
  metadata, and other config that doesn't surface via SOQL.

Failed queries become `inconclusive` evidence the report viewer can flag
rather than aborting the bundle. Sources that don't apply to the org
(e.g., Communities-only queries on a non-Communities org) are skipped
cleanly via `appliesWhen` predicates.

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
