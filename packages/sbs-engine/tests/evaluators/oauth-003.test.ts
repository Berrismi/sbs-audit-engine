// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { evaluate } from '../../src/evaluators/oauth-003';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-OAUTH-003',
  questionId: 'Q-OAUTH-003',
  evaluate,
});
