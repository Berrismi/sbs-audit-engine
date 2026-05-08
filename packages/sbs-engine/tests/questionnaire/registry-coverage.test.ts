// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
/**
 * Registry-coverage drift test. Belt-and-suspenders for the runtime assertion
 * in registry.ts: this test fails CI loudly if a new SBS control lands in the
 * engine's controls.json without a corresponding questionnaire entry.
 */

import { describe, expect, it } from 'vitest';
import controlsJson from '../../data/controls.json' with { type: 'json' };
import type { ControlLibrary } from '../../src/types';
import {
  CONTROL_QUESTIONS,
  GROUP_TITLES,
  KNOWN_DEFERRED_CONTROLS,
  REGISTRY,
} from '../../src/questionnaire/registry';

const controls = controlsJson as unknown as ControlLibrary;

describe('Questionnaire registry coverage', () => {
  it('every control in the engine has at least one question (or is explicitly deferred)', () => {
    const questionedIds = new Set(
      CONTROL_QUESTIONS.map((q) => q.controlId).filter((c): c is string => c !== null),
    );
    const missing = controls.controls
      .map((c) => c.id)
      .filter((id) => !questionedIds.has(id) && !KNOWN_DEFERRED_CONTROLS.includes(id));
    expect(missing).toEqual([]);
  });

  it('no question references a control that does not exist in the engine', () => {
    const engineIds = new Set(controls.controls.map((c) => c.id));
    const orphans = CONTROL_QUESTIONS.map((q) => q.controlId)
      .filter((c): c is string => c !== null)
      .filter((id) => !engineIds.has(id));
    expect(orphans).toEqual([]);
  });

  it('all question IDs are unique', () => {
    const ids = REGISTRY.questions.map((q) => q.id);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length);
  });

  it('every question maps to a known section', () => {
    const sectionIds = new Set(REGISTRY.sections.map((s) => s.id));
    const orphanedQuestions = REGISTRY.questions.filter((q) => !sectionIds.has(q.section));
    expect(orphanedQuestions).toEqual([]);
  });

  it('the registry targets the same SBS version as the engine snapshot', () => {
    expect(REGISTRY.sbsVersion).toBe(controls.sbs_version);
  });

  it('every question groupId resolves to a title in GROUP_TITLES', () => {
    const usedGroupIds = new Set(
      REGISTRY.questions.map((q) => q.groupId).filter((g): g is string => Boolean(g)),
    );
    const unresolved = [...usedGroupIds].filter((g) => !(g in GROUP_TITLES));
    expect(unresolved).toEqual([]);
  });

  it('questions sharing a groupId appear contiguously within their section', () => {
    // Renderers print a group heading on the first occurrence of a groupId
    // and not again — non-contiguous groups would render their heading once
    // for a partial cluster and silently drop the rest under the next group's
    // heading. Catching this at the registry level keeps that bug impossible.
    const seen = new Set<string>();
    let activeGroup: string | undefined = undefined;
    let activeSection: string | undefined = undefined;
    for (const q of REGISTRY.questions) {
      if (q.section !== activeSection) {
        activeSection = q.section;
        activeGroup = undefined;
      }
      if (q.groupId && q.groupId !== activeGroup) {
        const sectionScopedKey = `${q.section}::${q.groupId}`;
        if (seen.has(sectionScopedKey)) {
          throw new Error(
            `Group "${q.groupId}" in section "${q.section}" is split across non-contiguous questions (re-entered at ${q.id}).`,
          );
        }
        seen.add(sectionScopedKey);
        activeGroup = q.groupId;
      } else if (!q.groupId) {
        activeGroup = undefined;
      }
    }
  });
});
