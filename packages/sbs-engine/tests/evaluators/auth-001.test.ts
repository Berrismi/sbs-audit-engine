// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/evaluators/auth-001';
import { makeControlFixture } from '../fixtures/control';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-AUTH-001',
  questionId: 'Q-AUTH-001',
  evaluate,
});

describe('SBS-AUTH-001 evaluator (Metadata API evidence path)', () => {
  const control = makeControlFixture('SBS-AUTH-001');

  function securitySettings(opts: {
    sso?: Record<string, unknown> | null;
  }): Record<string, unknown> {
    const r: Record<string, unknown> = {
      fullName: 'SecuritySettings',
      passwordPolicies: { complexity: 'AlphaNumeric' },
    };
    if (opts.sso !== undefined) r['singleSignOnSettings'] = opts.sso;
    return r;
  }

  it('returns inconclusive when no SecuritySettings record retrieved', () => {
    const result = evaluate({
      control,
      evidence: [{ source: 'metadata_api', type: 'SecuritySettings', records: [] }],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('No SecuritySettings record retrieved');
  });

  it('returns inconclusive when singleSignOnSettings is missing from the record', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [securitySettings({ sso: null })],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('`singleSignOnSettings` was missing');
  });

  it('returns inconclusive when isLoginWithSalesforceCredentialsDisabled is missing', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { enableSamlLogin: true /* missing the target field */ } }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
    expect(result.findings[0]).toContain('was missing or not a boolean/string-boolean shape');
  });

  it('returns pass+high when isLoginWithSalesforceCredentialsDisabled is the string "true"', () => {
    // jsforce SOAP serialization returns booleans as strings on this field.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'true' } }),
          ],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
    expect(result.findings[0]).toContain('Org-wide SSO enforcement is ON');
  });

  it('returns pass+high when isLoginWithSalesforceCredentialsDisabled is literal boolean true', () => {
    // Defensive — handle both shapes in case jsforce normalizes some fields.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: true } })],
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('returns fail+high when isLoginWithSalesforceCredentialsDisabled is "false" (Salesforce default)', () => {
    // This is the bare-DE shape — SSO enforcement is off by default.
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'false' } }),
          ],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.findings[0]).toContain('Org-wide SSO enforcement is OFF');
    expect(result.findings[0]).toContain('Setup → Single Sign-On Settings');
  });

  it('returns fail+high when isLoginWithSalesforceCredentialsDisabled is literal boolean false', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: false } })],
        },
      ],
    });
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
  });

  it('handles case-insensitive string booleans (TRUE/False)', () => {
    const passResult = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'TRUE' } }),
          ],
        },
      ],
    });
    expect(passResult.status).toBe('pass');

    const failResult = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'False' } }),
          ],
        },
      ],
    });
    expect(failResult.status).toBe('fail');
  });

  it('rejects non-boolean strings as inconclusive', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'maybe' } }),
          ],
        },
      ],
    });
    expect(result.status).toBe('inconclusive');
  });

  it('falls back to questionnaire low-confidence when no metadata_api evidence is present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-001',
          answer: { kind: 'boolean', value: true },
        },
      ],
    });
    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('low');
  });

  it('Metadata evidence wins over questionnaire when both are present', () => {
    const result = evaluate({
      control,
      evidence: [
        {
          source: 'questionnaire',
          question_id: 'Q-AUTH-001',
          answer: { kind: 'boolean', value: true },
        },
        {
          source: 'metadata_api',
          type: 'SecuritySettings',
          records: [
            securitySettings({ sso: { isLoginWithSalesforceCredentialsDisabled: 'false' } }),
          ],
        },
      ],
    });
    // Metadata wins: it says SSO is OFF, even though questionnaire claims ON.
    expect(result.status).toBe('fail');
    expect(result.confidence).toBe('high');
    expect(result.evidence_used).toEqual(['metadata_api']);
  });
});
