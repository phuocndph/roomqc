import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ControlStore} from './store.mjs';
import {startControl} from './server.mjs';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';

export function registerSetupDispatchCases({dbtest,database,config,cluster,pools,run,password}){
 let number=0;
 async function fixture(){
  const {pool,url}=await database('setup_dispatch_'+(++number));await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
  await seedOperationalCluster(pool);
  const role='dispatch_api_'+run+'_'+number;await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const runtimeUrl=new URL(url);runtimeUrl.username=role;
  const cfg={...config(runtimeUrl.href),setupDispatchEnabled:true},store=new ControlStore(cfg);pools.push(store.pool);
  const user={id:randomUUID(),session_id:randomUUID(),email:'dispatch-'+number+'@example.invalid',email_confirmed_at:new Date().toISOString()};
  const workspace=await store.reserve({slug:'dispatch-fixture',email:user.email,displayName:'Dispatch fixture'},randomUUID());
  const fields={hotelName:'Fixture hotel',tenantName:'Fixture tenant',fullName:'Fixture owner',totalRooms:10};
  const counts=async()=>Object.fromEntries(await Promise.all(['setup_dispatches','provisioning_jobs','attempts'].map(async table=>
   [table,Number((await pool.query('SELECT count(*) FROM roomqc_control.'+table)).rows[0].count)])));
  const begin=()=>store.setup.begin(workspace,user,fields,randomUUID());
  const result=(attempt,state='committed')=>({dispatch_id:attempt.dispatch.id,workspace_id:workspace.id,owner_id:user.id,
   routing_version:attempt.dispatch.routing_version,payload_sha256:attempt.dispatch.payload_sha256,state,success:state==='committed',
   tenant_id:state==='committed'?randomUUID():null,hotel_id:state==='committed'?randomUUID():null,idempotent:false});
  async function http(gateway){
   const runtimeStore=new ControlStore(cfg);pools.push(runtimeStore.pool);
   const runtime=await startControl(cfg,{store:runtimeStore,gateway:{user:async()=>user,binding:async()=>null,...gateway}});
   const endpoint='http://127.0.0.1:'+runtime.server.address().port+'/api/control/workspaces/'+workspace.slug;
   return {runtime,endpoint,post:(body=fields)=>fetch(endpoint+'/provision',{method:'POST',headers:{
    Origin:cfg.publicOrigin,'Content-Type':'application/json',Authorization:'Bearer fixture-owner-token'},body:JSON.stringify(body)})};
  }
  return {pool,store,cfg,user,workspace,fields,counts,begin,result,http};
 }
 const fault=async(pool,table,condition='true')=>{
  await pool.query(`CREATE FUNCTION roomqc_control.setup_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF ${condition} THEN RAISE EXCEPTION 'OWNED_SETUP_FIXTURE_FAULT'; END IF; RETURN NEW; END; $$;
   CREATE TRIGGER setup_fixture_fault BEFORE INSERT ON roomqc_control.${table}
   FOR EACH ROW EXECUTE FUNCTION roomqc_control.setup_fixture_fault()`);
 };
 const clearFault=async(pool,table)=>pool.query(`DROP TRIGGER setup_fixture_fault ON roomqc_control.${table}; DROP FUNCTION roomqc_control.setup_fixture_fault()`);

 dbtest('T12 two HTTP servers and twenty duplicate POSTs persist one dispatch/job before one remote call',async()=>{
  const f=await fixture();let calls=0,enter,release;const entered=new Promise(r=>enter=r),barrier=new Promise(r=>release=r);
  const gateway={provisionSetupDispatch:async(w,u,a)=>{
   calls++;const saved=await f.counts();assert.equal(saved.setup_dispatches,1);assert.equal(saved.provisioning_jobs,1);
   const persisted=(await f.pool.query('SELECT * FROM roomqc_control.setup_dispatches')).rows[0];
   assert.equal(persisted.id,a.dispatch.id);assert.equal(persisted.payload_sha256,a.payloadSha256);
   assert.equal((await f.pool.query('SELECT status,owner_id,expires_at FROM roomqc_control.workspaces')).rows[0].status,'provisioning');
   assert.ok(!JSON.stringify(persisted).includes(u.session_id));assert.ok(!JSON.stringify(persisted).includes('Fixture hotel'));
   enter();await barrier;return f.result(a);
  }};
  const a=await f.http(gateway),b=await f.http(gateway);let first;
  try{
   first=a.post();await entered;
   const duplicates=await Promise.all(Array.from({length:20},()=>b.post()));
   for(const response of duplicates){assert.equal(response.status,202);assert.equal(response.headers.get('Retry-After'),'3');
    const data=await response.json();assert.equal(data.pending,true);assert.equal(data.success,false);
    assert.deepEqual(Object.keys(data).sort(),['pending','requestId','retryAfter','success'])}
   assert.equal(calls,1);assert.equal((await f.counts()).setup_dispatches,1);
   assert.equal((await b.post({...f.fields,hotelName:'Changed while pending'})).status,409);
   release();assert.equal((await first).status,200);
   assert.equal((await f.pool.query('SELECT status FROM roomqc_control.workspaces')).rows[0].status,'active');
   assert.equal((await f.pool.query('SELECT state FROM roomqc_control.provisioning_jobs')).rows[0].state,'succeeded');
  }finally{release();if(first)await first;await a.runtime.shutdown();await b.runtime.shutdown()}
 });

 dbtest('T12 directory job insert failure rolls back dispatch/owner/audit and never calls remote provisioning',async()=>{
  const f=await fixture(),before=await f.counts();await fault(f.pool,'provisioning_jobs');let calls=0;
  const h=await f.http({provisionSetupDispatch:async()=>{calls++;throw new Error('Should not dispatch')}});
  try{
   assert.equal((await h.post()).status,503);assert.equal(calls,0);
   const after=await f.counts();assert.equal(after.setup_dispatches,before.setup_dispatches);assert.equal(after.provisioning_jobs,before.provisioning_jobs);
   assert.equal((await f.pool.query("SELECT count(*) FROM roomqc_control.attempts WHERE outcome='setup_dispatch_started'")).rows[0].count,'0');
   const w=(await f.pool.query('SELECT status,owner_id,expires_at FROM roomqc_control.workspaces')).rows[0];
   assert.equal(w.status,'reserved');assert.equal(w.owner_id,null);assert.ok(w.expires_at);
  }finally{await clearFault(f.pool,'provisioning_jobs');await h.runtime.shutdown()}
 });

 dbtest('T12 lost remote response is recovered after API restart from the same receipt/dispatch without another mutation',async()=>{
  const f=await fixture();let committed=null,calls=0,closeCalls=0;
  const gateway={binding:async()=>committed&&{workspace_id:committed.workspace_id,owner_id:committed.owner_id,tenant_id:committed.tenant_id,hotel_id:committed.hotel_id},
   provisionSetupDispatch:async(w,u,a)=>{calls++;committed=f.result(a);throw new Error('Owned fixture: response lost after commit')},
   closeSetupDispatch:async(w,d)=>{closeCalls++;assert.equal(d.id,committed.dispatch_id);return committed}};
  const first=await f.http(gateway);assert.equal((await first.post()).status,503);await first.runtime.shutdown();
  const after=(await f.pool.query('SELECT * FROM roomqc_control.setup_dispatches')).rows[0];assert.equal(after.terminal_state,null);
  // New store/pool represents a different API process using the same runtime role.
  f.cfg.setupDispatchEnabled=false;
  const nextStore=new ControlStore(f.cfg);pools.push(nextStore.pool);
  const runtime=await startControl(f.cfg,{store:nextStore,gateway});
  try{
   const url='http://127.0.0.1:'+runtime.server.address().port+'/api/control/workspaces/'+f.workspace.slug+'/bootstrap';
   const response=await fetch(url);assert.equal(response.status,200);const body=await response.json();
   assert.equal(body.workspace.status,'active');assert.equal(body.workspace.tenantId,committed.tenant_id);
   assert.equal(calls,1);assert.equal(closeCalls,1);
   assert.equal((await f.pool.query('SELECT state FROM roomqc_control.provisioning_jobs')).rows[0].state,'succeeded');
   assert.equal((await f.counts()).setup_dispatches,1);
  }finally{await runtime.shutdown()}
 });

 dbtest('T12 twenty active retries across two HTTP servers reuse the committed receipt without another remote close or directory write',async()=>{
  const f=await fixture(),a=await f.begin(),result=f.result(a);
  await f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID());
  let closeCalls=0,provisionCalls=0;
  const gateway={binding:async()=>({workspace_id:f.workspace.id,owner_id:f.user.id,tenant_id:result.tenant_id,hotel_id:result.hotel_id}),
   closeSetupDispatch:async()=>{closeCalls++;return {state:'busy'}},
   provisionSetupDispatch:async()=>{provisionCalls++;throw new Error('Must not provision an active workspace')}};
  const first=await f.http(gateway),second=await f.http(gateway),before=await f.counts();
  const saved=(await f.pool.query('SELECT to_jsonb(w) AS value FROM roomqc_control.workspaces w WHERE id=$1',[f.workspace.id])).rows[0].value;
  try{
   const responses=await Promise.all(Array.from({length:20},(_,i)=>(i%2?first:second).post()));
   assert.ok(responses.every(r=>r.status===200));
   const bodies=await Promise.all(responses.map(r=>r.json()));
   assert.ok(bodies.every(b=>b.success&&b.idempotent&&b.tenant_id===result.tenant_id&&b.hotel_id===result.hotel_id));
   assert.equal(closeCalls,0);assert.equal(provisionCalls,0);assert.deepEqual(await f.counts(),before);
   assert.deepEqual((await f.pool.query('SELECT to_jsonb(w) AS value FROM roomqc_control.workspaces w WHERE id=$1',[f.workspace.id])).rows[0].value,saved);
  }finally{await first.runtime.shutdown();await second.runtime.shutdown()}
 });

 dbtest('T12 activation/job/dispatch/audit settle atomically and an audit fault can be retried without business replay',async()=>{
  const f=await fixture(),a=await f.begin(),result=f.result(a),before=await f.counts();
  await fault(f.pool,'attempts',"NEW.outcome='setup_dispatch_active'");
  await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID()));
  assert.deepEqual(await f.counts(),before);
  assert.equal((await f.pool.query('SELECT terminal_state FROM roomqc_control.setup_dispatches')).rows[0].terminal_state,null);
  assert.equal((await f.pool.query('SELECT state FROM roomqc_control.provisioning_jobs')).rows[0].state,'queued');
  assert.equal((await f.pool.query('SELECT status FROM roomqc_control.workspaces')).rows[0].status,'provisioning');
  await clearFault(f.pool,'attempts');
  assert.equal((await f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID())).workspace.status,'active');
  const settledCounts=await f.counts();
  assert.equal((await f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID())).idempotent,true);
  assert.deepEqual(await f.counts(),settledCounts);
 });

 dbtest('T12 only proven closed waiting-owner permits a fresh dispatch; old callbacks and legacy activation cannot bypass it',async()=>{
  const f=await fixture(),a=await f.begin(),closed=f.result(a,'closed');
  await f.store.setup.settle(a.workspace,a.dispatch,closed,randomUUID());
  const b=await f.store.setup.begin(a.workspace,f.user,{...f.fields,hotelName:'Corrected hotel'},randomUUID());
  assert.equal(b.started,true);assert.notEqual(b.dispatch.id,a.dispatch.id);
  assert.deepEqual((await f.pool.query('SELECT state FROM roomqc_control.provisioning_jobs ORDER BY created_at')).rows.map(j=>j.state),['cancelled','queued']);
  await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,f.result(a),randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
  const counts=await f.counts();
  await f.store.setup.settle(a.workspace,a.dispatch,closed,randomUUID());assert.deepEqual(await f.counts(),counts);
  await assert.rejects(()=>f.store.beginProvision(b.workspace,f.user,randomUUID()),{code:'SETUP_DISPATCH_REQUIRED'});
  const receipt={workspace_id:f.workspace.id,owner_id:f.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()};
  await assert.rejects(()=>f.store.activate(b.workspace,receipt,randomUUID()),{code:'SETUP_DISPATCH_RECOVERY_REQUIRED'});
 });

 dbtest('T12 invalid identity, changed routing/owner and leased replies cannot write activation',async()=>{
  const f=await fixture(),a=await f.begin(),result=f.result(a),before=await f.counts();
  for(const patch of [{workspace_id:randomUUID()},{owner_id:randomUUID()},{routing_version:2},{payload_sha256:'a'.repeat(64)},
   {dispatch_id:randomUUID()},{tenant_id:null}])await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,{...result,...patch},randomUUID()),{code:'SETUP_RECEIPT_CONFLICT'});
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='leased',lease_token=$1,lease_until=clock_timestamp()+interval '1 minute'",[randomUUID()]);
  await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='retry',lease_token=NULL,lease_until=NULL");
  await f.pool.query('UPDATE roomqc_control.workspaces SET routing_version=2');
  await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
  await f.pool.query('UPDATE roomqc_control.workspaces SET routing_version=1,owner_id=$1',[randomUUID()]);
  await assert.rejects(()=>f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
  assert.deepEqual(await f.counts(),before);
  assert.equal((await f.pool.query('SELECT terminal_state FROM roomqc_control.setup_dispatches')).rows[0].terminal_state,null);
 });

 dbtest('T12 legacy unknown attempts and disabled cutover flag never create a fresh dispatch',async()=>{
  const f=await fixture();f.cfg.setupDispatchEnabled=false;let calls=0;
  const h=await f.http({provisionSetupDispatch:async()=>{calls++;throw new Error('Must stay off')}});
  try{
   const response=await h.post();assert.equal(response.status,503);assert.equal((await response.json()).error,'SETUP_PROTOCOL_DISABLED');
   assert.equal((await f.counts()).setup_dispatches,0);assert.equal(calls,0);
  }finally{await h.runtime.shutdown()}
  await f.pool.query("UPDATE roomqc_control.workspaces SET status='provisioning',owner_id=$1,expires_at=NULL",[f.user.id]);
  await assert.rejects(f.begin,{code:'PROVISIONING_RESULT_UNKNOWN'});
  await f.pool.query('INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version) VALUES($1,$2,1)',[randomUUID(),f.workspace.id]);
  await assert.rejects(f.begin,{code:'PROVISIONING_RESULT_UNKNOWN'});assert.equal((await f.counts()).setup_dispatches,0);
 });

 dbtest('T12 runtime cannot rewrite dispatch identity, terminal evidence, delete journal or misbind job routing',async()=>{
  const f=await fixture(),a=await f.begin(),result=f.result(a);
  assert.equal((await f.store.readiness()).status,'ready');
  await assert.rejects(()=>f.store.pool.query('UPDATE roomqc_control.setup_dispatches SET payload_sha256=$1',['b'.repeat(64)]),{code:'42501'});
  await assert.rejects(()=>f.store.pool.query('DELETE FROM roomqc_control.setup_dispatches'),{code:'42501'});
  await assert.rejects(()=>f.store.pool.query('UPDATE roomqc_control.provisioning_jobs SET expected_routing_version=2 WHERE dispatch_id=$1',[a.dispatch.id]),{code:'23503'});
  await f.store.setup.settle(a.workspace,a.dispatch,result,randomUUID());
  await assert.rejects(()=>f.store.pool.query("UPDATE roomqc_control.setup_dispatches SET terminal_state='closed',tenant_id=NULL,hotel_id=NULL"),{code:'23514'});
  assert.equal((await f.pool.query('SELECT terminal_state FROM roomqc_control.setup_dispatches')).rows[0].terminal_state,'committed');
 });

 dbtest('T12 admission drain before first dispatch has no new effects and preserves reservation',async()=>{
  const f=await fixture(),before=await f.counts();await f.pool.query("UPDATE roomqc_control.clusters SET status='draining'");
  await assert.rejects(f.begin,{code:'PROVISIONING_WAIT'});assert.deepEqual(await f.counts(),before);
  assert.equal((await f.pool.query('SELECT status FROM roomqc_control.workspaces')).rows[0].status,'reserved');
 });

 dbtest('T12 a historical failure is audited without overwriting a current adopted workspace or its job',async()=>{
  const f=await fixture(),a=await f.begin();
  const before=(await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows;
  const job=(await f.pool.query('SELECT * FROM roomqc_control.provisioning_jobs')).rows;
  await f.store.recordFailure(f.workspace.id,randomUUID(),'OLD_NETWORK_FAILURE');
  assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows,before);
  assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.provisioning_jobs')).rows,job);
  assert.equal((await f.pool.query("SELECT count(*) FROM roomqc_control.attempts WHERE outcome='OLD_NETWORK_FAILURE'")).rows[0].count,'1');
  assert.equal((await f.store.setup.current(a.workspace)).id,a.dispatch.id);
 });

 dbtest('T12 needs-review and unproven waiting-owner states never return pending acceptance or issue another dispatch',async()=>{
  const f=await fixture(),a=await f.begin();
  for(const state of ['needs_review','waiting_owner']){
   await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET state=$1 WHERE dispatch_id=$2',[state,a.dispatch.id]);
   await assert.rejects(f.begin,{code:'PROVISIONING_RESULT_UNKNOWN'});
  }
  assert.equal((await f.counts()).setup_dispatches,1);
 });

 dbtest('T11 waiting-owner status requires a closed dispatch bound to the current owner, cluster and routing',async()=>{
  const f=await fixture(),a=await f.begin();let remoteCalls=0;
  await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='waiting_owner' WHERE dispatch_id=$1",[a.dispatch.id]);
  const h=await f.http({provisionSetupDispatch:async()=>{remoteCalls++;throw new Error('Status must never provision')}});
  const snapshot=async()=>(await f.pool.query(`SELECT jsonb_build_object(
    'workspace',(SELECT to_jsonb(w) FROM roomqc_control.workspaces w),
    'jobs',(SELECT jsonb_agg(to_jsonb(j)) FROM roomqc_control.provisioning_jobs j),
    'dispatches',(SELECT jsonb_agg(to_jsonb(d)) FROM roomqc_control.setup_dispatches d),
    'attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM roomqc_control.attempts t)) AS snapshot`)).rows[0].snapshot;
  const stable=async expected=>{
   const before=await snapshot();
   const response=await fetch(h.endpoint+'/setup-status',{headers:{Authorization:'Bearer fixture-owner-token'}});
   assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
   const status=await response.json();assert.equal(status.step,expected);
   assert.equal(status.nextAction,expected==='waiting_owner'?'continue_setup':'contact_support');
   assert.deepEqual(await snapshot(),before);assert.ok(!JSON.stringify(status).includes(a.dispatch.payload_sha256));
  };
  try{
   await stable('needs_review');assert.equal((await h.post()).status,409);
   await f.pool.query("UPDATE roomqc_control.setup_dispatches SET terminal_state='closed',settled_at=clock_timestamp() WHERE id=$1",[a.dispatch.id]);
   await stable('waiting_owner');
   // A legacy job cannot inherit an unrelated closure; keep all FK/immutability
   // guards in place while changing the current workspace binding below.
   await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET dispatch_id=NULL');await stable('needs_review');
   await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET dispatch_id=$1',[a.dispatch.id]);
   await f.pool.query('UPDATE roomqc_control.workspaces SET routing_version=2');await stable('needs_review');
  }finally{await h.runtime.shutdown()}
  assert.equal(remoteCalls,0);assert.equal((await f.counts()).setup_dispatches,1);
  const changedOwner=randomUUID();await f.pool.query('UPDATE roomqc_control.workspaces SET routing_version=1,owner_id=$1',[changedOwner]);
  const ownerView=await f.store.setupStatusSnapshot({...a.workspace,owner_id:changedOwner},{...f.user,id:changedOwner});
  assert.equal(ownerView.setup_job.closureVerified,false);
  await f.pool.query('UPDATE roomqc_control.workspaces SET owner_id=$1',[f.user.id]);
  const changedCluster='closure-changed-'+run;
  await importInitialRegistry(f.pool,[{...cluster,id:changedCluster,url:'http://127.0.0.1:54322'}]);
  await f.pool.query('UPDATE roomqc_control.workspaces SET cluster_id=$1',[changedCluster]);
  const clusterView=await f.store.setupStatusSnapshot({...a.workspace,cluster_id:changedCluster},f.user);
  assert.equal(clusterView.setup_job.closureVerified,false);
 });
}
