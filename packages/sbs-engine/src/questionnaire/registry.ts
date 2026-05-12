// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * The question registry.
 *
 * One question per SBS control (54 at the engine's current pin) plus profile +
 * scope questions. Wording follows spec §6: ~8th-grade reading level, no
 * jargon in headlines, "I don't know" available on every scored question.
 *
 * Drift check: at module-load time we assert that every control in the
 * engine's controls.json has at least one question (or is explicitly listed in
 * `KNOWN_DEFERRED_CONTROLS`). This catches the common regression where SBS
 * adds a new control and the questionnaire silently drops it.
 */

import controlsJson from '../../data/controls.json' with { type: 'json' };
import type { CategoryPrefix, ControlLibrary } from '../types';
import type { Question, QuestionnaireRegistry, Section, SkipRule } from './types';
import { makeCportalSkipRule } from './skip-rules';

const controls = controlsJson as unknown as ControlLibrary;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const SECTIONS: readonly Section[] = [
  {
    id: 'profile',
    index: 0,
    title: 'About your organization',
    blurb:
      'A few quick questions about your company. We use these to tailor which security checks apply to you.',
  },
  {
    id: 'ACS',
    index: 1,
    title: 'Access controls',
    blurb: 'Who can see and change what in your Salesforce org.',
  },
  {
    id: 'AUTH',
    index: 2,
    title: 'Authentication',
    blurb: 'How users prove who they are when they log in.',
  },
  {
    id: 'CODE',
    index: 3,
    title: 'Code security',
    blurb: 'How custom Apex and Lightning code is reviewed and protected.',
  },
  {
    id: 'CPORTAL',
    index: 4,
    title: 'Customer portals',
    blurb:
      'Security of any portals or sites where people outside your company log in (Experience Cloud).',
  },
  {
    id: 'DATA',
    index: 5,
    title: 'Data protection',
    blurb: 'How sensitive data is tracked, backed up, and protected.',
  },
  {
    id: 'DEP',
    index: 6,
    title: 'Deployments and change management',
    blurb: 'How changes get into production and how you spot unauthorized ones.',
  },
  {
    id: 'INT',
    index: 7,
    title: 'Integrations',
    blurb: 'Outbound connections, browser extensions, and remote endpoints.',
  },
  {
    id: 'OAUTH',
    index: 8,
    title: 'Connected apps and OAuth',
    blurb: 'Third-party apps and integrations that authenticate to your org.',
  },
  {
    id: 'SECCONF',
    index: 9,
    title: 'Security configuration',
    blurb: 'Your Salesforce Health Check posture and how you keep it tuned.',
  },
  {
    id: 'FDNS',
    index: 10,
    title: 'Foundations',
    blurb:
      'The governance layer underneath everything — where you keep the documents, justifications, and inventories the audit asks about.',
  },
  {
    id: 'FILE',
    index: 11,
    title: 'File and content sharing',
    blurb:
      'How you control public sharing of files — link expiry, password protection, and ongoing review of what you have shared.',
  },
  {
    id: 'MON',
    index: 12,
    title: 'Monitoring and detection',
    blurb:
      'What you record in event logs, what you watch for, and what you do when something looks off.',
  },
  {
    id: 'disclaimer',
    index: 13,
    title: 'Disclaimer and consent',
    blurb: 'A short legal acknowledgement before we generate your report.',
  },
  {
    id: 'submit',
    index: 14,
    title: 'Get your report',
    blurb: "One last step — confirm your email and we'll send a link to your report.",
  },
] as const;

// ---------------------------------------------------------------------------
// Intra-section grouping
// ---------------------------------------------------------------------------
// Long sections (today: ACS at 12 questions, ~3× the median) are visually
// chunked under sub-headings so users can mentally batch related answers
// without us having to split a section at the routing level. Each Question
// optionally carries a `groupId`; renderers (web SectionForm or CLI runner)
// emit the title from this map the first time a groupId appears in the
// question stream.
// ---------------------------------------------------------------------------

export const GROUP_TITLES: Record<string, string> = {
  'ACS:permission-model': 'Permission model and profiles',
  'ACS:privileged-perms': 'Powerful permissions',
  'ACS:non-human': 'Non-human accounts',
  'ACS:governance': 'Access governance',
};

// ---------------------------------------------------------------------------
// Profile + scope questions (drive skip logic; not scored as evidence)
// ---------------------------------------------------------------------------

const PROFILE_QUESTIONS: readonly Question[] = [
  {
    id: 'Q-PROFILE-001',
    section: 'profile',
    controlId: null,
    text: 'How big is your company?',
    helpText: 'Use whichever feels closest — we use this to set the right benchmark.',
    allowIdk: false,
    kind: 'choice',
    options: [
      { value: 'smb', label: 'Small business (under 100 employees)' },
      { value: 'mid', label: 'Mid-market (100 to 1,000 employees)' },
      { value: 'enterprise', label: 'Enterprise (over 1,000 employees)' },
    ],
  },
  {
    id: 'Q-PROFILE-002',
    section: 'profile',
    controlId: null,
    text: 'What industry are you in?',
    helpText:
      'Free text. If your industry has compliance requirements (e.g., healthcare, finance), mention them.',
    allowIdk: false,
    kind: 'free_text',
  },
  {
    id: 'Q-PROFILE-003',
    section: 'profile',
    controlId: null,
    text: 'Which regulations apply to your Salesforce data? (Pick all that apply.)',
    helpText: 'These shape which controls matter most in your report.',
    allowIdk: false,
    kind: 'multi_choice',
    options: [
      { value: 'hipaa', label: 'HIPAA (US healthcare)' },
      { value: 'soc2', label: 'SOC 2' },
      { value: 'gdpr', label: 'GDPR (EU privacy)' },
      { value: 'ccpa', label: 'CCPA (California privacy)' },
      { value: 'iso27001', label: 'ISO 27001' },
      { value: 'none', label: 'None of these' },
    ],
  },
  {
    id: 'Q-SCOPE-CPORTAL',
    section: 'profile',
    controlId: null,
    text: 'Do you use Experience Cloud or Customer Portals?',
    helpText:
      "These let people outside your company (customers, partners) log in to a Salesforce-powered site. If you don't have any, we'll skip the Customer Portal section.",
    allowIdk: true,
    kind: 'boolean',
  },
];

// ---------------------------------------------------------------------------
// Control questions — one Q per SBS control (54 total at the current pin).
// IDs follow the pattern Q-<CATEGORY>-<NNN> matching the upstream control id.
//
// Skip-rule status:
//   - CPORTAL-* → governed by Q-SCOPE-CPORTAL via makeCportalSkipRule
//   - FILE-*    → no skip rule yet (questions auto-cover the no-Public-Content
//                 case in the Q-FILE-001 helpText; design-judgment skip rule
//                 deferred to a future PR)
//   - MON-*     → no skip rule yet (some MON controls apply without the Event
//                 Monitoring add-on, others don't; nuanced design call deferred
//                 to a future PR)
//   - FDNS-*    → applies universally; no skip rule expected
// ---------------------------------------------------------------------------

const CONTROL_QUESTIONS: readonly Question[] = [
  // ---- ACS — Access Controls (12) -----------------------------------------
  // Order is grouped (not numeric by control id) so renderers can render
  // sub-headings as the question stream advances. Group → control mapping:
  //   permission-model:  ACS-001, ACS-005
  //   privileged-perms:  ACS-002, ACS-003, ACS-004, ACS-006
  //   non-human:         ACS-007, ACS-008, ACS-009
  //   governance:        ACS-010, ACS-011, ACS-012
  // -------------------------------------------------------------------------
  {
    id: 'Q-ACS-001',
    section: 'ACS',
    groupId: 'ACS:permission-model',
    controlId: 'SBS-ACS-001',
    text: 'Do you have a written list of who in your company gets which permissions in Salesforce?',
    helpText:
      'Sometimes called a "permission set model" or "access matrix" — it documents which roles get which permissions.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-005',
    section: 'ACS',
    groupId: 'ACS:permission-model',
    controlId: 'SBS-ACS-005',
    text: 'Are all your active users on custom profiles (not the Salesforce out-of-the-box "Standard User" profile)?',
    helpText:
      "Standard profiles can't be edited or audited cleanly. Custom profiles let you tighten permissions over time.",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-002',
    section: 'ACS',
    groupId: 'ACS:privileged-perms',
    controlId: 'SBS-ACS-002',
    text: 'For every user who can use the Salesforce API, do you have a written reason on file for why they need it?',
    helpText:
      'The "API Enabled" permission lets a user pull or push data through the Salesforce API. Auditors expect documentation for each.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-003',
    section: 'ACS',
    groupId: 'ACS:privileged-perms',
    controlId: 'SBS-ACS-003',
    text: 'Is the "Approve Uninstalled Connected Apps" permission limited to a few highly-trusted admins, with a written reason for each?',
    helpText:
      'This permission lets a user authorize new third-party apps into your org. End-users should never have it.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-004',
    section: 'ACS',
    groupId: 'ACS:privileged-perms',
    controlId: 'SBS-ACS-004',
    text: 'For every user who can see all data AND change all data AND manage users, do you have a written reason on file?',
    helpText:
      'These are the most powerful accounts in your org — sometimes called "super admins." Auditors expect a documented justification for each.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-006',
    section: 'ACS',
    groupId: 'ACS:privileged-perms',
    controlId: 'SBS-ACS-006',
    text: 'Is the "Use Any API Client" permission restricted to a few highly-trusted users with a documented reason?',
    helpText:
      'This permission bypasses your "API Access Control" rules. End-users should never have it.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-007',
    section: 'ACS',
    groupId: 'ACS:non-human',
    controlId: 'SBS-ACS-007',
    text: 'Do you keep a current inventory of all the non-human accounts in your org (integration users, automation users, bots, API-only accounts)?',
    helpText:
      'Non-human accounts often have very high privileges. An up-to-date list is the starting point for managing them.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-008',
    section: 'ACS',
    groupId: 'ACS:non-human',
    controlId: 'SBS-ACS-008',
    text: 'Are your non-human accounts limited to only the permissions they actually need?',
    helpText:
      'Bots and integration users often start with too much access "just in case." This control asks whether you tightened them down with documented exceptions.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-009',
    section: 'ACS',
    groupId: 'ACS:non-human',
    controlId: 'SBS-ACS-009',
    text: 'For non-human accounts that DO have admin-like permissions, are there extra controls in place (e.g., IP restrictions, monitoring) to reduce risk?',
    helpText:
      'When you can\'t avoid privileged service accounts, "compensating controls" like IP allowlists or activity alerts close the gap.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-010',
    section: 'ACS',
    groupId: 'ACS:governance',
    controlId: 'SBS-ACS-010',
    text: "Do business stakeholders formally review and re-approve everyone's Salesforce access at least once a year, with documented results?",
    helpText:
      'This is sometimes called "user access review" or "recertification." It catches stale permissions before they become a breach vector.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-011',
    section: 'ACS',
    groupId: 'ACS:governance',
    controlId: 'SBS-ACS-011',
    text: 'Do all changes to user access (new permissions, role changes, etc.) go through a documented approval process with an audit trail?',
    helpText:
      'Ad-hoc permission changes by admins are a top finding in Salesforce audits. A ticketing or change-management workflow is what auditors look for.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-ACS-012',
    section: 'ACS',
    groupId: 'ACS:governance',
    controlId: 'SBS-ACS-012',
    text: 'Have you identified which user types should be restricted to logging in only during certain hours (or have equivalent off-hours monitoring)?',
    helpText: 'For some roles, logins outside business hours are a strong indicator of compromise.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- AUTH — Authentication (4) ------------------------------------------
  {
    id: 'Q-AUTH-001',
    section: 'AUTH',
    controlId: 'SBS-AUTH-001',
    text: 'Have you turned on the org-wide setting that forces all users to log in through your single sign-on provider (and disables Salesforce passwords)?',
    helpText:
      'This is the Salesforce setting that prevents anyone from logging in with a Salesforce-managed password — they must use your SSO provider (Okta, Microsoft Entra, etc.).',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-AUTH-002',
    section: 'AUTH',
    controlId: 'SBS-AUTH-002',
    text: 'For every user allowed to bypass single sign-on (e.g., emergency "break-glass" accounts), is there a documented business reason on file?',
    helpText:
      'Some admin or break-glass accounts intentionally bypass SSO. Each one should be explicitly approved.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-AUTH-003',
    section: 'AUTH',
    controlId: 'SBS-AUTH-003',
    text: 'Are all profile-level login IP restrictions narrow enough that they actually limit access (i.e., no "0.0.0.0/0" or other ranges that allow the entire internet)?',
    helpText:
      "Some orgs have IP ranges configured but they're so wide they don't actually restrict anything.",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-AUTH-004',
    section: 'AUTH',
    controlId: 'SBS-AUTH-004',
    text: 'For external users (customers, partners) who can see sensitive data, do they have to use multi-factor authentication with a strong second factor?',
    helpText:
      'A "strong" second factor typically means an authenticator app, security key, or push notification — not SMS. SMS-only MFA is now considered weak.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- CODE — Code Security (4) -------------------------------------------
  {
    id: 'Q-CODE-001',
    section: 'CODE',
    controlId: 'SBS-CODE-001',
    text: 'Does every Apex or Lightning code change get peer-reviewed and approved before it goes to production?',
    helpText:
      'Pull-request reviews in GitHub or similar — auditors look for "two sets of eyes" on every production change.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CODE-002',
    section: 'CODE',
    controlId: 'SBS-CODE-002',
    text: 'Is there an automated security scanner (e.g., Salesforce Code Analyzer, PMD) that checks every code change BEFORE it gets merged?',
    helpText:
      'Pre-merge static analysis catches things like SOQL injection and FLS bypasses before they hit production.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CODE-003',
    section: 'CODE',
    controlId: 'SBS-CODE-003',
    text: 'Do you have an Apex logging framework that writes events to a permanent place (not just the temporary "debug log")?',
    helpText:
      'Salesforce debug logs are wiped on a short cycle. For real investigations you need durable logs in a Salesforce object or external system.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CODE-004',
    section: 'CODE',
    controlId: 'SBS-CODE-004',
    text: 'Have you confirmed your application logs do not contain passwords, tokens, or sensitive personal data?',
    helpText:
      "Sensitive data leaking into logs is one of the most common audit findings. Answer Yes only if you've actively reviewed log output (e.g., searched recent debug logs for known secrets). If you haven't checked, or you've found partial leakage you haven't fully fixed, answer No.",
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- CPORTAL — Customer Portals (5) -------------------------------------
  {
    id: 'Q-CPORTAL-001',
    section: 'CPORTAL',
    controlId: 'SBS-CPORTAL-001',
    text: "In your portal's Apex code, are you SURE that no method accepts a record ID directly from the user (instead of looking it up from the logged-in user's context)?",
    helpText:
      "A common portal vulnerability: a user passes someone else's record ID and the Apex method returns it. This control asks whether you actively prevent that pattern.",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CPORTAL-002',
    section: 'CPORTAL',
    controlId: 'SBS-CPORTAL-002',
    text: 'Are guest users (people not logged in) limited to ONLY the login and signup pages — with no way to query business data or call Apex methods that touch data?',
    helpText:
      'Misconfigured guest user access has been the source of multiple major Salesforce breaches.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CPORTAL-003',
    section: 'CPORTAL',
    controlId: 'SBS-CPORTAL-003',
    text: "Do you keep an up-to-date list of every Apex class and Flow that's exposed to portal users, with a note on which portal profiles can use each one?",
    helpText:
      "Anything reachable from your Experience Cloud site is part of your external attack surface. The list is what makes 'what can outsiders trigger?' a tractable question.",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CPORTAL-004',
    section: 'CPORTAL',
    controlId: 'SBS-CPORTAL-004',
    text: "In the Flows that run when portal users do things, are you SURE that no flow accepts a record ID directly from the portal user (instead of looking it up from the logged-in user's context)?",
    helpText:
      'This is the Flow-runtime sibling of Q-CPORTAL-001. Autolaunched Flows run in system context by default — accepting user-supplied record IDs lets external users access any record in the org, bypassing all sharing rules.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-CPORTAL-005',
    section: 'CPORTAL',
    controlId: 'SBS-CPORTAL-005',
    text: 'Have you had a security professional run penetration tests against your portal — both before launch and on a regular schedule since?',
    helpText:
      'Configuration audits prove your settings exist; penetration tests prove they actually hold up against attack. Auditors and frameworks like GDPR Article 32 expect both.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- DATA — Data Protection (4) -----------------------------------------
  {
    id: 'Q-DATA-001',
    section: 'DATA',
    controlId: 'SBS-DATA-001',
    text: 'Do you have a way to scan your Long Text Area fields for regulated data (PII, PHI, etc.) on an ongoing basis?',
    helpText:
      "Long Text fields are where regulated data tends to leak in. Spot-checking once isn't enough — auditors expect a continuous or scheduled mechanism.",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DATA-002',
    section: 'DATA',
    controlId: 'SBS-DATA-002',
    text: 'Do you keep an up-to-date list of every Long Text Area field that contains regulated data?',
    helpText: 'The list is what proves you know where the data lives.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DATA-003',
    section: 'DATA',
    controlId: 'SBS-DATA-003',
    text: 'Do you have a tested backup of your Salesforce data AND metadata, with a restore that you actually run on a schedule?',
    helpText:
      'Salesforce no longer offers a paid backup service by default. "Tested" means you\'ve actually restored from the backup recently — not just checked that the backup ran.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DATA-004',
    section: 'DATA',
    controlId: 'SBS-DATA-004',
    text: "For every field you've identified as sensitive, have you turned on Field History Tracking?",
    helpText:
      'Field History Tracking records every change to a field — essential for investigating data tampering.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- DEP — Deployments / Change Management (6) --------------------------
  {
    id: 'Q-DEP-001',
    section: 'DEP',
    controlId: 'SBS-DEP-001',
    text: 'Do all your automated metadata deployments go through a single dedicated identity (instead of being spread across individual admin accounts)?',
    helpText:
      'A single deployment identity makes "who changed this in production" a tractable question.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DEP-002',
    section: 'DEP',
    controlId: 'SBS-DEP-002',
    text: 'Do you have a written list of high-risk metadata types that humans are NOT allowed to edit directly in production?',
    helpText:
      'Things like sharing rules, profiles, and remote site settings — direct production edits should be blocked or alerted.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DEP-003',
    section: 'DEP',
    controlId: 'SBS-DEP-003',
    text: 'Do you get an alert when ANY high-risk metadata is changed in production by a user who is NOT your designated deployment identity?',
    helpText: 'This is the detective control that backs up the previous one.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DEP-004',
    section: 'DEP',
    controlId: 'SBS-DEP-004',
    text: 'Do you have controls in place around branch protection and CI/CD for your Salesforce metadata source repository?',
    helpText:
      'TODO: SBS v0.4.1 has placeholder content for SBS-DEP-004. Question text will be refined when upstream finalizes the control.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DEP-005',
    section: 'DEP',
    controlId: 'SBS-DEP-005',
    text: 'Do you scan your Salesforce source code repositories for accidentally-committed secrets (passwords, API keys, tokens)?',
    helpText:
      'Secret scanning catches developers committing credentials by mistake. GitHub Advanced Security and tools like gitleaks do this.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-DEP-006',
    section: 'DEP',
    controlId: 'SBS-DEP-006',
    text: 'Is the Connected App you use for Salesforce CLI configured so refresh tokens expire within 90 days and access tokens within 15 minutes?',
    helpText:
      'The Salesforce CLI Connected App often defaults to long-lived tokens. Tightening these limits the blast radius of a stolen developer credential.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- INT — Integrations (4) --------------------------------------------
  {
    id: 'Q-INT-001',
    section: 'INT',
    controlId: 'SBS-INT-001',
    text: 'Does your IT team control which browser extensions can talk to Salesforce (rather than letting users install whatever they want)?',
    helpText:
      'Malicious or compromised browser extensions can read every page a user opens, including Salesforce. Centrally-managed extension allowlists block this.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-INT-002',
    section: 'INT',
    controlId: 'SBS-INT-002',
    text: 'Do you keep an up-to-date list of every Remote Site Setting in your org, with a written reason for each one?',
    helpText:
      'Remote Site Settings let Apex make outbound HTTP calls. Old or unjustified entries can be exfiltration paths.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-INT-003',
    section: 'INT',
    controlId: 'SBS-INT-003',
    text: 'Do you keep an up-to-date list of every Named Credential in your org, with a written reason for each one?',
    helpText:
      'Named Credentials store the auth info for outbound integrations. The list is your inventory of "what does our org talk to."',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-INT-004',
    section: 'INT',
    controlId: 'SBS-INT-004',
    text: 'Do you keep at least 30 days of API usage logs (the "ApiTotalUsage" event log) — either in Salesforce or exported elsewhere?',
    helpText:
      'API usage logs are how you investigate suspicious data pulls. Without 30 days of history, post-incident forensics is very limited.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- OAUTH — OAuth & Connected Apps (4) ---------------------------------
  {
    id: 'Q-OAUTH-001',
    section: 'OAUTH',
    controlId: 'SBS-OAUTH-001',
    text: 'Are all of your Connected Apps formally installed by an admin (not just authorized ad-hoc by individual users)?',
    helpText:
      'Letting users self-authorize Connected Apps means anyone with a Salesforce login can grant access to a third party. Formal installation puts that decision in admin hands.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-OAUTH-002',
    section: 'OAUTH',
    controlId: 'SBS-OAUTH-002',
    text: 'Is access to each Connected App controlled by profile or permission set — not "available to all users"?',
    helpText:
      'A Connected App available to everyone is a wide attack surface. Restricting via profile/permission set follows the least-privilege principle.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-OAUTH-003',
    section: 'OAUTH',
    controlId: 'SBS-OAUTH-003',
    text: 'Do you keep a list of every OAuth-enabled Connected App with a "criticality" rating (how important the integration is and how sensitive the data it accesses)?',
    helpText: 'The criticality rating drives how much vendor due diligence you do.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-OAUTH-004',
    section: 'OAUTH',
    controlId: 'SBS-OAUTH-004',
    text: 'For every high-risk Connected App vendor, do you keep their security documentation on file (and explicitly note when something is missing)?',
    helpText:
      'Security documentation means anything an auditor could ask for: SOC 2 report, ISO 27001 cert, pentest summary, vendor security questionnaire response, public trust-page URL. "On file" means tracked somewhere you can point to — saved PDF in shared storage, a row in a vendor inventory, a link in a wiki page — not "I think I saw it once." The "explicitly note when missing" part matters — silence ≠ approval.',
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- SECCONF — Security Configuration (2) -------------------------------
  {
    id: 'Q-SECCONF-001',
    section: 'SECCONF',
    controlId: 'SBS-SECCONF-001',
    text: "Do you have a written Salesforce Health Check baseline (either Salesforce's default XML or your own customized version)?",
    helpText:
      'Health Check compares your settings against a baseline. Without a defined baseline, the comparison is meaningless.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-SECCONF-002',
    section: 'SECCONF',
    controlId: 'SBS-SECCONF-002',
    text: 'Do you regularly review Health Check results and either fix the deviations or formally document them as approved exceptions?',
    helpText:
      "A baseline you don't check against is theater. The control is about closing the loop.",
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- FDNS — Foundations (1) ---------------------------------------------
  {
    id: 'Q-FDNS-001',
    section: 'FDNS',
    controlId: 'SBS-FDNS-001',
    text: 'Do you have one central place — a wiki, ticketing system, or compliance tool — where you keep all the security documents, exception lists, and inventories this audit asks about?',
    helpText:
      "Spread across personal notebooks, Slack DMs, or someone's head, the audit trail is effectively non-existent. A single durable system of record is what auditors expect and what survives staff turnover.",
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- FILE — File and Content Sharing (3) --------------------------------
  {
    id: 'Q-FILE-001',
    section: 'FILE',
    controlId: 'SBS-FILE-001',
    text: 'Do all of your Public Content sharing links (the ones that let anyone with the URL view a file) carry an expiry date appropriate to how sensitive the content is?',
    helpText:
      "Salesforce Public Content links are visible to anyone holding the URL. Without expiry, a leaked link stays valid forever. (If you don't use Public Content sharing at all, answer yes — vacuously, no links means no noncompliant links.)",
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-FILE-002',
    section: 'FILE',
    controlId: 'SBS-FILE-002',
    text: 'For Public Content links that share sensitive material, is there always a password set on the link, with the password sent through a separate secure channel?',
    helpText:
      'Without a password, anyone who obtains the link — through interception, accidental sharing, or link harvesting — can immediately view the file. Password protection is the authentication layer between link possession and data access.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-FILE-003',
    section: 'FILE',
    controlId: 'SBS-FILE-003',
    text: 'Do you regularly review every active Public Content link in your org and remove or fix any that are no longer needed or do not follow current policy?',
    helpText:
      "Public links accumulate over time — old shares, links from before today's policies, accidental shares. A recurring review (Salesforce suggests quarterly as a baseline) catches them before they leak data.",
    allowIdk: true,
    kind: 'boolean',
  },

  // ---- MON — Monitoring and Detection (5) ---------------------------------
  {
    id: 'Q-MON-001',
    section: 'MON',
    controlId: 'SBS-MON-001',
    text: 'Have you turned on Event Monitoring log storage for every event type your security policy requires (file downloads, API calls, report exports, login activity, etc.)?',
    helpText:
      'Salesforce only retains event logs you have explicitly enabled storage for. Once the retention window passes, missing logs cannot be regenerated — that telemetry is permanently lost. The Event Monitoring add-on extends both event-type coverage and retention.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-MON-002',
    section: 'MON',
    controlId: 'SBS-MON-002',
    text: 'Do you keep your Salesforce event logs long enough to meet your retention policy — exporting them to a SIEM or external storage when Salesforce native retention is not long enough?',
    helpText:
      'Salesforce native retention is 1-30 days for many event types (180 days for Setup Audit Trail). Most incidents are detected weeks or months after they happen — without external export, post-incident reconstruction is impossible.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-MON-003',
    section: 'MON',
    controlId: 'SBS-MON-003',
    text: 'Do you have a monitoring system that watches for suspicious login patterns (impossible travel, anonymizing networks, off-hours access, brute-force precursors) and alerts you in real time?',
    helpText:
      'A compromised credential is the single most common starting point for a Salesforce breach. Without anomaly-based alerting on logins, an attacker can roam your org undetected for weeks. Salesforce native LoginHistory captures the raw data; alerting requires a SIEM or specialized monitoring platform.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-MON-004',
    section: 'MON',
    controlId: 'SBS-MON-004',
    text: 'Do you have a monitoring system that watches API activity for unusual patterns — mass exfiltration spikes, unexpected object access, sudden shifts from read to write or delete operations?',
    helpText:
      'Login monitoring alone misses post-authentication threats: stolen access tokens, hijacked sessions, compromised integration accounts. API anomaly monitoring is the safety net. Requires the Event Monitoring add-on for the granular API event logs.',
    allowIdk: true,
    kind: 'boolean',
  },
  {
    id: 'Q-MON-005',
    section: 'MON',
    controlId: 'SBS-MON-005',
    text: 'Do you continuously track how close you are to your daily Salesforce API limit, with proactive alerts at a defined utilization threshold (e.g., 80-90%) before you hit the cap?',
    helpText:
      'When you exceed the daily API quota, Salesforce blocks every further inbound call — all integrations break at once until the rolling 24-hour count drops. Proactive monitoring catches a runaway integration or compromised account before that operational disaster.',
    allowIdk: true,
    kind: 'boolean',
  },
];

// ---------------------------------------------------------------------------
// Build the registry
// ---------------------------------------------------------------------------

const ALL_QUESTIONS: readonly Question[] = [...PROFILE_QUESTIONS, ...CONTROL_QUESTIONS];

const CPORTAL_QUESTION_IDS = ALL_QUESTIONS.filter(
  (q) => q.section === ('CPORTAL' as CategoryPrefix),
).map((q) => q.id);

const SKIP_RULES: readonly SkipRule[] = [makeCportalSkipRule(CPORTAL_QUESTION_IDS)];

/**
 * Controls intentionally without a question. Empty for now — every v0.4.1
 * control is mapped, including SBS-DEP-004 which has placeholder upstream
 * content (the question is similarly placeholder until SBS finalizes).
 *
 * Add new IDs here only with a comment explaining why scoring is deferred.
 */
const KNOWN_DEFERRED_CONTROLS: readonly string[] = [];

// Drift check — runs at module load. Throws loudly so a registry that has
// fallen behind the engine's controls.json crashes the build, not a user
// session in production.
(function assertCoverage() {
  const questionedControlIds = new Set(
    CONTROL_QUESTIONS.map((q) => q.controlId).filter((c): c is string => c !== null),
  );
  const missing = controls.controls
    .map((c) => c.id)
    .filter((id) => !questionedControlIds.has(id) && !KNOWN_DEFERRED_CONTROLS.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `Questionnaire registry is missing questions for ${missing.length} control(s): ` +
        `${missing.join(', ')}. Add them to CONTROL_QUESTIONS in registry.ts or to ` +
        `KNOWN_DEFERRED_CONTROLS with a justification comment.`,
    );
  }
})();

export const REGISTRY: QuestionnaireRegistry = {
  version: '2026.05.11-1',
  sbsVersion: controls.sbs_version,
  sections: SECTIONS,
  questions: ALL_QUESTIONS,
  skipRules: SKIP_RULES,
};

export { PROFILE_QUESTIONS, CONTROL_QUESTIONS, ALL_QUESTIONS, KNOWN_DEFERRED_CONTROLS };
