// SPDX-FileCopyrightText: 2026 HelloMavens LLC
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import {
  checkSfInstalled,
  checkOrgAuth,
  checkUserPerms,
  runPreflight,
  REQUIRED_USER_PERMS,
} from '../../src/lib/preflight';
import type { SfRunner, UserPermsFetcher } from '../../src/lib/preflight';

describe('checkSfInstalled', () => {
  it('returns ok when the sf runner exits 0', async () => {
    const okRunner: SfRunner = async () => ({
      stdout: 'sf 2.40.0',
      stderr: '',
      exitCode: 0,
    });

    const result = await checkSfInstalled(okRunner);

    expect(result.ok).toBe(true);
  });

  it('returns sf_not_installed error with actionable install instructions when runner exits non-zero', async () => {
    const failRunner: SfRunner = async () => ({
      stdout: '',
      stderr: 'command not found: sf',
      exitCode: 127,
    });

    const result = await checkSfInstalled(failRunner);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('sf_not_installed');
      expect(result.message).toContain('Salesforce CLI');
      expect(result.remediation).toContain('npm install -g @salesforce/cli');
    }
  });
});

describe('checkOrgAuth', () => {
  it('returns ok when target-org alias is in `sf org list --json` with Connected status', async () => {
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [{ alias: 'client-prod', connectedStatus: 'Connected' }],
          scratchOrgs: [],
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'client-prod');

    expect(result.ok).toBe(true);
  });

  it('returns org_not_authed with login remediation when alias is not in the org list', async () => {
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [{ alias: 'some-other-org', connectedStatus: 'Connected' }],
          scratchOrgs: [],
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'bogus-alias');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('org_not_authed');
      expect(result.remediation).toContain('sf org login web --alias bogus-alias');
    }
  });

  it('returns org_not_authed when alias is in the list but connectedStatus is not Connected (e.g., Refresh Token Expired)', async () => {
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [{ alias: 'client-prod', connectedStatus: 'Refresh Token Expired' }],
          scratchOrgs: [],
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'client-prod');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('org_not_authed');
      expect(result.remediation).toContain('sf org login web --alias client-prod');
    }
  });

  it('finds aliases in scratchOrgs as well as nonScratchOrgs', async () => {
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [],
          scratchOrgs: [{ alias: 'scratch-1', connectedStatus: 'Connected' }],
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'scratch-1');

    expect(result.ok).toBe(true);
  });

  it('matches by username when Flags.requiredOrg returns the username (not the alias)', async () => {
    // Flags.requiredOrg's getUsername() returns 'mike@example.com', not 'hm-de'.
    // The org list still has both fields populated.
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [
            {
              alias: 'hm-de',
              username: 'mike@example.com',
              connectedStatus: 'Connected',
            },
          ],
          scratchOrgs: [],
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'mike@example.com');

    expect(result.ok).toBe(true);
  });

  it('treats malformed `sf org list --json` (missing result key) as no orgs found', async () => {
    const runner: SfRunner = async () => ({
      stdout: JSON.stringify({}),
      stderr: '',
      exitCode: 0,
    });

    const result = await checkOrgAuth(runner, 'any-alias');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('org_not_authed');
  });
});

describe('checkUserPerms', () => {
  it('exposes the required perms set so the report viewer can document them', () => {
    expect(REQUIRED_USER_PERMS).toEqual(['ApiEnabled', 'ViewSetup', 'ViewAllData']);
  });

  it('returns ok when the perms fetcher reports all required perms present', async () => {
    const fetcher: UserPermsFetcher = async () => ({
      ApiEnabled: true,
      ViewSetup: true,
      ViewAllData: true,
    });

    const result = await checkUserPerms(fetcher);

    expect(result.ok).toBe(true);
  });

  it('returns missing_perms with each missing perm listed in remediation', async () => {
    const fetcher: UserPermsFetcher = async () => ({
      ApiEnabled: true,
      ViewSetup: false,
      ViewAllData: false,
    });

    const result = await checkUserPerms(fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('missing_perms');
      expect(result.remediation).toContain('ViewSetup');
      expect(result.remediation).toContain('ViewAllData');
      expect(result.remediation).not.toContain('ApiEnabled');
    }
  });

  it('only mentions a single missing perm when only one is absent', async () => {
    const fetcher: UserPermsFetcher = async () => ({
      ApiEnabled: true,
      ViewSetup: true,
      ViewAllData: false,
    });

    const result = await checkUserPerms(fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('missing_perms');
      expect(result.remediation).toContain('ViewAllData');
      expect(result.remediation).not.toContain('ViewSetup');
      expect(result.remediation).not.toContain('ApiEnabled');
    }
  });
});

describe('runPreflight composer', () => {
  const sfOk: SfRunner = async (args) => {
    if (args[0] === '--version') {
      return { stdout: 'sf 2.40.0', stderr: '', exitCode: 0 };
    }
    return {
      stdout: JSON.stringify({
        result: {
          nonScratchOrgs: [{ alias: 'client-prod', connectedStatus: 'Connected' }],
          scratchOrgs: [],
        },
      }),
      stderr: '',
      exitCode: 0,
    };
  };

  const permsOk: UserPermsFetcher = async () => ({
    ApiEnabled: true,
    ViewSetup: true,
    ViewAllData: true,
  });

  it('returns ok when all three checks pass', async () => {
    const result = await runPreflight({
      runner: sfOk,
      alias: 'client-prod',
      fetchPerms: permsOk,
    });

    expect(result.ok).toBe(true);
  });

  it('short-circuits with sf_not_installed when sf check fails (does not call later checks)', async () => {
    const sfFail: SfRunner = async () => ({
      stdout: '',
      stderr: 'command not found',
      exitCode: 127,
    });
    let permsCallCount = 0;
    const trackedPerms: UserPermsFetcher = async () => {
      permsCallCount++;
      return { ApiEnabled: true, ViewSetup: true, ViewAllData: true };
    };

    const result = await runPreflight({
      runner: sfFail,
      alias: 'client-prod',
      fetchPerms: trackedPerms,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('sf_not_installed');
    expect(permsCallCount).toBe(0);
  });

  it('short-circuits with org_not_authed when sf passes but org auth fails', async () => {
    let permsCallCount = 0;
    const trackedPerms: UserPermsFetcher = async () => {
      permsCallCount++;
      return { ApiEnabled: true, ViewSetup: true, ViewAllData: true };
    };

    const result = await runPreflight({
      runner: sfOk,
      alias: 'bogus-alias',
      fetchPerms: trackedPerms,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('org_not_authed');
    expect(permsCallCount).toBe(0);
  });
});
