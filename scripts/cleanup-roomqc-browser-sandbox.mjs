// Remove only disposable containers/networks owned by the saved acceptance run.
// Never deletes host database backups, source containers, or business rows.
import { execFileSync } from 'node:child_process';
import { cleanupSandbox, lockSandbox, readSandbox, removeIfPresent } from './roomqc-sandbox-state.mjs';

const release = await lockSandbox();
try {
  const state = await readSandbox();
  if (!state) console.log('No recorded sandbox; cleanup already complete.');
  else {
    const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
    await cleanupSandbox(state, docker, name => removeIfPresent(new URL('../artifacts/' + name, import.meta.url)));
    console.log('Owned sandbox and temporary credentials removed. Host backups retained; main RoomQC untouched.');
  }
} finally { await release(); }
