<!--
SPDX-FileCopyrightText: 2026 HelloMavens LLC
SPDX-License-Identifier: MIT
-->

# Control enrichment rationale

`control-enrichments.json` is HelloMavens-authored. It maps each SBS control
(54 at upstream main @ d4304e1) to OWASP Top 10 2021 categories and
regulatory citations (HIPAA Security Rule, SOC 2 TSC 2017, ISO 27001:2022
Annex A, GDPR, CCPA).

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

**Outliers (post-2026-05-06 bump to main @ d4304e1):**

- **CPORTAL-003** (Inventory portal-exposed Apex/Flows) reframes from
  access enforcement to **asset governance** — leans on OWASP A04 + A05 +
  A09 (Security Logging and Monitoring Failures) since the control is
  about visibility into the externally-callable surface, and on
  ISO A.5.9 (asset inventory) + SOC 2 CC3.2 (risk identification).
- **CPORTAL-004** (Param-based record access in portal-exposed Flows) is
  the Flow-runtime sibling of CPORTAL-001 — same IDOR-class problem in
  Autolaunched Flows that run in system context by default. Mirrors
  CPORTAL-001's full reg set (HIPAA 164.308(a)(4) + 164.312(a),
  SOC 2 CC6.1 + CC6.6, ISO A.5.15 + A.8.3 + A.8.26) plus GDPR Article 32
  and CCPA §1798.150 because the upstream risk narrative explicitly
  flags personal data exfiltration.
- **CPORTAL-005** (Pen testing) flips entirely to design-validation —
  OWASP A04 + A05; SOC 2 CC4.1 (monitoring) + CC7.1; ISO A.8.8
  (technical vulnerabilities) + A.8.29 (security testing); GDPR Article
  32 (regular testing of effectiveness, explicit in the regulation
  text). No HIPAA — the upstream YAML and badges don't connect this
  process control to specific HIPAA citations.

### DATA — Data Protection

Baseline varies by control because each control covers a distinct
aspect (detection, inventory, backup, history). See per-control
entries. Common citations: HIPAA 164.310(d), SOC 2 CC6.1+CC6.7+A1.x,
ISO A.5.12 (classification), A.8.10 (information deletion), A.8.12
(DLP), A.8.13 (backup), GDPR Article 32 universally.

### FDNS — Foundations

**Baseline:** OWASP A04 + A05 — system-of-record is governance
scaffolding, not access enforcement; HIPAA 164.308(a)(8) Evaluation +
164.316(b) Documentation; SOC 2 CC1.4 (commitment to competence) +
CC2.2 (internal communication) + CC4.1 (monitoring activities); ISO
A.5.1 (policies) + A.5.36 (compliance) + A.5.37 (documented operating
procedures); GDPR Article 5(2) (accountability principle — explicitly
about being able to demonstrate compliance, which is exactly what a
centralized SoR enables).

Currently single-control category — the baseline is its own outlier.

### FILE — File / Content Security

**Baseline:** OWASP A01 + A04 — Public Content links are an access
control surface external to standard Salesforce sharing; SOC 2 CC6.1 +
CC6.6 (boundary protection); ISO A.5.10 (acceptable use of
information) + A.5.13 (labelling of information) + A.8.12 (data leakage
prevention); GDPR Article 32 across the board; CCPA §1798.100
(consumer right of access — sloppy public links can leak personal
information about California residents).

**Outliers:**

- **FILE-001** (Expiry dates) doesn't pull HIPAA — the upstream badges
  don't claim HIPAA scope for the expiry-only control; expiry without
  password is a content-lifetime concern, not an authentication one.
  Picks up GDPR Article 5(1)(e) (storage limitation) explicitly.
- **FILE-002** (Passwords on sensitive links) picks up A07
  (Identification and Authentication Failures) on top of the baseline
  because password protection is fundamentally an auth layer, plus the
  full HIPAA Security Rule access-control set (164.308(a)(4) +
  164.312(a)(1) + 164.312(a)(2)(iv) — encryption/decryption is the
  closest HIPAA equivalent to "password-protected link") + SOC 2 CC6.7
  (data-in-transit handling).
- **FILE-003** (Periodic review) leans on accountability — adds GDPR
  Article 5(2) to the baseline because periodic-review is exactly the
  "demonstrate compliance" practice the article requires.

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

### MON — Monitoring / Detection

**Baseline:** OWASP A09 (Security Logging and Monitoring Failures)
exclusively — every MON control is fundamentally about whether the
right telemetry exists and is reviewed. HIPAA 164.308(a)(1)(ii)(D)
(information system activity review) + 164.312(b) (audit controls);
SOC 2 CC7.2 (system monitoring) + CC7.3 (incident detection); ISO
A.8.15 (logging) + A.8.16 (monitoring activities); GDPR Article 32
universally (security-of-processing requires being able to detect
breaches in time to comply with 72-hour notification).

**Outliers:**

- **MON-002** (Retention) adds HIPAA 164.316(b)(2)(i) (6-year retention)
  because the control is specifically about _retention duration_ and
  the HIPAA reg is the most-cited longest-retention floor in the
  US health-data landscape.
- **MON-003** (Suspicious logins) and **MON-004** (Suspicious API)
  pick up CCPA §1798.100 because the upstream risk narrative
  explicitly calls out unauthorized access to personal information
  via these post-authentication channels.
- **MON-005** (API limits) is closer to **availability/operations**
  than detection — A05 (misconfiguration of monitoring threshold) +
  A09; SOC 2 A1.1 (capacity management) + CC7.2; ISO A.8.6 (capacity
  management) + A.8.16; no HIPAA / GDPR / CCPA — quota exhaustion is
  an availability concern not a confidentiality/integrity one in the
  primary risk narrative, and personal-data implications are
  derivative not direct.

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

---

## CLI evidence classification (Phase 5 Block E)

Each control carries a `cli_evidence_class` flag in its enrichment:

- **`cli_primary`**: scan-core SOQL / Health Check / Code Analyzer
  evidence is ground-truth for this control. Evaluator returns
  `confidence: 'high'` when the CLI evidence is present, with a
  deterministic verdict from the evidence rows.
- **`cli_corroborating`**: CLI evidence informs but doesn't fully
  decide the verdict; questionnaire attestation still adjudicates the
  process layer. Evaluator may still return `inconclusive` even with
  CLI evidence present, falling back to questionnaire when needed.
- **`questionnaire_only`**: process-attestation control. CLI cannot
  verify; the questionnaire is the only evidence source.

### Authoring rule (post-correction baseline)

Block E.1 is the **conservative reset** of an earlier speculative
mapping. Block B + B.1 added 16 SOQL queries authored by control id
without per-control validation against `audit_procedure`; auditing
those mappings during Block E revealed 13 of 16 were tied to the
wrong control (e.g., a frozen-user query mapped to ACS-002, which is
actually about API-Enabled justification). Those queries were removed.

The new authoring rule for any cli_primary or cli_corroborating
classification:

1. **Read the control's `audit_procedure`** in
   `data/controls.json` before authoring a query.
2. The query must enumerate (or directly verify) what the audit
   procedure asks the consultant to inspect.
3. The query lands in `packages/scan-core/src/soql/queries.ts` in the
   same PR as the evaluator extension that consumes it. No bulk
   query additions ahead of evaluator wiring.

### Block E.1 verified set

Three controls are classified `cli_primary` today:

- **SBS-ACS-004** (Documented Justification for Super Admin–Equivalent
  Users) — query `acs-004-super-admin-equivalents` enumerates the
  population; evaluator inspects each row's `JustificationDoc__c`
  custom field for a non-empty value.
- **SBS-INT-002** (Inventory and Justification of Remote Site
  Settings) — query `int-002-remote-site-settings-inventory` returns
  the active RSS list; evaluator confirms the inventory exists,
  reports its size, and falls back to questionnaire for "all entries
  justified."
- **SBS-INT-003** (Inventory and Justification of Named Credentials)
  — same pattern as INT-002 with `int-003-named-credentials-inventory`.

All other 39 controls are `questionnaire_only` until a per-control PR
adds a validated query + evaluator extension. The expected expansion
order:

1. **OAUTH** — connected-app-installation governance (OAUTH-001),
   profile/permset access (OAUTH-002), criticality (OAUTH-003), vendor
   review (OAUTH-004). OAUTH-001 + 002 are SOQL-evidenceable; 003 + 004
   stay questionnaire-led.
2. **CPORTAL** — both controls require code-level inspection (Apex
   parameter handling, guest user record access). Move from
   questionnaire_only to cli_corroborating once Block D's Code
   Analyzer findings cover the relevant rules.
3. **AUTH / DATA / DEP** — most are process-flavored; check Tooling
   API surfaces for SecuritySettings + EncryptionKey + InstalledPackage.
4. **SECCONF** — already has Block C's Health Check API integration
   wired; reclassify both SECCONF controls to cli_primary in the PR
   that wires their evaluators to the health_check_api Evidence
   variant.
5. **CODE** — Code Analyzer findings (Block D) are the evidence
   source. Reclassify each CODE-\* control to cli_primary in the PR
   that maps Code Analyzer rule families to the control.

The discipline from this PR onward: every promotion from
questionnaire_only to cli_primary or cli_corroborating ships in a
single PR alongside its query + evaluator extension + tests.
