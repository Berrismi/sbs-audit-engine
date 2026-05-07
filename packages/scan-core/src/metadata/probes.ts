// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// The default Metadata API probe registry for HelloMavens security review
// scans. One entry per metadata-type probe; each entry maps to one or more
// SBS controls in the same way SOQL queries do.
//
// Authoring rules (mirroring queries.ts):
//
// 1. Validate against the live org before merging. Run:
//
//      pnpm validate:metadata --target-org hm-cli-validation
//
//    The script lists + reads each probe and verifies the response is a
//    parseable JSON object (or array of objects). Schema drift surfaces
//    here before it hits a customer scan.
//
// 2. The retrieved shape is jsforce-JSONified — NOT raw XML. Per the Track B
//    design review (Q1), evaluators read jsforce's JSON shape directly.
//    No xml2js parser dep was added in the foundation PR; revisit if a
//    future control needs raw XML access.
//
// 3. Profile cap policy (Q3): when a probe omits `fullNames`, the client
//    list()s the type and caps retrieval at `probe.cap` (default 100)
//    after applying `probe.prioritize` (default `prioritizeProfileNames`
//    for Profile, alphabetical for other types). Rationale: production
//    orgs can have 200+ Profiles; capping keeps scan time + Metadata API
//    request budget bounded while still covering the high-value Profiles
//    via the priority comparator.
//
// 4. Foundation PR ships only the canonical `profiles-priority-100`
//    example. Each Track B control PR (AUTH-003, AUTH-001/002, ACS-012,
//    DATA-004) appends its probe(s) to this list.

import type { MetadataProbe } from './client';

export const DEFAULT_METADATA_PROBES: readonly MetadataProbe[] = [
  // Canonical Profile probe — used by Track B AUTH-002/003 evaluators.
  // Lists every Profile in the org, prioritizes standard + integration-
  // shaped names, caps at 100 per Q3 of the Track B design review.
  // Consumed by:
  //   - SBS-AUTH-002 (alpha.24): inspects userPermissions for IsSsoEnabled
  //   - SBS-AUTH-003 (alpha.23): inspects loginIpRanges for overly-broad
  //     ranges
  //   - SBS-ACS-012 (alpha.32): inspects loginHours sub-element for any
  //     configured day*Start/day*End values (replaces the dead SOQL path)
  {
    id: 'profiles-priority-100',
    type: 'Profile',
    cap: 100,
    // prioritize defaults to prioritizeProfileNames for type === 'Profile'
  },

  // CustomObject probe — used by SBS-DATA-004 (alpha.25) field history
  // tracking inventory. Lists every CustomObject in the org (including
  // standard objects which are accessible via this metadata type), caps
  // at 100. Each CustomObject record carries its child fields' metadata
  // including `trackHistory` flags, so the DATA-004 evaluator can compute
  // tracked-field counts without a separate CustomField probe.
  //
  // Default sort is alphabetical (no priority comparator) — there's no
  // obvious "most sensitive object" pattern to prioritize the way Profile
  // standardizes around Standard User / Admin. Consultants on large orgs
  // may want a custom prioritizer that bumps standard CRM objects
  // (Account, Contact, Opportunity, Case) to the top — left as a
  // follow-up if cap-pressure shows up.
  {
    id: 'custom-objects-priority-100',
    type: 'CustomObject',
    cap: 100,
  },

  // SecuritySettings (singleton) — used by SBS-AUTH-001 (alpha.26) org-wide
  // SSO enforcement check. SecuritySettings is a singleton metadata type
  // (only one record per org, fullName always 'SecuritySettings'). The
  // record carries `singleSignOnSettings.isLoginWithSalesforceCredentialsDisabled`
  // among many other org-level settings (sessionSettings, passwordPolicies,
  // networkAccess, etc).
  //
  // alpha.26 unblocks AUTH-001 by switching validate-metadata from sf CLI
  // (whose source-deploy-retrieve registry doesn't list SecuritySettings)
  // to @salesforce/core's Connection.metadata directly. The runtime path
  // (jsforce metadata.read) always supported this type; only the
  // author-time validation gate was blocked.
  {
    id: 'security-settings',
    type: 'SecuritySettings',
    fullNames: ['SecuritySettings'],
  },
];
