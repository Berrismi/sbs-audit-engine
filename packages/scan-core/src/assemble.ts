// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import type { Evidence, EvidenceBundle } from '@hellomavens/security-review-for-salesforce-engine';
import type { QueryResult } from './types';

export interface AssembleOptions {
  subjectId: string;
  queryResults: readonly QueryResult[];
  /** Injectable clock for deterministic testing. Defaults to `() => new Date()`. */
  now?: () => Date;
}

export function assembleEvidenceBundle(opts: AssembleOptions): EvidenceBundle {
  const now = opts.now ?? (() => new Date());
  const evidence: Evidence[] = opts.queryResults
    .filter((r): r is Extract<QueryResult, { kind: 'ok' }> => r.kind === 'ok')
    .map((r) => ({
      source: 'soql',
      query: r.query.soql,
      rows: r.rows,
    }));
  return {
    subject_id: opts.subjectId,
    collected_at: now().toISOString(),
    evidence,
  };
}
