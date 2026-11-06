// Real isolated directory/HTTP, compiled production operational client and journal.
// Canonical authority, release approval and health are fixture inputs, not live VPS proof.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer,request as httpRequest} from 'node:http';
import {build} from 'esbuild';
import {ControlStore,ControlError} from '../server/control/store.mjs';
import {migrateDirectory,importInitialRegistry} from '../server/control/migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '../server/control/test-fixtures.mjs';
import {startControl} from '../server/control/server.mjs';
import {captureBackendSourceBinding} from './control-backend-source-binding.mjs';

const require=createRequire(new URL('../server/control/package.json',import.meta.url)),pg=require('pg');
const root=fileURLToPath(new URL('../',import.meta.url)),run=randomBytes(6).toString('hex');
const name='roomqc-cluster-client-'+run,label='roomqc.control-cluster-client='+run,password=randomBytes(32).toString('hex');
const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1_000_000,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});
const paths=['scripts/test-control-cluster-client.mjs','src/lib/control-admin.ts','src/lib/control-http-error.ts',
  'src/lib/control-cluster-journal.ts','src/lib/control-admin-routes.ts','src/lib/workspace.ts',
  'src/hooks/super-admin/useControlAdmin.ts','src/hooks/super-admin/useControlClusterCommands.ts',
  'src/components/super-admin/control/ControlClusterCommands.tsx','src/pages/admin/InfrastructurePage.tsx'];
const hashes=async()=>Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')})));
const startedAtUtc=new Date().toISOString(),source=await hashes(),backend=await captureBackendSourceBinding(root),checks=[];
const artifact='artifacts/roomqc-control-cluster-client-'+run+'-local-2026-10-28.json',originalFetch=globalThis.fetch;
let created=false,pool,store,runtime,relay,stage='compile',failure=null,cleanupVerified=false,dropNext=false,upstreamOrigin;
const record=(label,passed,details={})=>{checks.push({label,passed:!!passed,...details});assert.equal(!!passed,true,label)};
try {
  const compiled=await build({absWorkingDir:root,stdin:{contents:"export {createControlAdminClient} from './src/lib/control-admin'; export {createClusterJournal} from './src/lib/control-cluster-journal'",resolveDir:root,loader:'ts'},
    bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',define:{'import.meta.env':'{}'}});
  const {createControlAdminClient,createClusterJournal}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  stage='directory';docker(['run','-d','--name',name,'--label',label,'--env','POSTGRES_PASSWORD','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m','-p','127.0.0.1::5432',image]);created=true;
  const info=JSON.parse(docker(['inspect',name]))[0],databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
  pool=new pg.Pool({connectionString:databaseUrl,max:2,statement_timeout:10000});
  for(let attempt=0;;attempt++){try{await pool.query('SELECT 1');break}catch{if(attempt>=60)throw new Error('DIRECTORY_NOT_READY');await new Promise(resolve=>setTimeout(resolve,200))}}
  await migrateDirectory(pool);const config=fixtureConfig(databaseUrl);config.signupEnabled=false;
  await importInitialRegistry(pool,config.clusters);await seedOperationalCluster(pool);
  await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status)
    VALUES($1,'existing-hotel','Existing hotel',$2,'cluster-a',$3,$4,$5,'active')`,[randomUUID(),run,randomUUID(),randomUUID(),randomUUID()]);
  const workspaceSnapshot=async()=>JSON.stringify((await pool.query('SELECT * FROM roomqc_control.workspaces ORDER BY id')).rows);
  const beforeWorkspace=await workspaceSnapshot(),beforeThresholds=JSON.stringify((await pool.query('SELECT thresholds FROM roomqc_control.cluster_policies')).rows);
  await pool.query(`CREATE ROLE cluster_client_runtime LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const apiUrl=new URL(databaseUrl);apiUrl.username='cluster_client_runtime';config.databaseUrl=apiUrl.href;
  const actor={actorId:randomUUID(),sessionId:randomUUID()},other={actorId:randomUUID(),sessionId:randomUUID()};
  const sessionFor=identity=>({access_token:'e30.'+Buffer.from(JSON.stringify({sub:identity.actorId,session_id:identity.sessionId})).toString('base64url')+'.synthetic',user:{id:identity.actorId}});
  let session=sessionFor(actor);const tokens=new Map([[session.access_token,actor],[sessionFor(other).access_token,other]]);
  const start=async()=>{store=new ControlStore(config);runtime=await startControl(config,{store,gateway:{supportActor:async token=>{
    const identity=tokens.get(token);if(!identity)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Cần quyền quản trị.');return{id:identity.actorId,clusterId:'cluster-a'};
  }}});upstreamOrigin='http://127.0.0.1:'+runtime.server.address().port;};await start();
  relay=createServer((req,res)=>{
    const lose=dropNext&&req.method==='POST'&&req.url.endsWith('/commands');if(lose)dropNext=false;
    const upstream=httpRequest(upstreamOrigin+req.url,{method:req.method,headers:req.headers},reply=>{
      if(lose){reply.resume();reply.on('end',()=>res.destroy());}else{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);}
    });upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+relay.address().port;
  globalThis.fetch=async(url,options)=>{
    if(typeof url==='string'&&url.startsWith('/api/control/')){
      assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');
      const response=await originalFetch(origin+url,{...options,headers:{...options.headers,Origin:config.publicOrigin}});
      assert.equal(response.headers.get('cache-control'),'no-store');return response;
    }return originalFetch(url,options);
  };
  const client=createControlAdminClient({getSession:async()=>({data:{session},error:null})});
  const values=new Map(),storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,
    getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let identity=actor;const context={...actor,runtime:origin},journal=createClusterJournal(()=>storage,()=>randomUUID().toUpperCase()),reason='Đóng cụm để kiểm tra vận hành';
  const request=(operation,expectedVersion,payload={})=>({target:'cluster-a',operation,expectedVersion,payload,reason});
  const detail=()=>client.cluster(identity,'cluster-a');
  const apply=async(operation,version,payload={})=>{
    const entry=journal.prepare(context,request(operation,version,payload)),receipt=await client.clusterCommand(identity,entry.request);
    journal.complete(context,entry);return receipt;
  };
  stage='http-journal';record('initial-cluster-has-fixture-health-and-existing-workspace',(await detail()).admission.decision==='open'&&(await detail()).allocatedCount===1);
  record('runtime-api-role-is-not-superuser',(await store.pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper===false);
  const entry=journal.prepare(context,request('close_admission',1));dropNext=true;
  await assert.rejects(()=>client.clusterCommand(identity,entry.request),{code:'outcome_unknown'});
  record('wire-response-lost-after-close-commit-keeps-original-journal',journal.list(context).length===1&&(await detail()).rowVersion===2&&(await detail()).admission.decision==='manual_closed');
  await runtime.shutdown();runtime=null;await start();identity={...actor,sessionId:randomUUID()};session=sessionFor(identity);tokens.set(session.access_token,identity);
  const resumed=createClusterJournal(()=>storage),saved=resumed.list({...context,...identity})[0],receipt=await client.clusterCommandResult(identity,saved.request);
  resumed.complete({...context,...identity},saved);record('restart-relogin-recovers-exact-upper-case-key',receipt.targetVersion===2&&resumed.list(context).length===0);
  await assert.rejects(()=>client.clusterCommandResult(identity,{...saved.request,key:saved.request.key.toLowerCase()}),{code:'result_absent'});
  const repeated=await Promise.all(Array.from({length:12},()=>client.clusterCommand(identity,saved.request)));
  record('twelve-compiled-client-replays-return-one-command-and-event',new Set(repeated.map(r=>r.commandId)).size===1
    &&(await pool.query('SELECT * FROM roomqc_control.control_commands')).rowCount===1
    &&(await pool.query('SELECT * FROM roomqc_control.cluster_events')).rowCount===1);
  await assert.rejects(()=>client.clusterCommand(identity,{...saved.request,reason:'Nội dung khác cùng mã'}),{code:'outcome_unknown'});
  record('same-key-different-body-cannot-claim-a-success',true);
  session=sessionFor(other);await assert.rejects(()=>client.clusterCommandResult(other,saved.request),{code:'result_absent'});
  record('receipt-and-journal-isolate-other-actor',resumed.list({...context,...other}).length===0);session=sessionFor(identity);
  const opened=await apply('open_admission',2);record('explicit-open-rechecks-server-gates',opened.result.admission.decision==='open'&&(await detail()).rowVersion===3);
  const drained=await apply('set_draining',3);record('drain-closes-new-admission-and-preserves-existing-workspace',drained.result.status==='draining'
    &&drained.result.admission.decision==='manual_closed'&&await workspaceSnapshot()===beforeWorkspace);
  const serving=await apply('set_serving',4);record('serving-never-implicitly-opens-new-admission',serving.result.status==='active'&&serving.result.admission.decision==='manual_closed');
  const changed=await apply('update_policy',5,{tenantLimit:10});record('limit-command-closes-admission-and-preserves-thresholds',changed.result.tenantLimit===10
    &&changed.result.admission.decision==='manual_closed'&&JSON.stringify((await pool.query('SELECT thresholds FROM roomqc_control.cluster_policies')).rows)===beforeThresholds);
  const blocked=journal.prepare(context,request('open_admission',6));
  const rejection=await client.clusterCommand(identity,blocked.request).catch(error=>error);assert.equal(rejection.code,'not_applied');assert.equal(rejection.serverCode,'ADMISSION_BLOCKED');
  const rejected=journal.reject(context,blocked,rejection.serverCode);journal.complete(context,rejected);
  record('policy-change-invalidates-old-health-and-open-rejection-rolls-back',(await detail()).rowVersion===6
    &&(await pool.query('SELECT * FROM roomqc_control.control_commands WHERE idempotency_key=$1',[blocked.request.key])).rowCount===0);
  const stale=journal.prepare(context,request('set_draining',1));
  const staleResult=await client.clusterCommand(identity,stale.request).catch(error=>error);assert.equal(staleResult.code,'not_applied');assert.equal(staleResult.serverCode,'VERSION_CONFLICT');
  journal.complete(context,journal.reject(context,stale,staleResult.serverCode));
  record('stale-version-does-not-change-state-or-create-receipt',(await detail()).rowVersion===6
    &&(await pool.query('SELECT * FROM roomqc_control.control_commands WHERE idempotency_key=$1',[stale.request.key])).rowCount===0);
  record('historical-receipt-is-stable-after-later-commands',JSON.stringify(await client.clusterCommandResult(identity,saved.request))===JSON.stringify(receipt));
  const denied=await originalFetch(origin+'/api/control/admin/clusters/cluster-a/commands',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,
    'Content-Type':'application/json','Idempotency-Key':randomUUID(),Origin:'https://wrong.invalid'},body:JSON.stringify({operation:'close_admission',expectedVersion:6,reason,payload:{}})});
  record('real-http-rejects-wrong-origin-without-command',denied.status===403&&(await detail()).rowVersion===6);
  record('all-operations-preserve-customer-binding-data-and-do-not-create-jobs',await workspaceSnapshot()===beforeWorkspace
    &&(await pool.query('SELECT * FROM roomqc_control.provisioning_jobs')).rowCount===0&&journal.list(context).length===0);
  stage='source';record('frontend-and-backend-source-unchanged',JSON.stringify(await hashes())===JSON.stringify(source)
    &&JSON.stringify(await captureBackendSourceBinding(root))===JSON.stringify(backend));
}catch(error){failure={stage,code:/^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'CONTROL_CLUSTER_CLIENT_TEST_FAILED'};process.exitCode=1;
}finally{
  globalThis.fetch=originalFetch;
  if(relay){relay.closeAllConnections();await new Promise(resolve=>relay.close(resolve));}
  if(runtime)await runtime.shutdown();else if(store&&!store.pool.ending)await store.close();if(pool)await pool.end();
  if(created){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['roomqc.control-cluster-client'],run);docker(['rm','-f',name]);
    cleanupVerified=['container','volume','network'].every(kind=>docker(kind==='container'?['ps','-a','--filter','label='+label,'--format','{{.ID}}']:[kind,'ls','--filter','label='+label,'--format','{{.ID}}']).trim()==='');}
  const result={schemaVersion:1,run,startedAtUtc,finishedAtUtc:new Date().toISOString(),type:'compiled_cluster_commands_journal_real_http_directory',
    verified:!failure&&cleanupVerified,checks,failure,cleanupVerified,source,backendSource:{sha256:backend.sha256,files:backend.files.length},
    scope:{realHttp:true,wireResponseLossAfterCommit:true,realDirectoryDatabase:true,leastPrivilegeRuntimeRole:true,compiledProductionClient:true,compiledJournal:true,
      defaultWebTransport:true,browserOriginShim:true,syntheticAuthorityAdapter:true,syntheticHealthAndReleaseFixture:true,liveSupabaseAuth:false,browserAndroid:false},
    acceptance:{productAccepted:false,reviewer:null,signoff:null},limitations:['Authority, release and health are synthetic fixture inputs; journal uses a Storage-compatible in-memory adapter.',
      'No main/business database mutation, provider operations, Linux VPS, browser/Android, workload capacity or product acceptance.']};
  await writeFile(new URL('../'+artifact,import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({event:failure?'control_cluster_client_failed':'control_cluster_client_completed',artifact,run,verified:result.verified,
    checks:checks.length,passed:checks.filter(c=>c.passed).length,cleanupVerified,failure}));
}
