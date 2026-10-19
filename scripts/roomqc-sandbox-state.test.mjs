import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanupSandbox, lockSandbox, readSandbox, reserveSandbox, saveSandbox } from './roomqc-sandbox-state.mjs';
import { provisionSandboxAccounts } from './roomqc-sandbox-fixtures.mjs';

const run = '012345abcdef';
const state = () => ({ run, container: 'roomqc-restore-' + run, network: 'roomqc-acceptance-' + run });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'roomqc-sandbox-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'state.local');
}
test('a second reservation preserves the entire existing run, including credentials', async t => {
  const file = await fixture(t), original = { ...state(), credentials: { temporary: 'demo' } };
  await reserveSandbox(original, file);
  await assert.rejects(reserveSandbox({ run: 'fedcba543210', container: 'roomqc-restore-fedcba543210' }, file), /already recorded/);
  assert.deepEqual(await readSandbox(file), original);
});
test('atomic state saves refuse a different run', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  await assert.rejects(saveSandbox({ run: 'fedcba543210', container: 'roomqc-restore-fedcba543210' }, file), /ownership/);
  assert.deepEqual(await readSandbox(file), state());
});
test('operation lock rejects concurrent setup/cleanup and releases cleanly', async t => {
  const file = await fixture(t), release = await lockSandbox(file);
  await assert.rejects(lockSandbox(file), /still running/);
  await release(); await (await lockSandbox(file))();
});
test('a killed operation lock can be recovered', async t => {
  const file = await fixture(t), child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(child.status, 0);
  await writeFile(file + '.lock.local', JSON.stringify({ pid: child.pid, token: 'abandoned' }));
  await (await lockSandbox(file))();
});
function fakeDocker({ missingNetwork = false, foreign = false, offline = false, interrupt = false } = {}) {
  const objects = new Map(['roomqc-edge-', 'roomqc-edge-bundle-', 'roomqc-web-', 'roomqc-api-', 'roomqc-rest-', 'roomqc-auth-', 'roomqc-restore-'].map(prefix => {
    const name = prefix + run;
    return [name, { Name: '/' + name, Config: { Labels: { [prefix === 'roomqc-restore-' ? 'roomqc.restore-verification' : 'roomqc.acceptance']: run } } }];
  }));
  if (foreign) objects.get((typeof foreign === 'string' ? foreign : 'roomqc-auth-') + run).Config.Labels['roomqc.acceptance'] = 'somebody-else';
  const removed = [];
  const docker = args => {
    if (offline) throw Object.assign(new Error('offline'), { stderr: 'cannot connect to Docker daemon' });
    if (args[1] === 'inspect') {
      const value = args[0] === 'network' ? (missingNetwork ? null : { Labels: { 'roomqc.acceptance': run }, Containers: {} }) : objects.get(args[2]);
      if (!value) throw Object.assign(new Error('missing'), { stderr: args[0] === 'network'
        ? 'Error response from daemon: network ' + args[2] + ' not found'
        : 'Error: No such container: ' + args[2] });
      return JSON.stringify([value]);
    }
    if (args[0] === 'rm') {
      const name = args.at(-1); objects.delete(name); removed.push(name);
      if (interrupt) { interrupt = false; throw new Error('simulated interruption after remove'); }
    } else if (args[0] === 'network' && args[1] === 'rm') missingNetwork = true;
    else throw new Error('Unexpected docker command: ' + args.join(' '));
    return '';
  };
  return { docker, removed };
}
test('missing network does not prevent credential cleanup; cleanup can repeat', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  const fake = fakeDocker({ missingNetwork: true }), deleted = [];
  await cleanupSandbox(state(), fake.docker, async name => deleted.push(name), file);
  assert.equal(fake.removed.length, 7); assert.ok(deleted.includes('roomqc-auth-' + run + '.local'));
  assert.ok(deleted.includes('roomqc-edge-' + run + '.local'));
  assert.ok(deleted.includes('roomqc-edge-bundle-' + run + '.local'));
  assert.equal(await readSandbox(file), null);
  await cleanupSandbox(state(), fake.docker, async () => {}, file);
});
test('cleanup resumes after removal succeeded but response was lost', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  const fake = fakeDocker({ interrupt: true });
  await assert.rejects(cleanupSandbox(state(), fake.docker, async () => {}, file), /interruption/);
  assert.ok(await readSandbox(file));
  await cleanupSandbox(state(), fake.docker, async () => {}, file);
  assert.equal(new Set(fake.removed).size, 7); assert.equal(await readSandbox(file), null);
});
test('foreign labels fail before deleting any container or file', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  const fake = fakeDocker({ foreign: true }); let files = 0;
  await assert.rejects(cleanupSandbox(state(), fake.docker, async () => files++, file));
  assert.equal(fake.removed.length, 0); assert.equal(files, 0); assert.ok(await readSandbox(file));
});
test('Docker outage preserves retry state and credentials', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  let files = 0;
  await assert.rejects(cleanupSandbox(state(), fakeDocker({ offline: true }).docker, async () => files++, file), /offline/);
  assert.equal(files, 0); assert.ok(await readFile(file));
});

test('foreign Edge ownership prevents cleanup before any deletion', async t => {
  const file = await fixture(t); await reserveSandbox(state(), file);
  const fake = fakeDocker({ foreign: 'roomqc-edge-' }); let files = 0;
  await assert.rejects(cleanupSandbox(state(), fake.docker, async () => files++, file));
  assert.equal(fake.removed.length, 0); assert.equal(files, 0); assert.ok(await readSandbox(file));
});
test('orphan cleanup cannot remove another recorded run', async t => {
  const file = await fixture(t); await reserveSandbox({ run: 'fedcba543210', container: 'roomqc-restore-fedcba543210' }, file);
  const fake = fakeDocker(); let files = 0;
  await assert.rejects(cleanupSandbox(state(), fake.docker, async () => files++, file), /ownership changed/);
  assert.equal(fake.removed.length, 0); assert.equal(files, 0);
  assert.equal((await readSandbox(file)).run, 'fedcba543210');
});
for (const fault of ['create', 'provision', 'admin']) test('account setup resumes after lost ' + fault + ' response without duplicates', async () => {
  let current = state(), saved = structuredClone(current), fail = true;
  const users = new Map(), workspaces = new Map(), admins = new Set();
  const options = () => ({ state: current, save: async () => { saved = structuredClone(current); },
    findUser: async email => users.get(email),
    createUser: async email => {
      assert.ok(!users.has(email)); const user = { id: 'user-' + users.size }; users.set(email, user);
      if (fault === 'create' && fail) { fail = false; throw new Error('lost response'); } return user;
    },
    provision: async (_role, account) => {
      if (!workspaces.has(account.workspaceId)) workspaces.set(account.workspaceId, { success: true, tenant_id: 'tenant-' + workspaces.size });
      if (fault === 'provision' && fail) { fail = false; throw new Error('lost response'); } return workspaces.get(account.workspaceId);
    },
    ensureAdmin: async id => { admins.add(id); if (fault === 'admin' && fail) { fail = false; throw new Error('lost response'); } },
  });
  await assert.rejects(provisionSandboxAccounts(options()), /lost response/);
  current = structuredClone(saved); await provisionSandboxAccounts(options());
  current = structuredClone(saved); await provisionSandboxAccounts(options());
  assert.equal(users.size, 2); assert.equal(workspaces.size, 2); assert.equal(admins.size, 1);
  assert.ok(saved.accounts.admin.tenantId && saved.accounts.owner.tenantId);
});
