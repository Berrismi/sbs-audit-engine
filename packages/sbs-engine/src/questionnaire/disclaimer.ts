// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * Disclaimer + consent text used by the closed audit web app.
 *
 * The CLI does not surface this text — operators running the local-only path
 * are reading the report themselves and the same legal framing doesn't apply.
 * It lives in the engine package so the closed app and any future hosted UI
 * import the same wording from one place.
 *
 * TODO: replace with lawyer-reviewed copy. Until then, treat the wording here
 * as PROVISIONAL. The version string MUST bump every time the wording
 * changes — `audit_subjects.consent_disclaimer_version` is the audit trail
 * for which version a given subject signed.
 */

export const DISCLAIMER_VERSION = '2026-05-02-placeholder-1';

export const DISCLAIMER_PARAGRAPHS: readonly string[] = [
  'The HelloMavens Salesforce Security Audit produces a directional security assessment based on questionnaire responses you provide.',
  'This report is not a substitute for a formal security audit, penetration test, or compliance certification.',
  'HelloMavens LLC makes no warranty, express or implied, regarding the completeness, accuracy, or fitness for any particular purpose of this report.',
  'You confirm that you are authorized to submit this information about your organization.',
  'HelloMavens LLC will process your responses solely to generate this report and will not retain raw scan data after report generation. Aggregate, anonymized scoring data may be retained for benchmarking.',
  'Any remediation actions you take based on this report are at your own risk and discretion.',
];
