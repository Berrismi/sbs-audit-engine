// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Shared list of Setup Audit Trail Section names that DEP-001 + DEP-003
// (and any future audit-trail-driven controls) treat as "high-risk metadata
// changes". A single authoritative list keeps the two evaluators always
// using the identical scope so their findings are comparable.
//
// Section names are the literal strings Salesforce writes into
// SetupAuditTrail.Section, observed empirically against DE + verified
// against the Salesforce Setup Audit Trail documentation. Note that
// Salesforce capitalization is inconsistent ("Manage apps" vs "Manage
// Users") — use the actual values, not normalized ones.
//
// The audit_procedure for SBS-DEP-003 enumerates the high-risk metadata
// categories: authentication settings, permission structures, Apex code,
// outbound connectivity. The list below covers each:
//   - Apex code:                       Apex Class, Apex Trigger, Apex Page
//   - Permission structures:           Permission Sets, Permission Set Group,
//                                      Profile, Custom Permissions
//   - Authentication settings:         Single Sign On Settings, Authentication
//   - User management:                 Manage Users
//   - Outbound connectivity:           Connected Apps, Manage apps,
//                                      Remote Site Settings, Named Credential,
//                                      Network Access
//   - Sharing model:                   Sharing Defaults
//
// Underscore prefix => internal helper, not exported via the package index.

export const HIGH_RISK_SETUP_AUDIT_SECTIONS: ReadonlySet<string> = new Set([
  'Apex Class',
  'Apex Trigger',
  'Apex Page',
  'Permission Sets',
  'Permission Set Group',
  'Profile',
  'Custom Permissions',
  'Single Sign On Settings',
  'Authentication',
  'Manage Users',
  'Connected Apps',
  'Manage apps',
  'Remote Site Settings',
  'Named Credential',
  'Network Access',
  'Sharing Defaults',
]);

/**
 * Returns the rows whose `Section` is in the high-risk set. Defensive:
 * tolerates rows where Section is missing or non-string (drops them); never
 * throws.
 */
export function filterHighRiskRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  return rows.filter((row) => {
    const section = row['Section'];
    return typeof section === 'string' && HIGH_RISK_SETUP_AUDIT_SECTIONS.has(section);
  });
}
