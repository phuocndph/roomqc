// Runs only an exact-owned disposable stack. Never discovers or mutates the
// serving Supabase project, credentials, users, database, or mailbox.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
assert.equal(process.argv.length,2,'This journey has no external target argument');
const repository=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['scripts/test-control-backend-sandbox.mjs','--run','--diagnostic','customer-journey'],{cwd:repository,stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('error',()=>{process.stderr.write('Customer journey could not start\n');process.exitCode=1;});
child.once('close',(code)=>{process.exitCode=code??1;});
