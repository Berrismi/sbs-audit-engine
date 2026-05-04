// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Salesforce Health Check API client. Talks to the Tooling API's
// SecurityHealthCheck + SecurityHealthCheckRisks SObjects to get the
// org's overall risk score + list of high-risk settings (settings whose
// org value differs from the Salesforce-recommended baseline).
//
// Requires the connected user to have the "View Setup and Configuration"
// permission, otherwise tooling.query rejects with INSUFFICIENT_ACCESS.
// Preflight check (in plugin Block A) gates this.

import type { ConnectionLike } from '../types';

export interface HealthCheckSetting {
  /** Risk type bucket from Health Check (e.g. "Session Settings"). */
  name: string;
  /** Specific setting label (e.g. "Session timeout value"). */
  setting: string;
  /** Current value in the org. */
  orgValue: string;
  /** Salesforce-recommended baseline value. */
  recommended: string;
}

export type HealthCheckResult =
  | { kind: 'ok'; riskScore: number; highRiskSettings: HealthCheckSetting[] }
  | { kind: 'unsupported'; reason: 'no_tooling_namespace' }
  | { kind: 'failed'; error: { message: string } };

interface OverallRow {
  // Salesforce returns Score as a string in some org configurations
  // (e.g. "66"). Coerce on read.
  Score?: number | string;
}

interface RiskRow {
  RiskType?: string;
  Setting?: string;
  OrgValue?: string;
  StandardValue?: string;
}

export async function fetchHealthCheck(connection: ConnectionLike): Promise<HealthCheckResult> {
  if (!connection.tooling) {
    return { kind: 'unsupported', reason: 'no_tooling_namespace' };
  }

  try {
    const overallResp = await connection.tooling.query(
      'SELECT Score FROM SecurityHealthCheck LIMIT 1',
    );
    const risksResp = await connection.tooling.query(
      'SELECT RiskType, Setting, OrgValue, StandardValue FROM SecurityHealthCheckRisks',
    );

    const overall = overallResp.records[0] as OverallRow | undefined;
    const rawScore = overall?.Score;
    const riskScore =
      typeof rawScore === 'number'
        ? rawScore
        : typeof rawScore === 'string'
          ? Number.parseFloat(rawScore) || 0
          : 0;

    const highRiskSettings: HealthCheckSetting[] = (risksResp.records as RiskRow[]).map((r) => ({
      name: r.RiskType ?? '',
      setting: r.Setting ?? '',
      orgValue: r.OrgValue ?? '',
      recommended: r.StandardValue ?? '',
    }));

    return { kind: 'ok', riskScore, highRiskSettings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'failed', error: { message } };
  }
}
