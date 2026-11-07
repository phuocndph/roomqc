import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {ControlStore,ControlError} from './store.mjs';
import {WorkspaceRecheckStore,workspaceRecheckCommand,readWorkspaceRecheckSnapshot} from './setup-recheck.mjs';
import {setupBackfillFingerprint} from './setup-backfill.mjs';
import {adminRead} from './admin-read.mjs';
import {startControl} from './server.mjs';
import {fixtureSupportAuthorizer,fixtureSupportGateway} from './support-authority-fixtures.mjs';

export function registerSetupRecheckCases({dbtest,database,config,cluster,pools,run,password}){
 let sequence=0;
 async function fixture(){
  const n=++sequence,{pool,url}=await database('setup_recheck_'+n);
  await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
  const role='setup_recheck_'+run+'_'+n;await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const target=new URL(url);target.username=role;
  const cfg={...config(target.href),setupDispatchEnabled:true},api=new ControlStore(cfg);pools.push(api.pool);
  const actor={id:randomUUID(),clusterId:cluster.id},authorize=fixtureSupportAuthorizer(actor),receipts=new Map();let hook=null,reads=0;
  const gateway=fixtureSupportGateway({binding:async w=>{reads++;if(hook)await hook(w);const r=receipts.get(w.id);if(r instanceof Error)throw r;return r??null},supportActor:authorize});
  async function workspace(label){
   const user={id:randomUUID(),session_id:randomUUID(),email:label+'@example.invalid',email_confirmed_at:new Date().toISOString()};
   const reserved=await api.reserve({slug:'recheck-'+label,email:user.email,displayName:'Private owner '+label},randomUUID());
   return {...await api.setup.begin(reserved,user,{hotelName:'Private hotel '+label,totalRooms:3},randomUUID()),user};
  }
  const command=async(w,key=randomUUID())=>{
   const s=await readWorkspaceRecheckSnapshot(api.pool,w.workspace.id,cluster.id);
   return workspaceRecheckCommand(w.workspace.id,{expectedVersion:s.workspace.routing_version,expectedSnapshotSha256:setupBackfillFingerprint(s),reason:'Inspect owned registration'},key);
  };
  async function terminal(w,state='committed'){
   const r={workspace_id:w.workspace.id,owner_id:w.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()};
   await pool.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state=$2,tenant_id=$3,hotel_id=$4,settled_at=clock_timestamp() WHERE id=$1`,
    [w.dispatch.id,state,state==='committed'?r.tenant_id:null,state==='committed'?r.hotel_id:null]);
   if(state==='committed')receipts.set(w.workspace.id,r);return r;
  }
  const execute=(c,a=actor,auth=async()=>a)=>api.rechecks.execute(a,c,randomUUID(),gateway,fixtureSupportAuthorizer(a,auth));
  const snapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','setup_recovery_attempts',
   'workspace_recheck_commands','workspace_recheck_cycles','workspace_recheck_events'].map(async t=>[t,(await pool.query(`SELECT * FROM roomqc_control.${t} ORDER BY 1`)).rows])));
  return {pool,api,cfg,actor,authorize,gateway,workspace,command,terminal,execute,snapshot,receipts,hook:fn=>hook=fn,reads:()=>reads};
 }

 dbtest('T12 workspace recheck: API role is bounded and same-key concurrent replay records one command and audit',async()=>{
  const f=await fixture(),w=await f.workspace('replay'),c=await f.command(w),before=await f.snapshot();
  for(const sql of ['CREATE TABLE roomqc_control.forbidden(id int)','DELETE FROM roomqc_control.workspace_recheck_commands',
   'DELETE FROM roomqc_control.workspace_recheck_events',"UPDATE roomqc_control.workspace_recheck_cycles SET max_attempts=30"])
   await assert.rejects(()=>f.api.pool.query(sql),{code:'42501'});
  const results=await Promise.all(Array.from({length:4},()=>f.execute(c)));results.forEach(r=>assert.deepEqual(r,results[0]));
  assert.equal(results[0].outcome,'reused_job');const after=await f.snapshot();
  for(const t of ['workspaces','provisioning_jobs','setup_dispatches'])assert.deepEqual(after[t],before[t]);
  assert.equal(after.workspace_recheck_commands.length,1);assert.equal(after.workspace_recheck_events.length,1);
  await assert.rejects(()=>f.pool.query('DELETE FROM roomqc_control.workspace_recheck_commands'),{code:'42501'});
  await assert.rejects(()=>f.pool.query("UPDATE roomqc_control.workspace_recheck_events SET outcome='fake'"),{code:'42501'});
 });

 dbtest('T12 workspace recheck: committed activation has durable actor-scoped lookup even after state drift and remote outage',async()=>{
  const f=await fixture(),w=await f.workspace('activate');await f.terminal(w);const c=await f.command(w),r=await f.execute(c);
  assert.equal(r.outcome,'activated');const before=await f.snapshot(),reads=f.reads();
  assert.equal(before.workspaces[0].status,'active');assert.equal(before.provisioning_jobs[0].state,'succeeded');
  f.receipts.set(w.workspace.id,new Error('private provider message'));
  assert.deepEqual(await f.execute(c),r);assert.equal(f.reads(),reads);
  assert.deepEqual(await f.api.rechecks.lookup(f.actor,{target:c.target,key:c.key},f.authorize),r);
  const other={...f.actor,id:randomUUID()};
  await assert.rejects(()=>f.api.rechecks.lookup(other,{target:c.target,key:c.key},async()=>other),{code:'WORKSPACE_RECHECK_RESULT_UNKNOWN'});
  await assert.rejects(()=>f.execute({...c,payloadHash:'b'.repeat(64)}),{code:'WORKSPACE_RECHECK_KEY_CONFLICT'});
  await assert.rejects(()=>f.api.rechecks.lookup(f.actor,{target:c.target,key:c.key},async()=>({...f.actor,id:randomUUID()})),{code:'SUPPORT_ACTOR_CHANGED'});
  assert.deepEqual(await f.snapshot(),before);assert.ok(!JSON.stringify(r).includes(w.user.id));
 });

 dbtest('T12 workspace recheck: same-key commit between optimistic lookup and stale preflight must replay before rejecting',async()=>{
  const f=await fixture(),w=await f.workspace('preflight');await f.terminal(w);const c=await f.command(w);let original,inserted=false;
  const proxy={query:async(...args)=>{const result=await f.api.pool.query(...args);
   if(!inserted&&String(args[0]).includes('SELECT payload_hash,result')){inserted=true;original=await f.execute(c)}return result},connect:()=>f.api.pool.connect()};
  const retry=new WorkspaceRecheckStore({pool:proxy,config:f.cfg});
  assert.deepEqual(await retry.execute(f.actor,c,randomUUID(),f.gateway,f.authorize),original);
  assert.equal((await f.snapshot()).workspace_recheck_commands.length,1);
 });

 dbtest('T12 workspace recheck: remote-read microsecond drift fails CAS without partial mutations',async()=>{
  const f=await fixture(),w=await f.workspace('drift');await f.terminal(w);const c=await f.command(w);
  f.hook(async()=>f.pool.query("UPDATE roomqc_control.workspaces SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[w.workspace.id]));
  await assert.rejects(()=>f.execute(c),{code:'WORKSPACE_SNAPSHOT_CHANGED'});
  const s=await f.snapshot();assert.equal(s.workspaces[0].status,'provisioning');assert.equal(s.provisioning_jobs[0].state,'queued');
  assert.equal(s.workspace_recheck_commands.length,0);assert.equal(s.workspace_recheck_events.length,0);
 });

 dbtest('T12 workspace recheck: missing generic conflicting and unavailable receipts never create business data',async()=>{
  const f=await fixture();
  for(const [label,receipt,outcome]of [['missing',null,'reused_job'],['generic','match','reused_job'],['conflict','conflict','needs_review'],['offline',new Error('private'),'unavailable']]){
   const w=await f.workspace(label);
   if(receipt)f.receipts.set(w.workspace.id,receipt instanceof Error?receipt:{workspace_id:w.workspace.id,owner_id:receipt==='conflict'?randomUUID():w.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()});
   const before=await f.snapshot(),r=await f.execute(await f.command(w)),after=await f.snapshot();
   assert.equal(r.outcome,outcome);for(const t of ['workspaces','provisioning_jobs','setup_dispatches'])assert.deepEqual(after[t],before[t]);
  }
 });

 dbtest('T12 workspace recheck: closed proof waits for owner and protected terminal jobs are not reopened',async()=>{
  const f=await fixture(),w=await f.workspace('closed');await f.terminal(w,'closed');
  assert.equal((await f.execute(await f.command(w))).outcome,'waiting_owner');
  assert.equal((await f.snapshot()).workspaces[0].status,'provisioning');
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='cancelled' WHERE workspace_id=$1",[w.workspace.id]);
  const before=await f.snapshot();assert.equal((await f.execute(await f.command(w))).reasonCode,'SETUP_JOB_TERMINAL_PROTECTED');
  assert.deepEqual((await f.snapshot()).provisioning_jobs,before.provisioning_jobs);
 });

 dbtest('T12 workspace recheck: one bounded recovery cycle preserves exhausted history and cannot extend itself',async()=>{
  const f=await fixture(),w=await f.workspace('budget');
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET attempts=8,deadline_at=created_at+interval '1 millisecond',created_at=created_at-interval '1 day',state='needs_review'");
  const before=await f.snapshot(),r=await f.execute(await f.command(w));assert.equal(r.outcome,'queued');
  let s=await f.snapshot();assert.equal(s.provisioning_jobs.length,2);assert.equal(s.workspace_recheck_cycles.length,1);
  const old=s.provisioning_jobs.find(j=>j.id===before.provisioning_jobs[0].id),next=s.provisioning_jobs.find(j=>j.id===r.jobId);
  assert.equal(old.attempts,8);assert.deepEqual(old.deadline_at,before.provisioning_jobs[0].deadline_at);assert.equal(old.state,'cancelled');
  assert.equal(next.max_attempts,3);assert.equal(next.deadline_at-next.created_at,900000);
  await assert.rejects(()=>f.pool.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,dispatch_id,expected_routing_version)
   VALUES($1,$2,$3,1)`,[randomUUID(),w.workspace.id,w.dispatch.id]),{code:'23505'});
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET attempts=3,state='needs_review' WHERE id=$1",[next.id]);
  const result=await f.execute(await f.command(w));assert.equal(result.reasonCode,'SETUP_RECHECK_BUDGET_EXHAUSTED');
  s=await f.snapshot();assert.equal(s.provisioning_jobs.length,2);assert.equal(s.workspace_recheck_cycles.length,1);
 });

 dbtest('T12 workspace recheck: two actors reuse a held lease and revocation or audit faults roll back all effects',async()=>{
  const f=await fixture(),w=await f.workspace('lease');
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='leased',lease_token=$1,lease_until=clock_timestamp()+interval '1 minute'",[randomUUID()]);
  const c=await f.command(w),before=await f.snapshot(),other={...f.actor,id:randomUUID()};
  const results=await Promise.all([f.execute(c),f.execute(c,other)]);results.forEach(r=>assert.equal(r.outcome,'running'));
  assert.deepEqual((await f.snapshot()).provisioning_jobs,before.provisioning_jobs);
  let checks=0;await assert.rejects(()=>f.execute(awaitableCommand(c),f.actor,async()=>{
   if(++checks>=4)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Revoked fixture actor');return f.actor;
  }),{code:'SUPPORT_ADMIN_REQUIRED'});
  assert.equal((await f.snapshot()).workspace_recheck_commands.length,2);
  await f.pool.query(`CREATE FUNCTION roomqc_control.reject_recheck_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned audit fault';END $$;
   CREATE TRIGGER reject_recheck_event BEFORE INSERT ON roomqc_control.workspace_recheck_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_recheck_event()`);
  const b=await f.snapshot();await assert.rejects(async()=>f.execute(await f.command(w)),{code:'P0001'});assert.deepEqual(await f.snapshot(),b);
 });

 dbtest('T12 workspace recheck: revocation during the final release query denies the commit',async()=>{
  const f=await fixture(),w=await f.workspace('last-authority'),input=await f.command(w),before=await f.snapshot(),key=738221;
  const release=f.api.rechecks.release.bind(f.api.rechecks);let releases=0,allowed=true,pending;
  f.api.rechecks.release=async(...args)=>{if(++releases===3)await args[0].query('SELECT pg_advisory_xact_lock($1)',[key]);return release(...args)};
  const holder=await f.pool.connect();
  try{
   await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=f.execute(input,f.actor,async()=>{if(!allowed)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Revoked fixture actor');return f.actor})
    .then(value=>({value}),error=>({error}));
   let observed=false;for(let n=0;n<300;n++){
    observed=(await f.pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted
     AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS waiting`,[key])).rows[0].waiting;
    if(observed)break;await new Promise(resolve=>setTimeout(resolve,10));
   }assert.equal(observed,true,'Final release query barrier must be observed');allowed=false;
  }finally{await holder.query('SELECT pg_advisory_unlock($1)',[key]);holder.release()}
  const result=await pending;assert.equal(result.error?.code,'SUPPORT_ADMIN_REQUIRED');assert.deepEqual(await f.snapshot(),before);
 });

 dbtest('T12 workspace recheck: runtime signed release mismatch blocks remote reads and activation',async()=>{
  const f=await fixture(),w=await f.workspace('release');await f.terminal(w);const c=await f.command(w),before=await f.snapshot();
  const changed=new WorkspaceRecheckStore({pool:f.api.pool,config:{...f.cfg,releaseValidation:null}});
  const r=await changed.execute(f.actor,c,randomUUID(),f.gateway,f.authorize);assert.equal(r.outcome,'unavailable');assert.equal(f.reads(),0);
  const after=await f.snapshot();assert.deepEqual(after.workspaces,before.workspaces);assert.deepEqual(after.provisioning_jobs,before.provisioning_jobs);
 });

 dbtest('T12 workspace recheck: original owner reply respects the new recovery lease and settles only the current job',async()=>{
  const f=await fixture(),w=await f.workspace('owner-late');
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET attempts=8,state='needs_review'");
  const r=await f.execute(await f.command(w));assert.equal(r.outcome,'queued');
  const old=(await f.snapshot()).provisioning_jobs.find(j=>j.id!==r.jobId);
  const result={dispatch_id:w.dispatch.id,workspace_id:w.workspace.id,owner_id:w.user.id,routing_version:1,
   payload_sha256:w.dispatch.payload_sha256,state:'committed',success:true,tenant_id:randomUUID(),hotel_id:randomUUID()};
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='leased',lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' WHERE id=$1",[r.jobId,randomUUID()]);
  const held=await f.snapshot();await assert.rejects(()=>f.api.setup.settle(w.workspace,w.dispatch,result,randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
  assert.deepEqual(await f.snapshot(),held);
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='queued',lease_token=NULL,lease_until=NULL WHERE id=$1",[r.jobId]);
  await f.api.setup.settle(w.workspace,w.dispatch,result,randomUUID());
  const after=await f.snapshot();assert.equal(after.workspaces[0].status,'active');
  assert.deepEqual(after.provisioning_jobs.find(j=>j.id===old.id),old);assert.equal(after.provisioning_jobs.find(j=>j.id===r.jobId).state,'succeeded');
 });

 dbtest('T12 workspace recheck: final runtime approval drift rolls back activation command and audit',async()=>{
  const f=await fixture(),w=await f.workspace('final-drift');await f.terminal(w);const before=await f.snapshot();let observed=false;
  const command=await f.command(w);
  const release=f.api.rechecks.release.bind(f.api.rechecks);
  f.api.rechecks.release=async(client,snapshot,now)=>{
   // Witness the actual final check after this transaction has recorded its
   // command/audit, rather than assuming a fixed count of Auth observations.
   const row=(await client.query('SELECT id FROM roomqc_control.workspace_recheck_commands WHERE idempotency_key=$1',[command.key])).rows[0];
   if(row){observed=true;f.cfg.releaseValidation=null}
   return release(client,snapshot,now);
  };
  await assert.rejects(()=>f.execute(command),{code:'WORKSPACE_RECHECK_FENCE_EXPIRED'});
  assert.equal(observed,true);assert.deepEqual(await f.snapshot(),before);
 });

 dbtest('T12 workspace recheck: detail uses one read snapshot and releases it before remote observation',async()=>{
  const f=await fixture(),w=await f.workspace('detail'),original=await readWorkspaceRecheckSnapshot(f.api.pool,w.workspace.id,cluster.id);let changed=false,released=false;
  const wrapped={...f.api,pool:{connect:async()=>{const c=await f.api.pool.connect();return {query:async(...args)=>{
   const r=await c.query(...args);if(!changed&&String(args[0]).includes('SELECT w.*,c.api_url')){changed=true;
    await f.pool.query("UPDATE roomqc_control.workspaces SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[w.workspace.id]);}
   return r},release:()=>{released=true;c.release()}}}}};
  const detail=await adminRead(wrapped,'/workspaces/'+w.workspace.id,new URLSearchParams(),{binding:async()=>{assert.equal(released,true);return null}});
  assert.equal(detail.recheck.snapshotSha256,setupBackfillFingerprint(original));assert.equal(detail.workspace.routingVersion,detail.recheck.routingVersion);
  assert.notEqual(setupBackfillFingerprint(await readWorkspaceRecheckSnapshot(f.api.pool,w.workspace.id,cluster.id)),detail.recheck.snapshotSha256);
 });

 dbtest('T12 workspace recheck: real HTTP POST and primary GET recover the same command without effects or query injection',async()=>{
  const f=await fixture(),w=await f.workspace('http'),c=await f.command(w);
  const runtime=await startControl(f.cfg,{store:f.api,gateway:f.gateway});
  try{
   const origin='http://127.0.0.1:'+runtime.server.address().port,path=origin+'/api/control/admin/workspaces/'+c.target;
   const headers={Origin:f.cfg.publicOrigin,'Content-Type':'application/json',Authorization:'Bearer fixture-admin','Idempotency-Key':c.key};
   const response=await fetch(path+'/recheck',{method:'POST',headers,body:JSON.stringify({expectedVersion:c.expectedVersion,expectedSnapshotSha256:c.expectedSnapshotSha256,reason:c.reason})});
   assert.equal(response.status,202);const result=await response.json();assert.equal(result.outcome,'reused_job');
   const before=await f.snapshot(),read=await fetch(path+'/recheck-result',{headers});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');
   const value=await read.json();delete result.requestId;delete value.requestId;assert.deepEqual(value,result);
   assert.equal((await fetch(path+'/recheck-result?key=unsafe',{headers})).status,400);
   assert.deepEqual(await f.snapshot(),before);
  }finally{await runtime.shutdown()}
 });

 dbtest('T12 workspace recheck: populated directory 0017 upgrades concurrently and reruns without changing old data or checksums',async()=>{
  const {pool}=await database('setup_recheck_upgrade'),manifest=await migrationManifest(),dir=await mkdtemp(join(tmpdir(),'roomqc-recheck-upgrade-'));
  try{
   for(const m of manifest.slice(0,17))await writeFile(join(dir,m.version),m.sql);
   await migrateDirectory(pool,{location:pathToFileURL(dir+'/')});await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
   const api=new ControlStore({...config(pool.options.connectionString),setupDispatchEnabled:true});pools.push(api.pool);
   const user={id:randomUUID(),session_id:randomUUID(),email:'upgrade@example.invalid',email_confirmed_at:new Date().toISOString()};
   const w=await api.reserve({slug:'recheck-upgrade',email:user.email,displayName:'Owned upgrade'},randomUUID());
   await api.setup.begin(w,user,{hotelName:'Upgrade hotel',totalRooms:2},randomUUID());
   const snapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','setup_dispatches','provisioning_jobs','attempts'].map(async t=>[t,(await pool.query(`SELECT * FROM roomqc_control.${t} ORDER BY 1`)).rows])));
   const before=await snapshot(),history=(await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows;
   await Promise.all([migrateDirectory(pool),migrateDirectory(pool)]);await migrateDirectory(pool);
   assert.deepEqual(await snapshot(),before);assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows.slice(0,17),history);
   assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.schema_migrations')).rows[0].count,String(manifest.length));
  }finally{await rm(dir,{recursive:true,force:true})}
 });
}
function awaitableCommand(c){return {...c,key:randomUUID()}}
