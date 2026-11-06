// Compiled production client/journal, real HTTP and an owned PostgreSQL directory.
// Auth authority and incident input are synthetic; this is not live Auth/browser E2E.
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
import {alertTransaction,syncHealthAlerts} from '../server/control/alerts.mjs';
import {startControl} from '../server/control/server.mjs';
import {captureBackendSourceBinding} from './control-backend-source-binding.mjs';

const require=createRequire(new URL('../server/control/package.json',import.meta.url)),pg=require('pg');
const root=fileURLToPath(new URL('../',import.meta.url)),run=randomBytes(6).toString('hex');
const name='roomqc-alert-client-'+run,label='roomqc.control-alert-client='+run,password=randomBytes(32).toString('hex');
const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1_000_000,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});
const paths=['scripts/test-control-alert-client.mjs','src/lib/control-admin.ts','src/lib/control-http-error.ts',
  'src/lib/control-alert-journal.ts','src/lib/control-admin-routes.ts','src/lib/workspace.ts',
  'src/hooks/super-admin/useControlAdmin.ts','src/hooks/super-admin/useControlAlerts.ts',
  'src/components/super-admin/control/ControlAlertsPanel.tsx','src/pages/admin/InfrastructurePage.tsx'];
const hashes=async()=>Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')})));
const startedAtUtc=new Date().toISOString(),source=await hashes(),backend=await captureBackendSourceBinding(root),checks=[];
const artifact='artifacts/roomqc-control-alert-client-'+run+'-local-2026-10-28.json',originalFetch=globalThis.fetch;
let created=false,pool,store,runtime,relay,stage='compile',failure=null,cleanupVerified=false,dropNextAck=false,upstreamOrigin;
const record=(label,passed,details={})=>{checks.push({label,passed:!!passed,...details});assert.equal(!!passed,true,label)};
try {
  const compiled=await build({absWorkingDir:root,stdin:{contents:"export {createControlAdminClient} from './src/lib/control-admin'; export {createAlertJournal} from './src/lib/control-alert-journal'",resolveDir:root,loader:'ts'},
    bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',define:{'import.meta.env':'{}'}});
  const {createControlAdminClient,createAlertJournal}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  stage='directory';docker(['run','-d','--name',name,'--label',label,'--env','POSTGRES_PASSWORD','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m','-p','127.0.0.1::5432',image]);created=true;
  const info=JSON.parse(docker(['inspect',name]))[0];
  const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
  pool=new pg.Pool({connectionString:databaseUrl,max:2,statement_timeout:10000});
  for(let attempt=0;;attempt++){try{await pool.query('SELECT 1');break}catch{if(attempt>=60)throw new Error('DIRECTORY_NOT_READY');await new Promise(resolve=>setTimeout(resolve,200))}}
  await migrateDirectory(pool);const config=fixtureConfig(databaseUrl);config.signupEnabled=false;
  await importInitialRegistry(pool,config.clusters);await seedOperationalCluster(pool);
  await alertTransaction(pool,db=>syncHealthAlerts(db,'cluster-a',{reasonCodes:['DISK_CRITICAL','INODE_LOW','CPU_HIGH'],sourceGeneration:1},randomUUID()),{lock:true});
  await pool.query(`CREATE ROLE alert_client_runtime LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const apiUrl=new URL(databaseUrl);apiUrl.username='alert_client_runtime';config.databaseUrl=apiUrl.href;
  const actor={actorId:randomUUID(),sessionId:randomUUID()},other={actorId:randomUUID(),sessionId:randomUUID()};
  const sessionFor=identity=>({access_token:'e30.'+Buffer.from(JSON.stringify({sub:identity.actorId,session_id:identity.sessionId})).toString('base64url')+'.synthetic',user:{id:identity.actorId}});
  let session=sessionFor(actor);const tokens=new Map([[session.access_token,actor],[sessionFor(other).access_token,other]]);
  const start=async()=>{store=new ControlStore(config);runtime=await startControl(config,{store,gateway:{supportActor:async token=>{
    const identity=tokens.get(token);if(!identity)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Cần quyền quản trị.');
    return{id:identity.actorId,clusterId:'cluster-a'};
  }}});upstreamOrigin='http://127.0.0.1:'+runtime.server.address().port;};
  await start();
  // An owned relay kills the downstream socket only after the upstream reply
  // has finished, proving that the acknowledgement committed before response loss.
  relay=createServer((req,res)=>{
    const lose=dropNextAck&&req.method==='POST'&&req.url.endsWith('/acknowledge');if(lose)dropNextAck=false;
    const upstream=httpRequest(upstreamOrigin+req.url,{method:req.method,headers:req.headers},reply=>{
      if(lose){reply.resume();reply.on('end',()=>res.destroy());}
      else {res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);}
    });upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+relay.address().port;
  globalThis.fetch=async(url,options)=>{
    if(typeof url==='string'&&url.startsWith('/api/control/')){
      assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');
      // Only the relative URL and browser-supplied Origin need a Node shim.
      const response=await originalFetch(origin+url,{...options,headers:{...options.headers,Origin:config.publicOrigin}});
      assert.equal(response.headers.get('cache-control'),'no-store');return response;
    }return originalFetch(url,options);
  };
  const client=createControlAdminClient({getSession:async()=>({data:{session},error:null})});
  const values=new Map(),storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,
    getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const context={...actor,runtime:origin},journal=createAlertJournal(()=>storage),reason='Đang kiểm tra ổ dữ liệu';
  const admission=async()=>JSON.stringify((await pool.query('SELECT status,row_version FROM roomqc_control.clusters ORDER BY id')).rows)
    +JSON.stringify((await pool.query('SELECT * FROM roomqc_control.cluster_policies ORDER BY cluster_id')).rows);
  const beforeAdmission=await admission();stage='http-journal';
  const list=await client.alerts(actor,{state:'open'});
  record('compiled-client-parses-real-alert-page-and-filter',list.items.length===3&&list.items.every(a=>!a.acknowledgedAt));
  record('runtime-api-role-is-not-superuser',(await store.pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper===false);
  const entry=journal.prepare(context,{target:list.items[0].id,expectedVersion:1,reason});dropNextAck=true;
  await assert.rejects(()=>client.acknowledgeAlert(actor,entry.request),{code:'outcome_unknown'});
  record('wire-response-loss-retains-prepared-command-after-commit',journal.list(context).length===1
    &&(await pool.query('SELECT acknowledged_at FROM roomqc_control.alerts WHERE id=$1',[entry.request.target])).rows[0].acknowledged_at!==null);
  await runtime.shutdown();runtime=null;await start();
  const resumed=createAlertJournal(()=>storage),saved=resumed.list({...context,sessionId:randomUUID()})[0];
  // Same actor, new session can recover through the server; no owner token is stored.
  session=sessionFor({...actor,sessionId:randomUUID()});tokens.set(session.access_token,actor);
  const renewed={actorId:actor.actorId,sessionId:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id};
  const receipt=await client.alertAcknowledgement(renewed,saved.request);resumed.complete({...context,...renewed},saved);
  record('restart-and-relogin-recover-original-receipt-without-post',receipt.targetVersion===2&&resumed.list(context).length===0);
  assert.deepEqual(await client.acknowledgeAlert(renewed,saved.request),receipt);
  record('same-key-replay-does-not-duplicate-ack-event-outbox-command',
    (await pool.query("SELECT * FROM roomqc_control.control_commands WHERE operation='acknowledge_alert'")).rowCount===1
    &&(await pool.query("SELECT * FROM roomqc_control.alert_events WHERE transition='acknowledged'")).rowCount===1
    &&(await pool.query("SELECT o.* FROM roomqc_control.alert_outbox o JOIN roomqc_control.alert_events e ON e.id=o.event_id WHERE e.transition='acknowledged'")).rowCount===1);
  await assert.rejects(()=>client.acknowledgeAlert(renewed,{...saved.request,reason:'Khác nội dung đã gửi'}),{code:'outcome_unknown'});
  record('key-body-conflict-cannot-claim-success',true);
  session=sessionFor(other);await assert.rejects(()=>client.alertAcknowledgement(other,saved.request),{code:'result_absent'});
  record('result-and-journal-are-actor-scoped',resumed.list({...context,...other}).length===0);session=sessionFor(renewed);
  const rejected=resumed.prepare(context,{target:list.items[1].id,expectedVersion:99,reason});
  const rejection=await client.acknowledgeAlert(renewed,rejected.request).catch(error=>error);
  assert.equal(rejection.code,'not_applied');assert.equal(rejection.serverCode,'VERSION_CONFLICT');
  const notApplied=resumed.reject(context,rejected,rejection.serverCode);resumed.complete(context,notApplied);
  record('serialized-version-rejection-creates-no-command',
    (await pool.query('SELECT * FROM roomqc_control.control_commands WHERE idempotency_key=$1',[rejected.request.key])).rowCount===0);
  const absent=resumed.prepare(context,{target:list.items[2].id,expectedVersion:1,reason});
  await assert.rejects(()=>client.alertAcknowledgement(renewed,absent.request),{code:'result_absent'});
  assert.deepEqual(resumed.list(context),[absent]);
  const retried=await client.acknowledgeAlert(renewed,absent.request);resumed.complete(context,absent);
  record('lookup-404-keeps-original-key-for-explicit-retry',retried.targetVersion===2&&resumed.list(context).length===0);
  await alertTransaction(pool,db=>syncHealthAlerts(db,'cluster-a',{reasonCodes:[],sourceGeneration:2},randomUUID()),{lock:true});
  record('old-receipt-stays-immutable-after-incident-recovery',JSON.stringify(await client.alertAcknowledgement(renewed,saved.request))===JSON.stringify(receipt));
  const denied=await originalFetch(origin+'/api/control/admin/alerts/'+saved.request.target+'/acknowledge',{
    method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json','Idempotency-Key':randomUUID(),Origin:'https://wrong.invalid'},
    body:JSON.stringify({expectedVersion:2,reason})});record('real-http-rejects-untrusted-origin',denied.status===403);
  record('acknowledgements-and-recovery-do-not-alter-admission-or-provision-business-data',await admission()===beforeAdmission
    &&(await pool.query('SELECT * FROM roomqc_control.workspaces')).rowCount===0
    &&(await pool.query('SELECT * FROM roomqc_control.provisioning_jobs')).rowCount===0);
  stage='source';record('frontend-and-backend-source-unchanged',JSON.stringify(await hashes())===JSON.stringify(source)
    &&JSON.stringify(await captureBackendSourceBinding(root))===JSON.stringify(backend));
}catch(error){failure={stage,code:/^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'CONTROL_ALERT_CLIENT_TEST_FAILED'};process.exitCode=1;
}finally{
  globalThis.fetch=originalFetch;
  if(relay){relay.closeAllConnections();await new Promise(resolve=>relay.close(resolve));}
  if(runtime)await runtime.shutdown();else if(store&&!store.pool.ending)await store.close();
  if(pool)await pool.end();
  if(created){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['roomqc.control-alert-client'],run);docker(['rm','-f',name]);
    cleanupVerified=['container','volume','network'].every(kind=>docker(kind==='container'?['ps','-a','--filter','label='+label,'--format','{{.ID}}']:[kind,'ls','--filter','label='+label,'--format','{{.ID}}']).trim()==='');}
  const result={schemaVersion:1,run,startedAtUtc,finishedAtUtc:new Date().toISOString(),type:'compiled_alert_client_journal_real_http_directory',
    verified:!failure&&cleanupVerified,checks,failure,cleanupVerified,source,backendSource:{sha256:backend.sha256,files:backend.files.length},
    scope:{realHttp:true,wireResponseLossAfterCommit:true,realDirectoryDatabase:true,leastPrivilegeRuntimeRole:true,compiledProductionClient:true,
      compiledJournal:true,defaultWebTransport:true,browserOriginShim:true,syntheticAuthorityAdapter:true,syntheticIncidentInput:true,liveSupabaseAuth:false,browserAndroid:false},
    acceptance:{productAccepted:false,reviewer:null,signoff:null},limitations:['Authority and incident input are synthetic; journal uses a Storage-compatible in-memory adapter.',
      'No primary/business database mutation, provider notifications, Linux VPS, browser/Android, load, offsite restore or pilot acceptance.']};
  await writeFile(new URL('../'+artifact,import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({event:failure?'control_alert_client_failed':'control_alert_client_completed',artifact,run,verified:result.verified,
    checks:checks.length,passed:checks.filter(c=>c.passed).length,cleanupVerified,failure}));
}
