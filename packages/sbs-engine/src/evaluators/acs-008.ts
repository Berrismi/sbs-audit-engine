// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-008: Restrict Broad Privileges for Non-Human Identities.
//
// CLI evidence: scan-core supplies two SOQL queries that together identify
// non-human-identity (NHI) candidates carrying any of the 5 broad-privilege
// booleans (View All Data, Modify All Data, Manage Users, Author Apex,
// Customize Application).
//
//   - acs-007-nhi-inventory      — one row per NHI candidate (active user
//                                  on an API-Only profile with internal
//                                  UserType). Includes Profile.* broad-perm
//                                  booleans inline so profile-level grants
//                                  are surfaced without a second query.
//   - acs-008-nhi-broad-permset-grants — one row per (assignee, permission
//                                  set) pair where the NHI assignee has an
//                                  explicit (non-profile-owned) Permission
//                                  Set / Permission Set Group grant of any
//                                  broad-priv boolean.
//
// Either path can be present alone, both, or neither. The evaluator unions
// across both rows-sets per assignee — a single user with View All from
// the inventory's Profile.* and Modify All from a permset is counted once
// and the breakdown notes both grant pathways.
//
// Classification: cli_corroborating. SOQL surfaces the WHO and HOW; the
// questionnaire confirms whether each broad-priv NHI grant has a documented
// business justification (Q-ACS-008). Pass = 0 NHI candidates with any
// broad-priv exposure; ≥1 = inconclusive (deferring justification check
// to the questionnaire).
//
// (Authoring rule: no __c custom-field assumptions in SOQL.)

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-ACS-008';
const INVENTORY_QUERY_ID = 'acs-007-nhi-inventory';
const PERMSET_QUERY_ID = 'acs-008-nhi-broad-permset-grants';

const PASS_FINDING =
  'Respondent attests their non-human accounts are limited to only the permissions they actually need.';
const FAIL_FINDING =
  'Respondent attests their non-human accounts have broader permissions than they need. Over-privileged service accounts are a leading source of breach blast-radius.';

// The 5 broad-privilege booleans the audit_procedure flags. Order matches
// the sequence the audit_procedure lists them in.
const BROAD_PERM_FIELDS = [
  'PermissionsViewAllData',
  'PermissionsModifyAllData',
  'PermissionsManageUsers',
  'PermissionsAuthorApex',
  'PermissionsCustomizeApplication',
] as const;

const BROAD_PERM_LABELS: Record<(typeof BROAD_PERM_FIELDS)[number], string> = {
  PermissionsViewAllData: 'View All Data',
  PermissionsModifyAllData: 'Modify All Data',
  PermissionsManageUsers: 'Manage Users',
  PermissionsAuthorApex: 'Author Apex',
  PermissionsCustomizeApplication: 'Customize Application',
};

interface NhiBroadPrivExposure {
  username: string | undefined;
  /** Any of the 5 broad perms granted via this user's Profile. */
  profileGrants: Set<string>;
  /** Any of the 5 broad perms granted via an explicit permset/permset-group. */
  permsetGrants: Set<string>;
}

const baseAttestation = attestationEvaluator({
  questionId: QUESTION_ID,
  passFinding: PASS_FINDING,
  failFinding: FAIL_FINDING,
});

export const evaluate: Evaluator = (input) => {
  const { evidence } = input;

  const inventory = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === INVENTORY_QUERY_ID,
  );
  const permsetGrants = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === PERMSET_QUERY_ID,
  );

  if (inventory || permsetGrants) {
    const exposures = unionExposures(inventory?.rows ?? [], permsetGrants?.rows ?? []);
    return buildSoqlResult(exposures);
  }

  return baseAttestation(input);
};

/**
 * Union profile-level + permset-level broad-priv grants per NHI assignee.
 * The inventory query carries Profile.* booleans inline (one row per User);
 * the permset query carries PermissionSet.* booleans (one row per
 * assignment, possibly multiple per User). Returns only assignees with at
 * least one broad-priv exposure — assignees that have ZERO broad perms
 * across both pathways are filtered out (those are NHIs without
 * over-privilege, the desired state).
 */
function unionExposures(
  inventoryRows: ReadonlyArray<Record<string, unknown>>,
  permsetRows: ReadonlyArray<Record<string, unknown>>,
): NhiBroadPrivExposure[] {
  const perUser = new Map<string, NhiBroadPrivExposure>();

  for (const row of inventoryRows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const username = typeof row['Username'] === 'string' ? row['Username'] : undefined;
    const profile = isRecord(row['Profile']) ? row['Profile'] : undefined;
    const exposure = ensureExposure(perUser, id, username);
    if (profile) {
      for (const f of BROAD_PERM_FIELDS) {
        if (profile[f] === true) exposure.profileGrants.add(f);
      }
    }
  }

  for (const row of permsetRows) {
    const id = typeof row['AssigneeId'] === 'string' ? row['AssigneeId'] : null;
    if (!id) continue;
    const assignee = isRecord(row['Assignee']) ? row['Assignee'] : undefined;
    const username =
      assignee && typeof assignee['Username'] === 'string' ? assignee['Username'] : undefined;
    const ps = isRecord(row['PermissionSet']) ? row['PermissionSet'] : undefined;
    const exposure = ensureExposure(perUser, id, username);
    if (ps) {
      for (const f of BROAD_PERM_FIELDS) {
        if (ps[f] === true) exposure.permsetGrants.add(f);
      }
    }
  }

  const out: NhiBroadPrivExposure[] = [];
  for (const exposure of perUser.values()) {
    if (exposure.profileGrants.size > 0 || exposure.permsetGrants.size > 0) {
      out.push(exposure);
    }
  }
  return out;
}

function ensureExposure(
  m: Map<string, NhiBroadPrivExposure>,
  id: string,
  username: string | undefined,
): NhiBroadPrivExposure {
  const existing = m.get(id);
  if (existing) {
    if (existing.username === undefined && username !== undefined) {
      existing.username = username;
    }
    return existing;
  }
  const fresh: NhiBroadPrivExposure = {
    username,
    profileGrants: new Set(),
    permsetGrants: new Set(),
  };
  m.set(id, fresh);
  return fresh;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function buildSoqlResult(exposures: NhiBroadPrivExposure[]): EvaluatorResult {
  if (exposures.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No active non-human identity carries any of the 5 broad privileges (View All Data, Modify All Data, Manage Users, Author Apex, Customize Application) via Profile or Permission Set. NHI population is operating within least-privilege bounds on this dimension.',
      ],
    };
  }

  // Cap at 10 sampled usernames; summarize remainder as "+N more". Same
  // pacing as ACS-004 / ACS-007.
  const sample = exposures
    .map((e) => e.username)
    .filter((u): u is string => typeof u === 'string')
    .slice(0, 10);
  const moreCount = Math.max(0, exposures.length - sample.length);
  const sampleClause = sample.length
    ? ` Sample: ${sample.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`
    : '';

  const breakdown = formatPathwayBreakdown(exposures);

  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${exposures.length} non-human identity(ies) hold one or more broad privileges (${breakdown}).${sampleClause} ` +
        'SOQL confirms the WHO + WHICH-PATHWAY; documented business justification per assignment must be ' +
        'verified against the system of record (questionnaire Q-ACS-008).',
    ],
  };
}

/**
 * Build a "X via Profile, Y via Permission Set, Z via both" string. Only
 * non-zero buckets are included. The sum of the buckets always equals the
 * input length so the breakdown never understates the population.
 */
function formatPathwayBreakdown(exposures: NhiBroadPrivExposure[]): string {
  let profileOnly = 0;
  let permsetOnly = 0;
  let both = 0;
  for (const e of exposures) {
    const hasProfile = e.profileGrants.size > 0;
    const hasPermset = e.permsetGrants.size > 0;
    if (hasProfile && hasPermset) both++;
    else if (hasProfile) profileOnly++;
    else if (hasPermset) permsetOnly++;
  }
  const parts: string[] = [];
  if (profileOnly > 0) parts.push(`${profileOnly} via Profile`);
  if (permsetOnly > 0) parts.push(`${permsetOnly} via Permission Set`);
  if (both > 0) parts.push(`${both} via both Profile and Permission Set`);
  return parts.join(', ');
}

// Re-exported for tests that want to assert the audit_procedure perm list
// stays in sync with the evaluator's perm list. Not part of the public
// engine API.
export const _BROAD_PERM_LABELS = BROAD_PERM_LABELS;
