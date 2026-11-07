// Directory-only fixtures: live authority and receipts are explicit doubles.
// Canonical Auth/HTTP expiry and process restart have separate native proof.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {ControlStore,ControlError} from './store.mjs';
import {reconcileSupport,supportReconcileResult} from './support.mjs';
import {fixtureSupportAuthorizer,fixtureSupportGateway} from './support-authority-fixtures.mjs';
import {startControl} from './server.mjs';
export function registerSupportLegacyCases({dbtest,database,password,cluster,pools,run}){
 let sequence=0;
 async function fixture(t){
  const name='support_legacy_'+(++sequence),{pool,url}=await database(name);
  await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
  const role=name+'_'+run;await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const target=new URL(url);target.username=role;const config={...fixtureConfig(target.href,[cluster]),poolMax:1};
  const api=new ControlStore(config);pools.push(api.pool);
  t.after(async()=>{
   for(const p of [api.pool,pool]){if(!p.ending)await p.end();const index=pools.indexOf(p);if(index>=0)pools.splice(index,1)}
  });
  const user={id:randomUUID(),session_id:randomUUID(),email:'legacy-'+sequence+'@example.invalid',email_confirmed_at:new Date().toISOString()};
  const reserved=await api.reserve({slug:'legacy-owned-'+sequence,email:user.email,displayName:'Owned legacy fixture'},randomUUID());
  const workspace=await api.beginProvision(reserved,user,randomUUID());
  const binding={workspace_id:workspace.id,owner_id:user.id,tenant_id:randomUUID(),hotel_id:randomUUID()};
  const actor={id:randomUUID(),clusterId:cluster.id},authorize=fixtureSupportAuthorizer(actor);let available=true,allowed=true,probes=0;
  const gateway=fixtureSupportGateway({supportActor:async()=>{
   if(!allowed)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Owned revoked actor');return actor;
  },binding:async()=>{probes++;if(!available)throw Error('Owned unavailable remote');return binding}});
  const body={query:workspace.slug,workspaceId:workspace.id,routingVersion:workspace.routing_version,reason:'Owned stable legacy command'},key=randomUUID();
  const execute=(input=body,requestKey=key,auth=authorize)=>reconcileSupport(api,gateway,actor,input,randomUUID(),auth,requestKey);
  const counts=async()=>Object.fromEntries(await Promise.all(['support_actions','attempts','support_command_intents','support_command_attempts',
   'support_attempt_closures','support_command_acceptances','support_intent_results'].map(async table=>
    [table,Number((await pool.query('SELECT count(*) AS n FROM roomqc_control.'+table+(table==='attempts'?" WHERE outcome='active'":''))).rows[0].n)])));
  return {pool,api,config,actor,authorize,gateway,workspace,binding,body,key,execute,counts,probes:()=>probes,
   available:v=>available=v,allowed:v=>allowed=v};
 }
 dbtest('legacy support: eight same-key requests with poolMax1 keep one action, binding, attempt and result',async t=>{
  const f=await fixture(t),results=await Promise.all(Array.from({length:8},()=>f.execute()));
  for(const result of results)assert.deepEqual(result,results[0]);const before=await f.counts(),probes=f.probes();
  assert.deepEqual(before,{support_actions:1,attempts:1,support_command_intents:1,support_command_attempts:1,
   support_attempt_closures:0,support_command_acceptances:1,support_intent_results:1});
  f.available(false);assert.deepEqual(await f.execute(),results[0]);assert.equal(f.probes(),probes);
  assert.deepEqual(await supportReconcileResult(f.api,f.actor,f.workspace.id,f.key),results[0]);
  await assert.rejects(()=>f.execute({...f.body,reason:'Different original content'}),{code:'IDEMPOTENCY_CONFLICT'});
  assert.equal(await supportReconcileResult(f.api,{...f.actor,id:randomUUID()},f.workspace.id,f.key),null);
  await assert.rejects(()=>f.api.activate(f.workspace,f.binding,randomUUID(),results[0].actionId,{actor:f.actor,authorize:f.authorize}),{code:'SUPPORT_INTENT_REQUIRED'});
  assert.deepEqual(await f.counts(),before);
 });
 dbtest('legacy support: failed final audit rolls back activation but retains one durable action and intent for same-key recovery',async t=>{
  const f=await fixture(t);
  await f.pool.query(`CREATE FUNCTION roomqc_control.owned_legacy_audit_fail() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN RAISE EXCEPTION 'OWNED_LEGACY_AUDIT_FAILURE' USING ERRCODE='22012';END $$;
   CREATE TRIGGER owned_legacy_audit_fail BEFORE UPDATE ON roomqc_control.support_actions
   FOR EACH ROW WHEN(NEW.outcome='reconciled') EXECUTE FUNCTION roomqc_control.owned_legacy_audit_fail()`);
  try{await assert.rejects(()=>f.execute(),{code:'22012'})}finally{
   await f.pool.query('DROP TRIGGER owned_legacy_audit_fail ON roomqc_control.support_actions;DROP FUNCTION roomqc_control.owned_legacy_audit_fail()');
  }
  const original=(await f.pool.query('SELECT * FROM roomqc_control.support_actions')).rows[0];assert.equal(original.outcome,'failed');
  assert.equal((await f.pool.query('SELECT status FROM roomqc_control.workspaces WHERE id=$1',[f.workspace.id])).rows[0].status,'provisioning');
  const before=await f.counts();assert.equal(before.support_command_intents,1);assert.equal(before.support_intent_results,0);assert.equal(before.attempts,0);
  const result=await f.execute();assert.equal(result.actionId,original.id);
  assert.equal((await f.counts()).support_actions,1);assert.equal((await f.counts()).attempts,1);
 });
 dbtest('legacy support: explicit expiry double links one recovery round while generic503 preserves its original round',async t=>{
  const f=await fixture(t),auth=fixtureSupportAuthorizer(f.actor),accept=auth.acceptCommand;let calls=0;
  auth.acceptCommand=scope=>{if(++calls===1)throw new ControlError(503,'SUPPORT_ACCEPTANCE_EXPIRED','Owned expiry double');return accept(scope)};
  const result=await f.execute(f.body,f.key,auth),counts=await f.counts();assert.equal(result.success,true);
  assert.equal(counts.support_command_attempts,2);assert.equal(counts.support_attempt_closures,1);assert.equal(counts.attempts,1);
  const key=randomUUID(),unavailable=fixtureSupportAuthorizer(f.actor);
  unavailable.acceptCommand=()=>{throw new ControlError(503,'CLUSTER_UNAVAILABLE','Owned network unknown')};
  await assert.rejects(()=>f.execute(f.body,key,unavailable),{code:'CLUSTER_UNAVAILABLE'});
  const intent=(await f.pool.query('SELECT id FROM roomqc_control.support_command_intents WHERE request_key=$1',[key])).rows[0];
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM roomqc_control.support_command_attempts WHERE intent_id=$1',[intent.id])).rows[0].n,1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM roomqc_control.support_attempt_closures WHERE intent_id=$1',[intent.id])).rows[0].n,0);
 });
 dbtest('legacy support HTTP: original-key result/replay require current authority and missing keys cannot create an action',async t=>{
  const f=await fixture(t),runtime=await startControl(f.config,{store:f.api,gateway:f.gateway});
  const base='http://127.0.0.1:'+runtime.server.address().port+'/api/control/support';
  const headers={Authorization:'Bearer owned-admin',Origin:f.config.publicOrigin,'Content-Type':'application/json'};
  const post=(key=f.key,body=f.body)=>fetch(base+'/reconcile',{method:'POST',headers:{...headers,...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
  const read=()=>fetch(base+'/reconcile-result?workspaceId='+f.workspace.id,{headers:{...headers,'Idempotency-Key':f.key}});
  try{
   assert.equal((await post(null)).status,400);assert.equal((await f.counts()).support_actions,0);
   assert.equal((await read()).status,404,'Missing result is unknown and must not create another action');
   for(const query of ['', '?workspaceId='+f.workspace.id+'&workspaceId='+f.workspace.id,
    '?workspaceId='+f.workspace.id+'&actorId='+f.actor.id,'?workspaceId=invalid']){
    assert.equal((await fetch(base+'/reconcile-result'+query,{headers:{...headers,'Idempotency-Key':f.key}})).status,400);
   }
   assert.equal((await fetch(base+'/reconcile-result?workspaceId='+f.workspace.id,{headers})).status,400);
   assert.equal((await f.counts()).support_actions,0,'Invalid or unknown result reads are effect free');
   const result=await(await post()).json();assert.equal(result.success,true);
   const found=await read();assert.equal(found.status,200);assert.equal(found.headers.get('cache-control'),'no-store');
   assert.equal((await found.json()).actionId,result.actionId);const before=await f.counts();
   f.available(false);assert.equal((await post()).status,200);f.allowed(false);
   assert.equal((await read()).status,403);assert.equal((await post()).status,403);assert.deepEqual(await f.counts(),before);
  }finally{await runtime.shutdown()}
 });
}
