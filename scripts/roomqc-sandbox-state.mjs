// Shared ownership and crash-safe state for disposable RoomQC acceptance runs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sandboxFile = new URL('../artifacts/roomqc-acceptance-sandbox.local', import.meta.url);
const pathOf = file => file instanceof URL ? fileURLToPath(file) : file;
export const missingDockerObject = error => /No such (?:object|container|network)\b|network [^\r\n]+ not found/i.test(String(error.stderr || ''));
export const removeIfPresent = file => unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });

export function validateSandbox(state) {
  assert.match(state.run, /^[a-f0-9]{12}$/);
  assert.equal(state.container, 'roomqc-restore-' + state.run);
  return state;
}

export async function readSandbox(file = sandboxFile) {
  try { return validateSandbox(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Callers hold the operation lock while updating state. A second backup must
// never replace the only record of an earlier run, even if Docker is stopped.
export async function reserveSandbox(state, file = sandboxFile) {
  validateSandbox(state);
  await mkdir(dirname(pathOf(file)), { recursive: true });
  try { await writeFile(file, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('A sandbox is already recorded. Resume or clean it before creating another.');
    throw error;
  }
}

export async function saveSandbox(state, file = sandboxFile) {
  validateSandbox(state);
  assert.equal((await readSandbox(file))?.run, state.run, 'Sandbox state ownership changed');
  const temporary = pathOf(file) + '.' + randomUUID() + '.local';
  try {
    await writeFile(temporary, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temporary, file);
  } finally { await removeIfPresent(temporary); }
}

export async function lockSandbox(file = sandboxFile) {
  const lock = pathOf(file) + '.lock.local';
  await mkdir(dirname(lock), { recursive: true });
  const content = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    let handle;
    try { handle = await open(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Serialize stale-lock recovery too: two recovering processes must not
      // delete a fresh lock that one of them has just acquired.
      const recoveryPath = lock + '.recovery.local';
      let recovery;
      try { recovery = await open(recoveryPath, 'wx', 0o600); }
      catch (recoveryError) {
        if (recoveryError.code === 'EEXIST') throw new Error('Another process is recovering the sandbox lock. Retry shortly.');
        throw recoveryError;
      }
      try {
        let previous;
        try { previous = await readFile(lock, 'utf8'); }
        catch (readError) { if (readError.code === 'ENOENT') continue; throw readError; }
        const { pid } = JSON.parse(previous);
        assert.ok(Number.isInteger(pid) && pid > 0, 'Invalid sandbox operation lock');
        try { process.kill(pid, 0); }
        catch (probeError) {
          if (probeError.code !== 'ESRCH') throw probeError;
          await removeIfPresent(lock);
          continue;
        }
        throw new Error('Another sandbox operation is still running.');
      } finally { await recovery.close(); await removeIfPresent(recoveryPath); }
    }
    await handle.writeFile(content); await handle.close();
    return async () => {
      const current = await readFile(lock, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (current === content) await removeIfPresent(lock);
    };
  }
  throw new Error('Could not acquire sandbox operation lock.');
}

export async function cleanupSandbox(state, docker, removeFile, file = sandboxFile) {
  validateSandbox(state);
  const recorded = await readSandbox(file);
  if (recorded) assert.equal(recorded.run, state.run, 'Cleanup state ownership changed');
  const allowed = ['roomqc-web-', 'roomqc-api-', 'roomqc-rest-', 'roomqc-auth-'].map(prefix => prefix + state.run);
  for (const name of state.services || []) assert.ok(allowed.includes(name));
  const targets = [...allowed, state.container];
  const existing = [];
  for (const name of targets) {
    let value;
    try { value = JSON.parse(docker(['container', 'inspect', name]))[0]; }
    catch (error) { if (missingDockerObject(error)) continue; throw error; }
    assert.equal(value.Name, '/' + name);
    assert.equal(value.Config.Labels[name === state.container ? 'roomqc.restore-verification' : 'roomqc.acceptance'], state.run);
    existing.push(name);
  }
  const networkName = 'roomqc-acceptance-' + state.run;
  if (state.network) assert.equal(state.network, networkName);
  let network;
  try { network = JSON.parse(docker(['network', 'inspect', networkName]))[0]; }
  catch (error) { if (!missingDockerObject(error)) throw error; }
  if (network) {
    assert.equal(network.Labels['roomqc.acceptance'], state.run);
    // Refuse foreign attachments before removing any owned resources.
    for (const member of Object.values(network.Containers || {})) assert.ok(targets.includes(member.Name));
  }
  for (const name of existing) docker(['rm', '-f', name]);
  if (network) docker(['network', 'rm', networkName]);
  for (const name of ['roomqc-auth-', 'roomqc-rest-']) await removeFile(name + state.run + '.local');
  for (const name of ['roomqc-sandbox-hba.local', 'roomqc-sandbox-nginx.local',
    'roomqc-sandbox-hba-' + state.run + '.local', 'roomqc-sandbox-nginx-' + state.run + '.local']) await removeFile(name);
  await removeIfPresent(file);
}
