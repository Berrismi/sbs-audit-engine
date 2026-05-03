// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT
//
// SBS-DATA-003: Maintain Tested Backup and Recovery for Salesforce Data and Metadata.

import { attestationEvaluator } from './_attestation';

export const evaluate = attestationEvaluator({
  questionId: 'Q-DATA-003',
  passFinding:
    'Respondent attests they have a tested backup of Salesforce data AND metadata, with a restore process that runs on a schedule.',
  failFinding:
    'Respondent attests their Salesforce data/metadata backup is NOT tested with a scheduled restore. Untested backups commonly fail when actually needed.',
});
