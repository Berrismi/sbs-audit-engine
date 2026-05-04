// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

export interface SfRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type SfRunner = (args: readonly string[]) => Promise<SfRunResult>;

export type PreflightFailureCode = 'sf_not_installed' | 'org_not_authed' | 'missing_perms';

export interface PreflightFailure {
  ok: false;
  code: PreflightFailureCode;
  message: string;
  remediation: string;
}

export type PreflightResult = { ok: true } | PreflightFailure;

export async function checkSfInstalled(runner: SfRunner): Promise<PreflightResult> {
  const result = await runner(['--version']);
  if (result.exitCode === 0) return { ok: true };
  return {
    ok: false,
    code: 'sf_not_installed',
    message: 'Salesforce CLI (`sf`) is not installed or not on $PATH.',
    remediation:
      'Install it with: npm install -g @salesforce/cli. ' +
      'Docs: https://developer.salesforce.com/tools/salesforcecli',
  };
}

interface SfOrgListResponse {
  result?: {
    nonScratchOrgs?: ReadonlyArray<{ alias?: string; connectedStatus?: string }>;
    scratchOrgs?: ReadonlyArray<{ alias?: string; connectedStatus?: string }>;
  };
}

export async function checkOrgAuth(runner: SfRunner, alias: string): Promise<PreflightResult> {
  const result = await runner(['org', 'list', '--json']);
  const parsed = JSON.parse(result.stdout) as SfOrgListResponse;
  const allOrgs = [...(parsed.result?.nonScratchOrgs ?? []), ...(parsed.result?.scratchOrgs ?? [])];
  const match = allOrgs.find((o) => o.alias === alias);
  if (match?.connectedStatus === 'Connected') return { ok: true };
  return {
    ok: false,
    code: 'org_not_authed',
    message: `No active Salesforce auth for org alias "${alias}".`,
    remediation: `Run: sf org login web --alias ${alias}`,
  };
}

export const REQUIRED_USER_PERMS = ['ApiEnabled', 'ViewSetup', 'ViewAllData'] as const;

export type RequiredUserPerm = (typeof REQUIRED_USER_PERMS)[number];

export type UserPermsFetcher = () => Promise<Record<RequiredUserPerm, boolean>>;

export async function checkUserPerms(fetcher: UserPermsFetcher): Promise<PreflightResult> {
  const perms = await fetcher();
  const missing = REQUIRED_USER_PERMS.filter((perm) => !perms[perm]);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    code: 'missing_perms',
    message: `Connected user is missing required permissions: ${missing.join(', ')}.`,
    remediation:
      `Ask your customer to grant your user the following Salesforce permissions: ${missing.join(', ')}. ` +
      'These can be added via Setup → Profiles or via a Permission Set Assignment.',
  };
}

export interface PreflightOptions {
  runner: SfRunner;
  alias: string;
  fetchPerms: UserPermsFetcher;
}

export async function runPreflight(opts: PreflightOptions): Promise<PreflightResult> {
  const sf = await checkSfInstalled(opts.runner);
  if (!sf.ok) return sf;

  const auth = await checkOrgAuth(opts.runner, opts.alias);
  if (!auth.ok) return auth;

  return checkUserPerms(opts.fetchPerms);
}
