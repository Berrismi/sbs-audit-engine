// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { evaluate } from '../../src/evaluators/secconf-002';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-SECCONF-002',
  questionId: 'Q-SECCONF-002',
  evaluate,
});
