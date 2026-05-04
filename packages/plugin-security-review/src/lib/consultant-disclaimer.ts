// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// One-time engagement disclaimer the consultant accepts at `sf security
// review login`. The accepted version + signed_at are persisted to
// credentials.json and threaded into every upload's request body, where
// the backend writes them onto the audit_subjects row's consent columns.
//
// To rev terms: bump CONSULTANT_DISCLAIMER_VERSION and update the text.
// Existing credentials.json files keep their old version — historic
// uploads will continue to attest with the old version, which is the
// honest record. The consultant re-runs `login` to upgrade.

export const CONSULTANT_DISCLAIMER_VERSION = 'consultant_engagement_v1';

export const CONSULTANT_DISCLAIMER_TEXT = `
HelloMavens Security Review — Consultant Engagement Disclaimer (v1)

By continuing, you confirm that:
  1. You have a written engagement with the customer authorising you to
     run a Salesforce security review on the org you specify with
     --target-org.
  2. The customer's email you pass with --client-email is correct, and
     the customer agrees to receive the resulting report at that
     address.
  3. The HelloMavens evidence-collection process (SOQL queries,
     Salesforce Health Check API, optional Code Analyzer subprocess)
     is acceptable under that engagement.
  4. You understand that the raw evidence bundle is processed in-memory
     by the HelloMavens scoring service and never persisted; only the
     scored summary is stored.

This disclaimer is recorded once at login and applied to every scan you
upload until you re-run \`sf security review login\`. Type 'yes' to
accept.
`.trim();
