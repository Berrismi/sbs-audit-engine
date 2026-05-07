// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-MON-003: Monitor for Suspicious Logins.
//
// CLI evidence path: scan-core query `mon-003-transaction-security-policies`
// returns the org's TransactionSecurityPolicy inventory from Tooling. The
// evaluator separates Login-targeted policies from the rest and surfaces
// internal monitoring infrastructure as a corroborating signal.
//
// Classification: cli_corroborating. The audit_procedure is fundamentally
// about EXTERNAL SIEM/analytics integration with documented investigation
// procedures — not knowable from SOQL alone. But Salesforce's INTERNAL
// Transaction Security Policy is the platform-layer monitoring primitive,
// and its presence (especially with EventType='Login') is a strong signal
// that the org has at least started thinking about login monitoring.
// Questionnaire (Q-MON-003) confirms whether external SIEM exists with
// the documented procedures the audit_procedure asks for.
//
// EventType picklist (verified via DE describe of TransactionSecurityPolicy):
// AuditTrail, Login, Entity, DataExport, AccessResource. Login is the
// directly-relevant event type for this control; others count toward the
// "internal monitoring exists" signal but not the login-specific bucket.
//
// Outcomes:
//   - 0 TSPs in inventory → inconclusive (no internal monitoring policies
//                          observed; defer to questionnaire whether
//                          external SIEM exists)
//   - N TSPs but 0 with EventType='Login' → inconclusive (internal monitoring
//                          exists for other event types but no login-
//                          specific policy)
//   - N TSPs with EventType='Login' → inconclusive (internal login
//                          monitoring exists; defer to questionnaire about
//                          external SIEM scope + investigation procedures)

import { cliAttestationEvaluator } from './_attestation';

const QUERY_ID = 'mon-003-transaction-security-policies';
const TARGET_EVENT_TYPE = 'Login';

interface PolicyRollup {
  total: number;
  loginPolicies: { developerName: string; state: string | undefined }[];
  byEventType: Map<string, number>;
}

export const evaluate = cliAttestationEvaluator({
  questionId: 'Q-MON-003',
  passFinding:
    'Respondent attests a continuous analytics solution monitors all human and integration logins for anomalous patterns (impossible travel, suspicious networks, off-hours, brute-force precursors), with documented investigation procedures.',
  failFinding:
    'Respondent attests no continuous suspicious-login monitoring exists. Compromised credentials provide an undetected foothold; attacker dwell time grows until the breach is discovered another way.',
  soqlQueryId: QUERY_ID,
  evaluateSoql: (rows) => {
    const rollup = collectPolicies(rows);

    if (rollup.total === 0) {
      return {
        status: 'inconclusive',
        findings: [
          'No TransactionSecurityPolicy records configured. No internal monitoring policies at the platform layer; defer to questionnaire whether external SIEM/analytics covers login anomaly detection per the audit_procedure.',
        ],
      };
    }

    if (rollup.loginPolicies.length === 0) {
      const breakdown = formatEventTypeBreakdown(rollup.byEventType);
      return {
        status: 'inconclusive',
        findings: [
          `${rollup.total} TransactionSecurityPolicy(ies) configured but NONE for EventType='Login' (${breakdown}). Internal monitoring exists for other event types but no login-specific policy. Defer to questionnaire whether external SIEM covers login anomaly detection.`,
        ],
      };
    }

    const sample = formatLoginPolicySample(rollup.loginPolicies);
    return {
      status: 'inconclusive',
      findings: [
        `${rollup.loginPolicies.length} of ${rollup.total} TransactionSecurityPolicy(ies) target EventType='Login' (internal login monitoring infrastructure is in place). ${sample} The audit_procedure asks for continuous EXTERNAL SIEM/analytics with documented investigation procedures — defer to questionnaire to confirm external scope.`,
      ],
    };
  },
});

/**
 * Walk TSP rows and bucket by EventType, separating Login-targeted policies
 * for the headline finding. Defensive against missing EventType /
 * DeveloperName fields.
 */
function collectPolicies(rows: ReadonlyArray<Record<string, unknown>>): PolicyRollup {
  const byEventType = new Map<string, number>();
  const loginPolicies: PolicyRollup['loginPolicies'] = [];
  for (const row of rows) {
    const eventType = typeof row['EventType'] === 'string' ? row['EventType'] : '(unknown)';
    byEventType.set(eventType, (byEventType.get(eventType) ?? 0) + 1);
    if (eventType === TARGET_EVENT_TYPE) {
      const developerName =
        typeof row['DeveloperName'] === 'string' ? row['DeveloperName'] : '(unnamed)';
      const state = typeof row['State'] === 'string' ? row['State'] : undefined;
      loginPolicies.push({ developerName, state });
    }
  }
  loginPolicies.sort((a, b) => a.developerName.localeCompare(b.developerName));
  return { total: rows.length, loginPolicies, byEventType };
}

/**
 * Format "AuditTrail (3), DataExport (1), Entity (2)" — sorted alphabetically
 * for stable output. Used in the no-Login-policy finding.
 */
function formatEventTypeBreakdown(byEventType: Map<string, number>): string {
  const sorted = [...byEventType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([type, count]) => `${type} (${count})`).join(', ');
}

/**
 * Format the first 5 Login-policy DeveloperNames + their State for the
 * primary finding. Caps at 5 with "+N more".
 */
function formatLoginPolicySample(
  policies: ReadonlyArray<PolicyRollup['loginPolicies'][number]>,
): string {
  const named = policies.slice(0, 5).map((p) => {
    const stateClause = p.state ? `, ${p.state}` : '';
    return `${p.developerName}${stateClause}`;
  });
  const moreCount = Math.max(0, policies.length - named.length);
  return `Login-targeted policies: ${named.join('; ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}.`;
}
