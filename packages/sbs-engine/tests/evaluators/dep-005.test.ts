// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { evaluate } from '../../src/evaluators/dep-005';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-DEP-005',
  questionId: 'Q-DEP-005',
  evaluate,
});
