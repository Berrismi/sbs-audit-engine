<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# Control enrichment rationale

`control-enrichments.json` is HelloMavens-authored. It maps each SBS v0.4.1
control to OWASP Top 10 2021 categories and regulatory citations
(HIPAA Security Rule, SOC 2 TSC 2017, ISO 27001:2022 Annex A, GDPR, CCPA).

This file documents the editorial reasoning. Per spec §12, these mappings
are the single biggest source of "wow" in the buyer-facing report —
they let an SOC 2 / HIPAA prep team hand the report directly to their
auditor with the cross-walk already done. Accuracy matters.

## Source authority

- **OWASP:** OWASP Top 10 2021 — categories A01–A10. We use the long
  form (`"A01:2021-Broken Access Control"`) so the report can render it
  verbatim without lookup.
- **HIPAA:** Security Rule citations are 45 CFR §164.302–164.318. We
  cite the most specific subsection (e.g., `164.308(a)(4)` for
  Information Access Management).
- **SOC 2:** AICPA Trust Services Criteria 2017 (with 2022 revisions).
  Citations are the criterion code (e.g., `CC6.1` Logical Access,
  `A1.2` Backup).
- **ISO 27001:** ISO/IEC 27001:2022 Annex A. We use the new 2022
  numbering (e.g., `A.5.15` Access control, `A.8.32` Change management),
  not the deprecated 2013 numbering.
- **GDPR:** EU Regulation 2016/679. We cite article numbers
  (e.g., `Article 32` Security of processing).
- **CCPA:** California Civil Code §§1798.100–199.100. We cite section
  numbers with `§` prefix.

## Per-category baseline

Every control in a given category inherits a baseline mapping; we add
specifics where the control demands it.

### ACS — Access Controls

**Baseline:** OWASP A01 (Broken Access Control); HIPAA 164.308(a)(4)
Information Access Management; SOC 2 CC6.1 (Logical Access) + CC6.3
(Logical Access Removal); ISO A.5.15 (Access control), A.5.18 (Access
rights), A.8.3 (Information access restriction).

**Outliers:**

- **ACS-007** (NHI inventory) replaces A.5.15 with A.5.9 (Inventory of
  information assets) + A.5.16 (Identity management) — the control is
  about _who exists_, not _who has what_.
- **ACS-010** (periodic recertification) adds SOC 2 CC6.2 because
  recertification is the explicit point-of-focus for that criterion.
- **ACS-011** (governance of changes) adds SOC 2 CC8.1 + ISO A.8.32
  because change management is the broader control surface.

### AUTH — Authentication

**Baseline:** OWASP A07 (Identification and Authentication Failures);
HIPAA 164.312(d) Person/Entity Authentication; SOC 2 CC6.1 + CC6.7
(Restriction of Information Asset Movement); ISO A.5.16 (Identity
management), A.5.17 (Authentication information), A.8.5 (Secure
authentication).

**Outliers:**

- **AUTH-002** (SSO bypass governance) adds OWASP A01 because SSO
  bypass is fundamentally an access-control gap, not just an auth gap.
- **AUTH-004** (MFA for external users with sensitive data access) adds
  HIPAA 164.308(a)(5)(ii)(D) Password Management and GDPR Article 32
  because the external-user-with-sensitive-data scope is squarely in
  data-protection territory. Risk tier overridden to Critical
  (see `control-overrides.json`) because the upstream YAML omits the
  field.

### CODE — Code Security

**Baseline:** OWASP A06 + A08; HIPAA 164.308(a)(1)(ii)(A) Risk
Analysis; SOC 2 CC8.1 (Change Management); ISO A.8.25 (Secure
development life cycle), A.8.28 (Secure coding).

**Outliers:**

- **CODE-002** (pre-merge static analysis) adds OWASP A03 (Injection)
  because the primary class of issue static analysis catches in Apex
  is SOQL injection.
- **CODE-003** (persistent Apex logging) flips entirely to OWASP A09
  (Security Logging and Monitoring Failures) and the audit-log
  citations — the control is _about_ logging, not coding.
- **CODE-004** (prevent sensitive data in logs) adds A02 (Cryptographic
  Failures) and the most expansive reg set in the category — including
  GDPR Article 32 and CCPA §1798.150 — because leaking PII into logs
  is the canonical "data breach via collateral system" scenario.

### CPORTAL — Customer Portals

**Baseline:** OWASP A01 + A04 + A05; HIPAA 164.308(a)(4) +
164.312(a) Access Control; SOC 2 CC6.1 + CC6.6 (Boundary Protection);
ISO A.5.15 + A.8.3.

CPORTAL-001 adds ISO A.8.26 (Application security requirements)
because it's specifically about portal-Apex implementation patterns.

### DATA — Data Protection

Baseline varies by control because each control covers a distinct
aspect (detection, inventory, backup, history). See per-control
entries. Common citations: HIPAA 164.310(d), SOC 2 CC6.1+CC6.7+A1.x,
ISO A.5.12 (classification), A.8.10 (information deletion), A.8.12
(DLP), A.8.13 (backup), GDPR Article 32 universally.

### DEP — Deployments / Change Management

**Baseline:** OWASP A05 + A08; HIPAA 164.308(a)(8) Evaluation; SOC 2
CC8.1; ISO A.8.32 (Change management).

**Outliers:**

- **DEP-001** (designated deployment identity) adds OWASP A01
  because it's an access-control problem under the change-management
  hood.
- **DEP-003** (monitor unauthorized changes) flips emphasis to OWASP
  A09 + audit-log citations.
- **DEP-005** (secret scanning) adds A02 + A07 + the credentials
  citations because the control is fundamentally about credential
  hygiene at the source-code layer.
- **DEP-006** (CLI Connected App token expiration) is closer to AUTH —
  uses the AUTH baseline.

### INT — Integrations

**Baseline:** SOC 2 CC6.6 + CC6.7; ISO A.5.19 (Information security in
supplier relationships), A.8.20 (Network security).

OWASP coverage varies because each integration concern bites a
different way:

- **INT-001** (browser extensions) — A03 + A04 + A05 + A08; extensions
  inject untrusted code into the auth surface.
- **INT-002** (remote site settings) — A05 + **A10 (SSRF)**;
  unrestricted remote sites are the canonical SSRF vector.
- **INT-003** (named credentials) — A05 + A07 + A08; credentials
  storage is auth-adjacent.
- **INT-004** (event log retention) — A09 only; pure logging control.

### OAUTH — Connected Apps

**Baseline:** OWASP A01 + A07; HIPAA 164.308(a)(4); SOC 2 CC6.1 + CC6.6;
ISO A.5.15 + A.5.16 + A.8.5.

**Outliers:**

- **OAUTH-003** (criticality classification) adds SOC 2 CC3.2 (risk
  identification) and ISO A.5.9 (asset inventory) — the control is
  classification, not access enforcement.
- **OAUTH-004** (vendor due diligence) leans entirely on supplier
  citations: SOC 2 CC9.2 + ISO A.5.19/20/21/22.

### SECCONF — Security Configuration

**Baseline:** OWASP A05; HIPAA 164.308(a)(8); SOC 2 CC7.1 (System
Operations Monitoring); ISO A.5.36 (Compliance with policies for
information security) + A.8.9 (Configuration management).

SECCONF-002 (review and remediate deviations) adds SOC 2 CC4.1 because
"monitoring activities" is the criterion that mandates the review-and-
respond loop, not just the baseline.

## Update process

When SBS bumps version (e.g., to 0.5.0 or 1.0):

1. Re-run `pnpm sync:sbs` to pull new control YAMLs.
2. For each new control id, add an enrichment entry here AND update
   the `enrichments` map in `control-enrichments.json`.
3. The Vitest data test (`tests/data/controls.test.ts`) will fail if
   any control lacks an OWASP tag or a regulation citation — so
   missing entries cannot ship.
4. For controls that change semantics, verify the existing mappings
   still hold; demote / re-source as needed and document the change in
   the per-category outliers list above.
