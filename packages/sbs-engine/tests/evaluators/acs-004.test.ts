// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-ACS-004 evaluator tests.
//
// Post-F.2 redesign: SOQL evidence enumerates the WHO (super-admin-equivalent
// users via PermSet OR Profile-level grants); questionnaire adjudicates the
// WHETHER-IT'S-JUSTIFIED. The evaluator is built on the standard
// cliAttestationEvaluator pattern (mirrors int-002).
//
// Reference shape for any future evaluator that has both SOQL and
// questionnaire evidence paths: one test per evidence path × outcome
// (SOQL pass/inconclusive/edge-case, questionnaire pass/fail/idk,
// no-evidence inconclusive). Evaluators must never throw and must degrade
// to inconclusive when evidence is absent.

import { describe, expect, it } from 'vitest';
import { evaluate as evaluateAcs004 } from '../../src/evaluators/acs-004';
import type { Evidence, EvaluatorInput } from '../../src/types';
import { makeControlFixture } from '../fixtures/control';

const QUESTION_ID = 'Q-ACS-004';
const SOQL_QUERY_ID = 'acs-004-super-admin-equivalents';

const inputWith = (evidence: Evidence[]): EvaluatorInput => ({
  control: makeControlFixture('SBS-ACS-004'),
  evidence,
});

describe('SBS-ACS-004 evaluator', () => {
  describe('SOQL evidence (high confidence)', () => {
    it('pass when SOQL returns zero super-admin-equivalents', () => {
      const result = evaluateAcs004(
        inputWith([{ source: 'soql', query: '...', query_id: SOQL_QUERY_ID, rows: [] }]),
      );
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
      expect(result.evidence_used).toEqual(['soql']);
      expect(result.findings[0]).toMatch(/No active users hold all of View All Data/);
    });

    it('inconclusive when SOQL returns N super-admin-equivalents (questionnaire adjudicates)', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: '...',
            query_id: SOQL_QUERY_ID,
            rows: [
              { Id: 'u1', Username: 'admin1@example.com' },
              { Id: 'u2', Username: 'admin2@example.com' },
            ],
          },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('high');
      expect(result.findings[0]).toContain('2 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('admin1@example.com, admin2@example.com');
    });

    it('caps the sample at 10 usernames and reports remainder', () => {
      const rows = Array.from({ length: 15 }, (_, i) => ({
        Id: `u${i}`,
        Username: `admin${i}@example.com`,
      }));
      const result = evaluateAcs004(
        inputWith([{ source: 'soql', query: '...', query_id: SOQL_QUERY_ID, rows }]),
      );
      expect(result.findings[0]).toContain('15 active super-admin-equivalent user(s)');
      expect(result.findings[0]).toContain('+5 more');
    });

    it('does NOT reference JustificationDoc__c in any finding (authoring-rule guard)', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'soql',
            query: '...',
            query_id: SOQL_QUERY_ID,
            rows: [{ Id: 'u1', Username: 'admin1@example.com' }],
          },
        ]),
      );
      expect(JSON.stringify(result)).not.toContain('JustificationDoc');
    });
  });

  describe('questionnaire fallback (low confidence, when SOQL is skipped or absent)', () => {
    it('returns pass when respondent attests Yes', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'boolean', value: true },
          },
        ]),
      );
      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('low');
      expect(result.evidence_used).toEqual(['questionnaire']);
    });

    it('returns fail when respondent attests No', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'boolean', value: false },
          },
        ]),
      );
      expect(result.status).toBe('fail');
      expect(result.confidence).toBe('low');
    });

    it('returns inconclusive when respondent answers idk', () => {
      const result = evaluateAcs004(
        inputWith([
          {
            source: 'questionnaire',
            question_id: QUESTION_ID,
            answer: { kind: 'idk' },
          },
        ]),
      );
      expect(result.status).toBe('inconclusive');
      expect(result.confidence).toBe('low');
    });
  });

  it('returns inconclusive when no evidence at all', () => {
    const result = evaluateAcs004(inputWith([]));
    expect(result.status).toBe('inconclusive');
    expect(result.confidence).toBe('low');
    expect(result.evidence_used).toEqual([]);
  });
});
