// Acceptance wiring: actual product CLI/image, no SQL replay or mounted source.
// The source/backend under test must be a disposable owner-labelled sandbox.
import assert from 'node:assert/strict';

export async function runBackendBusinessMigration({state,image,databasePassword,migrationSetHash,migrationCount,privateRun}){
 assert.equal(state.diagnosticOnly,true);assert.match(state.run,/^[a-f0-9]{12}$/);
 assert.equal(state.projectId,'roomqc-probe-'+state.run);
 assert.match(image??'',/^roomqc\/control@sha256:[a-f0-9]{64}$/);
 assert.match(migrationSetHash,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(migrationCount)&&migrationCount>0);
 const labels=['--label','roomqc.control-backend-test='+state.run,'--label','com.docker.compose.project='+state.projectId];
 const shipped=state.sourceBinding.files.filter(f=>/^server\/control\/(?:[^/]+\.mjs|schema\.sql|package(?:-lock)?\.json|workers\/.*|migrations\/.*)$/.test(f.path));
 const check="import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';let input='';for await(const c of process.stdin)input+=c;const files=JSON.parse(input);for(const f of files){const text=(await readFile('/app/'+f.path.slice('server/control/'.length),'utf8')).replace(/\\r\\n/g,'\\n');if(createHash('sha256').update(text).digest('hex')!==f.sha256)throw Error('MIGRATION_IMAGE_SOURCE_MISMATCH')}console.log(JSON.stringify({verified:true,files:files.length}));";
 const packaged=JSON.parse((await privateRun('docker',['run','--rm','-i',...labels,'--network','none','--read-only',
  '--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','node',image,'--input-type=module','-e',check],
  {input:JSON.stringify(shipped),timeout:30000})).stdout);
 assert.equal(packaged.verified,true);assert.equal(packaged.files,shipped.length);
 const invoke=async mode=>{
  const args=['run','--rm','-i','--name',state.projectId+'-business-migrations',...labels,
   '--network','container:'+state.projectId+'-db','--read-only','--user','1000:1000','--cap-drop','ALL',
   '--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','64',
   '--tmpfs','/run/roomqc:rw,nosuid,noexec,size=1m,mode=0700,uid=1000,gid=1000','--entrypoint','sh',image,'-c',
   'umask 077; cat > /run/roomqc/business.dsn; exec node /app/business-migrate-cli.mjs "$@"','--','--mode',mode,
   '--database-url-file','/run/roomqc/business.dsn','--expected-hash',migrationSetHash,'--expected-count',String(migrationCount),'--allow-local'];
  const result=await privateRun('docker',args,{input:'postgresql://supabase_admin:'+encodeURIComponent(databasePassword)+'@127.0.0.1:5432/postgres\n',timeout:180000});
  const value=JSON.parse(result.stdout);assert.equal(value.ok,true);return value;
 };
 assert.equal((await invoke('initialize')).initialized,true);
 const plan=await invoke('plan');assert.equal(plan.appliedCount,0);assert.equal(plan.pending.length,migrationCount);
 const applied=await invoke('apply');assert.equal(applied.complete,true);
 assert.equal((await invoke('apply')).complete,true);
 assert.equal((await invoke('verify')).complete,true);
 const {receipt}=await invoke('receipt');assert.equal(receipt.appliedCount,migrationCount);assert.equal(receipt.status,'complete');
 return {verified:true,runner:'packaged-business-migrate-cli',runnerImage:image,sourceSha256:state.sourceBinding.sha256,
  packagedFilesVerified:packaged.files,initialized:true,retryIdempotent:true,migrationReceipt:receipt,sourceMounted:false};
}
