// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { evaluate } from '../../src/evaluators/oauth-004';
import { describeBooleanEvaluator } from './_shared';

describeBooleanEvaluator({
  controlId: 'SBS-OAUTH-004',
  questionId: 'Q-OAUTH-004',
  evaluate,
});
