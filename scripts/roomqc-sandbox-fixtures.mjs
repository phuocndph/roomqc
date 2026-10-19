import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Save request identities before writes. Recover committed writes with lost
// responses by email lookup and the provisioning RPC's workspace receipt.
export async function provisionSandboxAccounts({ state, save, findUser, createUser, provision, ensureAdmin }) {
  state.accounts ||= {};
  for (const role of ['admin', 'owner']) {
    const email = `qc-e2e-${state.run}-${role}@example.invalid`;
    const account = state.accounts[role] ||= { email, password: 'RoomQC-E2E-Local!2026', workspaceId: randomUUID() };
    assert.equal(account.email, email);
    if (!account.tenantId) account.workspaceId ||= randomUUID();
    await save();
    const user = await findUser(email) || await createUser(email, account.password);
    assert.ok(user?.id, 'Sandbox user required');
    if (account.userId) assert.equal(account.userId, user.id);
    account.userId = user.id;
    await save();
    if (!account.tenantId) {
      const workspace = await provision(role, account);
      assert.ok(workspace.success && workspace.tenant_id, 'Sandbox provisioning must succeed');
      account.tenantId = workspace.tenant_id;
      await save();
    }
    if (role === 'admin') await ensureAdmin(account.userId);
  }
}
