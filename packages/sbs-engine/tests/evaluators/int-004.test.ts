// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { evaluate } from '../../src/evaluators/int-004';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-INT-004',
  questionId: 'Q-INT-004',
  evaluate,
});
