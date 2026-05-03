// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Data-integrity tests for the controls library.
//
// These tests guard the invariants that scoring assumes: every control has
// a known risk level, a non-null weight, at least one OWASP tag, and at least
// one regulation citation. If sync-sbs.ts ever regresses any of these, the
// scoring engine would silently downgrade the affected control(s); the test
// fails CI loudly instead.

import { describe, expect, it } from 'vitest';
import controlsJson from '../../data/controls.json' with { type: 'json' };
import overridesJson from '../../data/control-overrides.json' with { type: 'json' };
import enrichmentsJson from '../../data/control-enrichments.json' with { type: 'json' };
import type { ControlLibrary, RiskLevel } from '../../src/types';

const library = controlsJson as unknown as ControlLibrary;

const ALLOWED_RISK_LEVELS: readonly RiskLevel[] = ['Critical', 'High', 'Moderate'];
const ALLOWED_WEIGHTS = [2, 3, 5];
const EXPECTED_CONTROL_COUNT = 42; // SBS v0.4.1

describe('controls.json integrity', () => {
  it(`contains the expected number of controls (${EXPECTED_CONTROL_COUNT})`, () => {
    expect(library.controls).toHaveLength(EXPECTED_CONTROL_COUNT);
  });

  it('every control has a risk_level in the allowed set', () => {
    const offenders = library.controls
      .filter((c) => !ALLOWED_RISK_LEVELS.includes(c.risk_level))
      .map((c) => `${c.id} (${String(c.risk_level)})`);
    expect(offenders).toEqual([]);
  });

  it('every control has a weight in {2, 3, 5}', () => {
    const offenders = library.controls
      .filter((c) => !ALLOWED_WEIGHTS.includes(c.hellomavens_enrichments.weight))
      .map((c) => `${c.id} (${String(c.hellomavens_enrichments.weight)})`);
    expect(offenders).toEqual([]);
  });

  it('every control has at least one OWASP tag', () => {
    const offenders = library.controls
      .filter((c) => c.hellomavens_enrichments.owasp.length === 0)
      .map((c) => c.id);
    expect(offenders).toEqual([]);
  });

  it('every control has at least one regulation citation', () => {
    const offenders = library.controls
      .filter((c) => Object.values(c.hellomavens_enrichments.regulations).flat().length === 0)
      .map((c) => c.id);
    expect(offenders).toEqual([]);
  });

  it('every control has a unique id', () => {
    const ids = library.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every control has non-empty upstream prose for description, risk_narrative, audit_procedure, remediation_steps', () => {
    const offenders: string[] = [];
    for (const c of library.controls) {
      const blanks: string[] = [];
      if (!c.description || c.description.startsWith('[upstream missing'))
        blanks.push('description');
      if (!c.risk_narrative || c.risk_narrative.startsWith('[upstream missing'))
        blanks.push('risk_narrative');
      if (!c.audit_procedure || c.audit_procedure.startsWith('[upstream missing'))
        blanks.push('audit_procedure');
      if (!c.remediation_steps || c.remediation_steps.startsWith('[upstream missing'))
        blanks.push('remediation_steps');
      if (blanks.length > 0) offenders.push(`${c.id} (${blanks.join(', ')})`);
    }
    expect(offenders).toEqual([]);
  });

  it('no control still carries Phase-3 [TODO:...] placeholder strings', () => {
    const todoFields: string[] = [];
    for (const c of library.controls) {
      const fields: { name: string; value: string | null | undefined }[] = [
        { name: 'title', value: c.title },
        { name: 'control_statement', value: c.control_statement },
        { name: 'description', value: c.description },
        { name: 'risk_narrative', value: c.risk_narrative },
        { name: 'audit_procedure', value: c.audit_procedure },
        { name: 'remediation_steps', value: c.remediation_steps },
        { name: 'default_value', value: c.default_value },
      ];
      for (const f of fields) {
        if (typeof f.value === 'string' && f.value.includes('[TODO:')) {
          todoFields.push(`${c.id}.${f.name}`);
        }
      }
    }
    expect(todoFields).toEqual([]);
  });
});

describe('control-overrides.json', () => {
  const overrides = overridesJson as {
    overrides: Record<string, { risk_level?: RiskLevel; rationale: string }>;
  };

  it('every override has a non-empty rationale', () => {
    const offenders = Object.entries(overrides.overrides)
      .filter(([, v]) => !v.rationale || v.rationale.trim().length === 0)
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('every override targets a control that exists in the library', () => {
    const ids = new Set(library.controls.map((c) => c.id));
    const orphans = Object.keys(overrides.overrides).filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it('every override risk_level is in the allowed set', () => {
    const offenders = Object.entries(overrides.overrides)
      .filter(([, v]) => v.risk_level && !ALLOWED_RISK_LEVELS.includes(v.risk_level))
      .map(([k, v]) => `${k} (${String(v.risk_level)})`);
    expect(offenders).toEqual([]);
  });

  it('AUTH-004 resolves to Critical via the markdown <Badge> (YAML omits the field; alpha.4 retired the override)', () => {
    expect(overrides.overrides['SBS-AUTH-004']).toBeUndefined();
    const auth004 = library.controls.find((c) => c.id === 'SBS-AUTH-004');
    expect(auth004?.risk_level).toBe('Critical');
    expect(auth004?.hellomavens_enrichments.weight).toBe(5);
  });
});

describe('control-enrichments.json', () => {
  const enrichments = enrichmentsJson as {
    enrichments: Record<
      string,
      { owasp: string[]; regulations: Record<string, string[] | undefined> }
    >;
  };

  it('has an entry for every control in the library', () => {
    const ids = new Set(Object.keys(enrichments.enrichments));
    const missing = library.controls.map((c) => c.id).filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('does not have entries for controls that no longer exist', () => {
    const libIds = new Set(library.controls.map((c) => c.id));
    const orphans = Object.keys(enrichments.enrichments).filter((id) => !libIds.has(id));
    expect(orphans).toEqual([]);
  });

  it('every entry has at least one OWASP tag and at least one regulation citation', () => {
    const offenders = Object.entries(enrichments.enrichments)
      .filter(
        ([, v]) =>
          v.owasp.length === 0 || Object.values(v.regulations).filter(Boolean).flat().length === 0,
      )
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('OWASP tags use the long-form (e.g., "A01:2021-Broken Access Control")', () => {
    const malformed = Object.entries(enrichments.enrichments)
      .flatMap(([id, v]) => v.owasp.map((tag) => ({ id, tag })))
      .filter(({ tag }) => !/^A\d{2}:2021-/.test(tag));
    expect(malformed).toEqual([]);
  });
});
