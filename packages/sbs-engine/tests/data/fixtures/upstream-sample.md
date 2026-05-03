# Sample Category — fixture for parse-sbs-markdown.ts tests

This fixture mirrors the structure of upstream SBS markdown files (one
per category) at v0.4.1. Each control section is delimited by an `### SBS-...`
heading and contains six bold-prefixed sections in fixed order.

It is a _synthetic_ example, not a snapshot of upstream — keeping it
stable across SBS bumps. Only adjust this file if the upstream's section
schema changes (e.g., a new `**Foo:**` block lands).

### SBS-FIX-001: Sample Critical Control with All Sections

**Control Statement:** All resources of type X must conform to a documented model and be enforced continuously.

**Description:**  
The organization must define and document a standardized model for resource X. The model lives in a system of record and is enforced via continuous scanning.

**Example models:**

- One-to-one mapping between role and capability
- Department-scoped tiers with explicit escalation gates

**Risk:** <Badge type="danger" text="Critical" />  
Without a documented model, ad hoc resources accumulate and create privilege sprawl. Auditors lose the baseline they need to detect drift, and incident responders cannot answer "who had what access at time T".

**Audit Procedure:**

1. Obtain the documented model from the system of record.
2. Enumerate all instances of resource X.
3. Compare each instance against the model:
   - Purpose alignment.
   - Permission boundary alignment.
4. Identify nonconforming instances.

**Remediation:**

1. Migrate users off legacy resources.
2. Update or deprecate noncompliant items.
3. Document the model in the system of record.

**Default Value:**  
Salesforce does not enforce any specific model. Resources can be created without structure unless governed by the organization.

### SBS-FIX-002: Sample Moderate Control without Default Value Section

**Control Statement:** Resources of type Y must be reviewed quarterly.

**Description:**  
Quarterly reviews catch drift early.

**Risk:** <Badge type="tip" text="Moderate" />  
Quarterly review cadence is the minimum that catches drift before a year-end audit. Without it, organizations enter audit cycles with stale evidence.

**Audit Procedure:**

1. Pull the most recent quarterly review.
2. Confirm the review is dated within the last 90 days.

**Remediation:**

1. Schedule the next quarterly review.

### SBS-FIX-003: Sample High Control with Backticked Code

**Control Statement:** All `API-Enabled` profiles must be justified.

**Description:**  
Profiles with `API-Enabled` permission can bypass the UI and act through the API directly.

**Risk:** <Badge type="warning" text="High" />  
The `API-Enabled` permission is a common path to programmatic data exfiltration when granted broadly.

**Audit Procedure:**

1. List all profiles with `API-Enabled = true`.
2. Verify each has a documented justification.

**Remediation:**

1. Remove `API-Enabled` from profiles without justification.

**Default Value:**  
Standard profiles ship with `API-Enabled` granted to admin-equivalent profiles only.

### SBS-FIX-004 — Sample Em-dash-Separated Heading with Colon-Outside Bold Markers

This case mirrors upstream SBS-DEP-004 (em-dash separator) and SBS-INT-004
(colon outside `**Section**:`). Both forms appear in real upstream at v0.4.1.

**Control Statement**:
The system must accept both heading separator styles and both bold/colon ordering.

**Description**:
Upstream is inconsistent — the parser must tolerate it.

**Risk:** <Badge type="warning" text="High" />  
Inconsistent upstream formatting causes silent prose loss if the parser is too strict.

**Audit Procedure**:

1. Verify the parser extracts this control's prose despite the em-dash heading.
2. Verify the parser extracts the Description section despite the colon being outside the bold markers.

**Remediation**:

1. Use a tolerant section-opener matcher.

**Default Value**:
None.
