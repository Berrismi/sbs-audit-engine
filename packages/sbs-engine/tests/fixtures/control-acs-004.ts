// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Hand-crafted Control fixture for SBS-ACS-004 used by evaluator tests.
// This is intentionally minimal — full fixtures live in data/controls.json
// once sync-sbs.ts has been run.

import type { Control } from '../../src/types.ts';

export const ACS_004: Control = {
  id: 'SBS-ACS-004',
  category: 'ACS',
  title: 'Documented Justification for All Super Admin–Equivalent Users',
  control_statement:
    'All users with simultaneous View All Data, Modify All Data, and Manage Users permissions must be documented in a system of record with clear business or technical justification.',
  description: 'Stub for tests; full description loaded from upstream at sync time.',
  risk_level: 'Critical',
  risk_narrative: 'Stub for tests; full risk narrative loaded from upstream at sync time.',
  audit_procedure: ['Stub'],
  remediation_steps: ['Stub'],
  default_value: 'Stub',
  remediation: { scope: 'entity', entity_type: 'User' },
  task_title_template: 'Document justification for Super Admin-equivalent user: {{entity.name}}',
  sources: [
    {
      type: 'sbs',
      upstream_repo: 'Salesforce-Security-Benchmark/docs-site',
      upstream_ref: 'v0.4.1',
      upstream_path: 'control-metadata/SBS-ACS-004.yaml',
    },
  ],
  hellomavens_enrichments: {
    weight: 5,
    owasp: ['A01:2021-Broken Access Control'],
    regulations: {
      hipaa: ['164.308(a)(4)'],
      soc2: ['CC6.1', 'CC6.3'],
      iso27001: ['A.9.2.3'],
    },
    evaluator: 'evaluators/acs-004.ts',
  },
};
