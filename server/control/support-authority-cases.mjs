import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ControlStore,ControlError} from './store.mjs';
import {clusterCommand} from './admin.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {startControl} from './server.mjs';
import {fixtureSupportAuthorizer} from './support-authority-fixtures.mjs';

export function registerSupportAuthorityCases({dbtest,database,password,cluster,pools}){
 let number=0;
 const actor={id:randomUUID(),clusterId:cluster.id};
 const command=()=>clusterCommand({operation:'close_admission',expectedVersion:1,reason:'Owned live authority test',payload:{}},randomUUID(),cluster.id);
 async function fixture(){
  const name='support_authority_'+(++number),{pool,url}=await database(name);
  await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
  await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const target=new URL(url);target.username=name;const store=new ControlStore(fixtureConfig(target.href,[cluster]));pools.push(store.pool);
  const snapshot=async()=>Object.fromEntries(await Promise.all(['clusters','cluster_policies','control_commands','cluster_events']
   .map(async table=>[table,(await pool.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t ORDER BY to_jsonb(t)::text')).rows])));
  return {pool,store,snapshot};
 }
 async function waiting(pool,key){
  for(let n=0;n<300;n++){
   if((await pool.query(`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted
    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,[key])).rowCount)return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }throw Error('SUPPORT_AUTHORITY_BARRIER_NOT_OBSERVED');
 }
 const denied=()=>{throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Revoked owned fixture authority')};
 dbtest('support live authority: mutation requires a live authorizer even for an apparently valid actor',async()=>{
  const f=await fixture(),before=await f.snapshot();
  await assert.rejects(()=>f.store.admin.execute(actor,command(),randomUUID()),{code:'SUPPORT_AUTHORITY_REQUIRED'});
  assert.deepEqual(await f.snapshot(),before);
 });
 dbtest('support live authority: revoke while waiting for directory lock denies mutation with zero effects',async()=>{
  const f=await fixture(),before=await f.snapshot(),holder=await f.pool.connect();let allowed=true,pending;
  try{
   await holder.query('SELECT pg_advisory_lock(727001)');
   pending=f.store.admin.execute(actor,command(),randomUUID(),undefined,fixtureSupportAuthorizer(actor,async()=>allowed?actor:denied()))
    .then(value=>({value}),error=>({error}));
   await waiting(f.pool,727001);allowed=false;
  }finally{await holder.query('SELECT pg_advisory_unlock(727001)');holder.release()}
  const result=await pending;assert.equal(result.error?.code,'SUPPORT_ADMIN_REQUIRED');assert.deepEqual(await f.snapshot(),before);
 });
 dbtest('support live authority: revoke during final audit rolls back policy, version, command and event',async()=>{
  const f=await fixture(),before=await f.snapshot(),key=738201,holder=await f.pool.connect();let allowed=true,pending;
  await f.pool.query(`CREATE FUNCTION roomqc_control.owned_authority_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
   CREATE TRIGGER owned_authority_barrier BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_authority_barrier()`);
  try{
   await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=f.store.admin.execute(actor,command(),randomUUID(),undefined,fixtureSupportAuthorizer(actor,async()=>allowed?actor:denied()))
    .then(value=>({value}),error=>({error}));
   await waiting(f.pool,key);allowed=false;
  }finally{await holder.query('SELECT pg_advisory_unlock($1)',[key]);holder.release()}
  const result=await pending;assert.equal(result.error?.code,'SUPPORT_ADMIN_REQUIRED');assert.deepEqual(await f.snapshot(),before);
 });
 dbtest('support live authority: COMMIT lock timeout rolls back and same-key recovery succeeds',async()=>{
  const f=await fixture(),before=await f.snapshot(),key=738202,holder=await f.pool.connect(),input=command();let pending,result,timer;
  await f.pool.query(`CREATE FUNCTION roomqc_control.owned_commit_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
   CREATE CONSTRAINT TRIGGER owned_commit_barrier AFTER INSERT ON roomqc_control.cluster_events
   DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_commit_barrier()`);
  const started=Date.now();
  try{
   await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor)).then(value=>({value}),error=>({error}));
   await waiting(f.pool,key);
   // A harness deadline releases only this fixture's blocker in finally. It
   // must fail the test, never masquerade as product-side cancellation.
   result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({harnessTimedOut:true}),7500)})]);
  }finally{
   clearTimeout(timer);await holder.query('SELECT pg_advisory_unlock($1)',[key]);holder.release();
   if(pending)await pending;
  }
  assert.equal(result?.harnessTimedOut,undefined,'COMMIT did not finish before the harness observation deadline');
  assert.equal(result.error?.code,'55P03','COMMIT lock wait must be canceled by PostgreSQL lock_timeout');
  assert(Date.now()-started<7500,'COMMIT lock wait must be bounded without releasing the blocker');
  assert.deepEqual(await f.snapshot(),before);
  assert.equal((await f.store.pool.query('SHOW lock_timeout')).rows[0].lock_timeout,'0','SET LOCAL must not leak to the next pooled request');
  // Directory-only timeout recovery: this explicit provider double supplies a
  // fresh receipt. Actual Auth's expired-attempt recovery has separate native
  // coverage and must not be inferred from this transaction test.
  const receipt=await f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor));
  assert.equal(receipt.status,'succeeded');
  const recovered=await f.snapshot();
  assert.equal(recovered.control_commands.length,before.control_commands.length+1);
  assert.equal(recovered.cluster_events.length,before.cluster_events.length+1);
  assert.equal((await f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor))).commandId,receipt.commandId);
  assert.deepEqual(await f.snapshot(),recovered);
 });
 dbtest('support live authority: positive replay is immutable and a changed actor is denied',async()=>{
  const f=await fixture(),input=command(),receipt=await f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor)),saved=await f.snapshot();
  assert.equal((await f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor))).commandId,receipt.commandId);
  await assert.rejects(()=>f.store.admin.execute(actor,input,randomUUID(),undefined,async()=>({...actor,id:randomUUID()})),{code:'SUPPORT_ACTOR_CHANGED'});
  assert.deepEqual(await f.snapshot(),saved);
 });
 for(const kind of ['command-result','admin-list'])dbtest('support live authority: HTTP '+kind+' rechecks authority after a blocked read',async()=>{
  const f=await fixture(),input=command();let allowed=true,runtime,holder,pending;
  await f.store.admin.execute(actor,input,randomUUID(),undefined,fixtureSupportAuthorizer(actor));
  const before=await f.snapshot();
  runtime=await startControl(f.store.config,{store:f.store,gateway:{supportActor:async()=>allowed?actor:denied()}});
  const target='http://127.0.0.1:'+runtime.server.address().port+'/api/control/admin/clusters'
   +(kind==='command-result'?'/'+cluster.id+'/command-result?operation=close_admission':'?limit=25');
  const read=()=>fetch(target,{signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer owned-fixture',
   ...(kind==='command-result'?{'idempotency-key':input.key}:{})}});
  try{try{
   assert.equal((await read()).status,200);
   holder=await f.pool.connect();await holder.query('BEGIN');
   const table=kind==='command-result'?'control_commands':'clusters';
   await holder.query('LOCK TABLE roomqc_control.'+table+' IN ACCESS EXCLUSIVE MODE');pending=read();
   let observed=false;for(let n=0;n<300;n++){
    observed=(await f.pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
     AND relation=$1::regclass AND NOT granted) AS waiting`,['roomqc_control.'+table])).rows[0].waiting;
    if(observed)break;await new Promise(resolve=>setTimeout(resolve,10));
   }assert.equal(observed,true,'HTTP read must actually wait in PostgreSQL before revocation');allowed=false;
  }finally{
   if(holder){try{await holder.query('ROLLBACK')}finally{holder.release()}}
  }
   assert.equal((await pending).status,403,'Revoked actor must not receive a result read after the wait');
   assert.deepEqual(await f.snapshot(),before);
  }finally{await runtime.shutdown()}
 });
}
