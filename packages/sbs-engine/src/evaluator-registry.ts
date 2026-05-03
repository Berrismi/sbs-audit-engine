// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// Hand-maintained registry mapping every SBS v0.4.1 control id to its
// evaluator function. No glob magic — explicit registration keeps tree-
// shaking honest, makes missing entries a compile error, and produces a
// clean diff when SBS adds a control.
//
// The companion `tests/coverage.test.ts` asserts every control id in
// data/controls.json has an entry here AND a corresponding evaluator file.

import type { Evaluator } from './types';

import { evaluate as acs001 } from './evaluators/acs-001';
import { evaluate as acs002 } from './evaluators/acs-002';
import { evaluate as acs003 } from './evaluators/acs-003';
import { evaluate as acs004 } from './evaluators/acs-004';
import { evaluate as acs005 } from './evaluators/acs-005';
import { evaluate as acs006 } from './evaluators/acs-006';
import { evaluate as acs007 } from './evaluators/acs-007';
import { evaluate as acs008 } from './evaluators/acs-008';
import { evaluate as acs009 } from './evaluators/acs-009';
import { evaluate as acs010 } from './evaluators/acs-010';
import { evaluate as acs011 } from './evaluators/acs-011';
import { evaluate as acs012 } from './evaluators/acs-012';

import { evaluate as auth001 } from './evaluators/auth-001';
import { evaluate as auth002 } from './evaluators/auth-002';
import { evaluate as auth003 } from './evaluators/auth-003';
import { evaluate as auth004 } from './evaluators/auth-004';

import { evaluate as code001 } from './evaluators/code-001';
import { evaluate as code002 } from './evaluators/code-002';
import { evaluate as code003 } from './evaluators/code-003';
import { evaluate as code004 } from './evaluators/code-004';

import { evaluate as cportal001 } from './evaluators/cportal-001';
import { evaluate as cportal002 } from './evaluators/cportal-002';

import { evaluate as data001 } from './evaluators/data-001';
import { evaluate as data002 } from './evaluators/data-002';
import { evaluate as data003 } from './evaluators/data-003';
import { evaluate as data004 } from './evaluators/data-004';

import { evaluate as dep001 } from './evaluators/dep-001';
import { evaluate as dep002 } from './evaluators/dep-002';
import { evaluate as dep003 } from './evaluators/dep-003';
import { evaluate as dep004 } from './evaluators/dep-004';
import { evaluate as dep005 } from './evaluators/dep-005';
import { evaluate as dep006 } from './evaluators/dep-006';

import { evaluate as int001 } from './evaluators/int-001';
import { evaluate as int002 } from './evaluators/int-002';
import { evaluate as int003 } from './evaluators/int-003';
import { evaluate as int004 } from './evaluators/int-004';

import { evaluate as oauth001 } from './evaluators/oauth-001';
import { evaluate as oauth002 } from './evaluators/oauth-002';
import { evaluate as oauth003 } from './evaluators/oauth-003';
import { evaluate as oauth004 } from './evaluators/oauth-004';

import { evaluate as secconf001 } from './evaluators/secconf-001';
import { evaluate as secconf002 } from './evaluators/secconf-002';

export const EVALUATOR_REGISTRY: ReadonlyMap<string, Evaluator> = new Map<string, Evaluator>([
  ['SBS-ACS-001', acs001],
  ['SBS-ACS-002', acs002],
  ['SBS-ACS-003', acs003],
  ['SBS-ACS-004', acs004],
  ['SBS-ACS-005', acs005],
  ['SBS-ACS-006', acs006],
  ['SBS-ACS-007', acs007],
  ['SBS-ACS-008', acs008],
  ['SBS-ACS-009', acs009],
  ['SBS-ACS-010', acs010],
  ['SBS-ACS-011', acs011],
  ['SBS-ACS-012', acs012],

  ['SBS-AUTH-001', auth001],
  ['SBS-AUTH-002', auth002],
  ['SBS-AUTH-003', auth003],
  ['SBS-AUTH-004', auth004],

  ['SBS-CODE-001', code001],
  ['SBS-CODE-002', code002],
  ['SBS-CODE-003', code003],
  ['SBS-CODE-004', code004],

  ['SBS-CPORTAL-001', cportal001],
  ['SBS-CPORTAL-002', cportal002],

  ['SBS-DATA-001', data001],
  ['SBS-DATA-002', data002],
  ['SBS-DATA-003', data003],
  ['SBS-DATA-004', data004],

  ['SBS-DEP-001', dep001],
  ['SBS-DEP-002', dep002],
  ['SBS-DEP-003', dep003],
  ['SBS-DEP-004', dep004],
  ['SBS-DEP-005', dep005],
  ['SBS-DEP-006', dep006],

  ['SBS-INT-001', int001],
  ['SBS-INT-002', int002],
  ['SBS-INT-003', int003],
  ['SBS-INT-004', int004],

  ['SBS-OAUTH-001', oauth001],
  ['SBS-OAUTH-002', oauth002],
  ['SBS-OAUTH-003', oauth003],
  ['SBS-OAUTH-004', oauth004],

  ['SBS-SECCONF-001', secconf001],
  ['SBS-SECCONF-002', secconf002],
]);
