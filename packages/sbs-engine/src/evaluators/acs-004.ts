// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004: Documented Justification for All Super Admin–Equivalent Users.
//
// CLI evidence: scan-core supplies two SOQL queries that together enumerate
// the active super-admin-equivalent population. They're split because the
// original combined query hit SOQL's 2-semi-join cap on DE.
//
//   - acs-004-super-admin-via-permsets — one row per
//     (assignee, permission_set) pair where the set carries any of the 3
//     super-admin perms (View All Data / Modify All Data / Manage Users).
//     Multiple rows per assignee are unioned to determine if all 3 perms
//     are covered. This catches cross-permset composition (a user with
//     ViewAll from set X + Modify from set Y) which a single-set semi-join
//     would silently miss.
//   - acs-004-super-admin-via-profile — one row per active user whose
//     Profile directly grants all 3 perms. Catches System Administrator and
//     any custom profile cloned from it.
//
// Either path can be present alone, both, or neither. Users that appear in
// both paths are deduped. When neither path is present, the evaluator falls
// back to questionnaire attestation (low confidence).
//
// SOQL inventory size is the WHO. The "is each user's super-admin grant
// documented + justified?" check stays in the questionnaire (Q-ACS-004).
// (Authoring rule: no __c custom-field assumptions in SOQL.)

import { attestationEvaluator } from './_attestation';
import type { Evaluator, Evidence, EvaluatorResult } from '../types';

const QUESTION_ID = 'Q-ACS-004';
const PERMSET_QUERY_ID = 'acs-004-super-admin-via-permsets';
const PROFILE_QUERY_ID = 'acs-004-super-admin-via-profile';

const PASS_FINDING =
  'Respondent attests that all super-admin-equivalent users have documented justification.';
const FAIL_FINDING =
  'Respondent attests they do NOT have documented justification for super-admin-equivalent users.';

interface SuperAdminUser {
  id: string;
  username: string | undefined;
}

/**
 * Walk permset rows, union perms per assignee, return the assignees whose
 * union covers all three super-admin perms. Tolerates rows with missing or
 * non-object PermissionSet / Assignee shapes — those rows just don't
 * contribute. Never throws.
 */
function qualifyingUsersFromPermsetRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): SuperAdminUser[] {
  const perUser = new Map<
    string,
    { username: string | undefined; viewAll: boolean; modifyAll: boolean; manageUsers: boolean }
  >();

  for (const row of rows) {
    const assigneeId = typeof row['AssigneeId'] === 'string' ? row['AssigneeId'] : null;
    if (!assigneeId) continue;

    const assignee = isRecord(row['Assignee']) ? row['Assignee'] : undefined;
    const username =
      assignee && typeof assignee['Username'] === 'string' ? assignee['Username'] : undefined;

    const ps = isRecord(row['PermissionSet']) ? row['PermissionSet'] : undefined;
    const viewAll = ps?.['PermissionsViewAllData'] === true;
    const modifyAll = ps?.['PermissionsModifyAllData'] === true;
    const manageUsers = ps?.['PermissionsManageUsers'] === true;

    const existing = perUser.get(assigneeId) ?? {
      username,
      viewAll: false,
      modifyAll: false,
      manageUsers: false,
    };
    existing.username = existing.username ?? username;
    existing.viewAll = existing.viewAll || viewAll;
    existing.modifyAll = existing.modifyAll || modifyAll;
    existing.manageUsers = existing.manageUsers || manageUsers;
    perUser.set(assigneeId, existing);
  }

  const out: SuperAdminUser[] = [];
  for (const [id, perms] of perUser) {
    if (perms.viewAll && perms.modifyAll && perms.manageUsers) {
      out.push({ id, username: perms.username });
    }
  }
  return out;
}

function usersFromProfileRows(rows: ReadonlyArray<Record<string, unknown>>): SuperAdminUser[] {
  const out: SuperAdminUser[] = [];
  for (const row of rows) {
    const id = typeof row['Id'] === 'string' ? row['Id'] : null;
    if (!id) continue;
    const username = typeof row['Username'] === 'string' ? row['Username'] : undefined;
    out.push({ id, username });
  }
  return out;
}

function dedupeById(users: SuperAdminUser[]): SuperAdminUser[] {
  const seen = new Map<string, SuperAdminUser>();
  for (const u of users) {
    if (!seen.has(u.id)) seen.set(u.id, u);
  }
  return [...seen.values()];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function buildSoqlResult(users: SuperAdminUser[]): EvaluatorResult {
  if (users.length === 0) {
    return {
      status: 'pass',
      confidence: 'high',
      evidence_used: ['soql'],
      findings: [
        'No active users hold all of View All Data, Modify All Data, and Manage Users via permission set or profile.',
      ],
    };
  }

  // Cap the sample at 10 usernames: enough to give a consultant a real
  // sense of who's on the list without bloating the finding line in the
  // PDF. Anything beyond is summarized as "+N more".
  const usernames = users
    .map((u) => u.username)
    .filter((u): u is string => typeof u === 'string')
    .slice(0, 10);
  const moreCount = Math.max(0, users.length - usernames.length);
  const sampleClause = usernames.length
    ? ` Sample: ${usernames.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`
    : '';
  return {
    status: 'inconclusive',
    confidence: 'high',
    evidence_used: ['soql'],
    findings: [
      `${users.length} active super-admin-equivalent user(s) inventoried.${sampleClause} ` +
        'Documented justification per user is adjudicated by the questionnaire (Q-ACS-004).',
    ],
  };
}

const baseAttestation = attestationEvaluator({
  questionId: QUESTION_ID,
  passFinding: PASS_FINDING,
  failFinding: FAIL_FINDING,
});

export const evaluate: Evaluator = (input) => {
  const { evidence } = input;

  const permset = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === PERMSET_QUERY_ID,
  );
  const profile = evidence.find(
    (e): e is Extract<Evidence, { source: 'soql' }> =>
      e.source === 'soql' && e.query_id === PROFILE_QUERY_ID,
  );

  if (permset || profile) {
    const fromPermsets = permset ? qualifyingUsersFromPermsetRows(permset.rows) : [];
    const fromProfile = profile ? usersFromProfileRows(profile.rows) : [];
    return buildSoqlResult(dedupeById([...fromPermsets, ...fromProfile]));
  }

  return baseAttestation(input);
};
