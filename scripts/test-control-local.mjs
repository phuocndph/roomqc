// Current-schema, exact-owned Auth/PostgREST/PostgreSQL integration.
// No serving Supabase discovery, credentials, users or cutover-flag mutation.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
assert.equal(process.argv.length,2,'Directory integration has no external target argument');
const child=spawn(process.execPath,['scripts/test-control-backend-sandbox.mjs','--run','--diagnostic','directory-integration'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('error',()=>{process.stderr.write('Directory integration could not start\n');process.exitCode=1;});
child.once('close',code=>{process.exitCode=code??1;});
