// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Unit tests for the upstream SBS markdown parser. Drives the parser via a
// hand-crafted fixture (see fixtures/upstream-sample.md) so the parser's
// behavior is verified against a stable input independent of the live
// upstream — sync drift can't break parser tests.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../scripts/lib/parse-sbs-markdown';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'fixtures/upstream-sample.md');
const fixture = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseMarkdown', () => {
  const parsed = parseMarkdown(fixture);

  it('extracts every control heading in the file', () => {
    expect([...parsed.keys()].sort()).toEqual([
      'SBS-FIX-001',
      'SBS-FIX-002',
      'SBS-FIX-003',
      'SBS-FIX-004',
    ]);
  });

  describe('SBS-FIX-001 (full sections)', () => {
    const c = parsed.get('SBS-FIX-001');

    it('extracts the title without the leading control id', () => {
      expect(c?.title).toBe('Sample Critical Control with All Sections');
    });

    it('extracts the control statement as a single line', () => {
      expect(c?.control_statement).toBe(
        'All resources of type X must conform to a documented model and be enforced continuously.',
      );
    });

    it('extracts the full multi-block description including sub-sections', () => {
      expect(c?.description).toContain('The organization must define and document');
      expect(c?.description).toContain('Example models:');
      expect(c?.description).toContain('Department-scoped tiers');
    });

    it('extracts the risk_level from the Badge attribute', () => {
      expect(c?.risk_level).toBe('Critical');
    });

    it('extracts the risk narrative without the Badge element', () => {
      expect(c?.risk_narrative).toContain('Without a documented model');
      expect(c?.risk_narrative).not.toContain('<Badge');
      expect(c?.risk_narrative).not.toContain('text="Critical"');
    });

    it('extracts the audit procedure as verbatim markdown (preserves sub-bullets)', () => {
      expect(c?.audit_procedure).toContain('1. Obtain the documented model');
      expect(c?.audit_procedure).toContain('   - Purpose alignment.');
    });

    it('extracts the remediation as verbatim markdown', () => {
      expect(c?.remediation_steps).toContain('1. Migrate users off legacy resources.');
      expect(c?.remediation_steps).toContain('3. Document the model in the system of record.');
    });

    it('extracts the default value paragraph', () => {
      expect(c?.default_value).toContain('Salesforce does not enforce any specific model');
    });
  });

  describe('SBS-FIX-002 (Moderate badge, no Default Value)', () => {
    const c = parsed.get('SBS-FIX-002');

    it('maps the tip badge to the Moderate risk_level', () => {
      expect(c?.risk_level).toBe('Moderate');
    });

    it('returns null for default_value when the section is absent', () => {
      expect(c?.default_value).toBeNull();
    });
  });

  describe('SBS-FIX-003 (warning badge, code-formatted prose)', () => {
    const c = parsed.get('SBS-FIX-003');

    it('maps the warning badge to the High risk_level', () => {
      expect(c?.risk_level).toBe('High');
    });

    it('preserves backtick-quoted code in extracted prose', () => {
      expect(c?.description).toContain('`API-Enabled`');
      expect(c?.audit_procedure).toContain('`API-Enabled = true`');
    });
  });

  describe('SBS-FIX-004 (em-dash heading separator + colon-outside bold markers)', () => {
    const c = parsed.get('SBS-FIX-004');

    it('extracts the title across the em-dash separator', () => {
      expect(c?.title).toBe('Sample Em-dash-Separated Heading with Colon-Outside Bold Markers');
    });

    it('extracts a section even when the colon sits outside the bold markers (**Section**:)', () => {
      expect(c?.description).toContain('Upstream is inconsistent');
      expect(c?.audit_procedure).toContain('1. Verify the parser');
      expect(c?.remediation_steps).toContain('1. Use a tolerant section-opener matcher.');
      expect(c?.default_value).toBe('None.');
    });
  });
});
