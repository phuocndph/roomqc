import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ControlStore,ControlError} from './store.mjs';
import {clusterCommand,publicCluster} from './admin.mjs';
import {adminRead} from './admin-read.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {startControl} from './server.mjs';

const actor={id:randomUUID(),clusterId:'cluster-a'};
const command=(operation='close_admission',expectedVersion=1,payload={},key=randomUUID(),target='cluster-a')=>clusterCommand({
  operation,expectedVersion,payload,reason:'Verify isolated admin operation'},key,target);
async function overlapping(pool,operation){
  const lock=await pool.connect();await lock.query('SELECT pg_advisory_lock(727001)');
  let waiting=false,result;
  try{
    result=operation();
    for(let i=0;i<100;i++){
      const count=await pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
      if(Number(count.rows[0].count)>=2){waiting=true;break}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  }finally{await lock.query('SELECT pg_advisory_unlock(727001)');lock.release()}
  const outcome=await result;assert.equal(waiting,true,'Concurrent operations must actually wait on the allocation lock');return outcome;
}
export function registerAdminCases({dbtest,database,password,cluster}){
  async function fixture(name,{clusters=[cluster],open=true,limit=99}={}){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,clusters);
    await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const runtimeUrl=new URL(url);runtimeUrl.username=name;
    const config=fixtureConfig(runtimeUrl.href,clusters),store=new ControlStore(config);
    if(open)for(const c of clusters)await seedOperationalCluster(pool,c.id,{limit});
    return {pool,store,config};
  }
  dbtest('admin commands: 20 overlapping replays commit one mutation, event and stable receipt',async()=>{
    const {pool,store}=await fixture('admin_replays');
    try{
      const input=command();
      const receipts=await overlapping(pool,()=>Promise.all(Array.from({length:20},()=>store.admin.execute(actor,input,randomUUID()))));
      assert.equal(new Set(receipts.map(r=>r.commandId)).size,1);
      const state=(await pool.query(`SELECT c.row_version,p.manual_closed,(SELECT count(*) FROM roomqc_control.control_commands) AS commands,
        (SELECT count(*) FROM roomqc_control.cluster_events) AS events FROM roomqc_control.clusters c
        JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id`)).rows[0];
      assert.equal(Number(state.row_version),2);assert.equal(state.manual_closed,true);assert.equal(Number(state.commands),1);assert.equal(Number(state.events),1);
      for(const changed of [command('close_admission',2,{},input.key),command('close_admission',1,{},input.key,'cluster-b')]){
        await assert.rejects(()=>store.admin.execute(actor,changed,randomUUID()),{code:'IDEMPOTENCY_CONFLICT'});
      }
    }finally{await store.close()}
  });
  dbtest('admin commands: competing versions have one winner and audit failure rolls back mutation and receipt',async()=>{
    const {pool,store}=await fixture('admin_versions');
    try{
      const results=await overlapping(pool,()=>Promise.allSettled([store.admin.execute(actor,command(),randomUUID()),
        store.admin.execute({...actor,id:randomUUID()},command('set_draining'),randomUUID())]));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
      await pool.query(`CREATE FUNCTION roomqc_control.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Isolated audit failure'; END $$;
        CREATE TRIGGER reject_event BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_event()`);
      const input=command('update_policy',2,{tenantLimit:7});
      await assert.rejects(()=>store.admin.execute(actor,input,randomUUID()),{code:'P0001'});
      assert.equal(Number((await store.admin.cluster('cluster-a')).row_version),2);
      assert.equal((await store.admin.cluster('cluster-a')).tenant_limit,99);
      assert.equal((await pool.query('SELECT 1 FROM roomqc_control.control_commands WHERE idempotency_key=$1',[input.key])).rowCount,0);
      await pool.query('DROP TRIGGER reject_event ON roomqc_control.cluster_events');
      const result=await store.admin.execute(actor,input,randomUUID());assert.equal(result.targetVersion,3);assert.equal(result.result.tenantLimit,7);
      await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
      assert.equal((await store.admin.cluster('cluster-a')).tenant_limit,7);
    }finally{await store.close()}
  });
  dbtest('admin opening rechecks health, backups and policy; draining/serving never silently reopen admission',async()=>{
    const {pool,store}=await fixture('admin_gate');
    try{
      await store.admin.execute(actor,command(),randomUUID());
      await pool.query("UPDATE roomqc_control.cluster_health_current SET valid_until=now()-interval '1 second',observed_at=now()-interval '3 minutes'");
      const stale=publicCluster(await store.admin.cluster('cluster-a'),store.config);
      assert.equal(stale.health.status,'unknown');assert.ok(stale.health.reasonCodes.includes('METRICS_STALE'));
      await assert.rejects(()=>store.admin.execute(actor,command('open_admission',2),randomUUID()),{code:'ADMISSION_BLOCKED'});
      await pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=now(),valid_until=now()+interval '120 seconds'");
      await pool.query("UPDATE roomqc_control.backup_runs SET completed_at=now()-interval '2 days'");
      await assert.rejects(()=>store.admin.execute(actor,command('open_admission',2),randomUUID()),{code:'ADMISSION_BLOCKED'});
      await pool.query('UPDATE roomqc_control.backup_runs SET completed_at=now()');
      assert.equal((await store.admin.execute(actor,command('open_admission',2),randomUUID())).result.admission.decision,'open');
      assert.equal((await store.admin.execute(actor,command('set_draining',3),randomUUID())).result.status,'draining');
      const resumed=await store.admin.execute(actor,command('set_serving',4),randomUUID());
      assert.equal(resumed.result.status,'active');assert.equal(resumed.result.admission.decision,'manual_closed');
      await store.admin.execute(actor,command('update_policy',5,{tenantLimit:12}),randomUUID());
      await assert.rejects(()=>store.admin.execute(actor,command('open_admission',6),randomUUID()),{code:'ADMISSION_BLOCKED'});
    }finally{await store.close()}
  });
  dbtest('registry registration is draft, inventory-only, idempotent and rejects duplicate host/cluster',async()=>{
    const {store,config}=await fixture('admin_register');
    try{
      config.inventory.set('cluster-b',{id:'cluster-b',url:'https://backend-b.example.invalid',hostId:'host-b',environment:'local',
        backendKind:'self_hosted',credentialRef:'credential-b'});
      const body={id:'cluster-b',hostId:'host-b',backendKind:'self_hosted',endpointRef:'cluster-b',credentialRef:'credential-b',expectedVersion:1,reason:'Register isolated draft cluster'};
      const key=randomUUID(),result=await store.admin.register(actor,body,key,randomUUID());
      assert.equal(result.result.validationState,'pending');assert.equal(result.result.credentialConfigured,false);assert.notEqual(result.result.admission.decision,'open');
      assert.equal((await store.admin.register(actor,body,key,randomUUID())).commandId,result.commandId);
      await assert.rejects(()=>store.admin.register(actor,{...body,url:'http://169.254.169.254'},randomUUID(),randomUUID()),{code:'INVALID_COMMAND'});
      await assert.rejects(()=>store.admin.register(actor,{...body,endpointRef:'unapproved'},randomUUID(),randomUUID()),{code:'INVENTORY_REQUIRED'});
      await assert.rejects(()=>store.admin.register(actor,{...body,id:'cluster-c'},randomUUID(),randomUUID()),{code:'CLUSTER_ALREADY_REGISTERED'});
      await assert.rejects(()=>store.admin.register(actor,{...body,reason:'A different operation reason'},key,randomUUID()),{code:'IDEMPOTENCY_CONFLICT'});
    }finally{await store.close()}
  });
  dbtest('admission: 20 competing new registrations can reserve only the final slot; retry does not extend expiry',async()=>{
    const {pool,store}=await fixture('allocation_race',{limit:1});
    try{
      const results=await overlapping(pool,()=>Promise.allSettled(Array.from({length:20},(_,i)=>store.reserve({slug:'race-hotel-'+i,
        email:'owner-'+i+'@example.invalid',displayName:'Race hotel'},randomUUID()))));
      const accepted=results.filter(r=>r.status==='fulfilled');assert.equal(accepted.length,1);
      assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='NO_CAPACITY'));
      const saved=accepted[0].value,query=await pool.query('SELECT * FROM roomqc_control.workspaces');assert.equal(query.rowCount,1);
      const index=Number(saved.slug.split('-').at(-1));
      const retries=await Promise.all(Array.from({length:20},()=>store.reserve({slug:saved.slug,email:'owner-'+index+'@example.invalid',displayName:'Race hotel'},randomUUID())));
      assert.ok(retries.every(r=>r.id===saved.id&&r.expires_at.getTime()===saved.expires_at.getTime()));
      assert.equal((await pool.query('SELECT * FROM roomqc_control.signup_affinities')).rowCount,1);
    }finally{await store.close()}
  });
  dbtest('admission: durable email affinity survives expiry; first provision rechecks gate while started work stays recoverable',async()=>{
    const second={...cluster,id:'cluster-b',url:'https://backend-b.example.invalid'};
    const {pool,store}=await fixture('affinity_provision',{clusters:[cluster,second]});
    try{
      const input={slug:'affinity-hotel',email:'owner@example.invalid',displayName:'Affinity fixture'};
      const old=await store.reserve(input,randomUUID());assert.equal(old.cluster_id,'cluster-a');
      await pool.query("UPDATE roomqc_control.workspaces SET expires_at=now()-interval '1 minute' WHERE id=$1",[old.id]);
      await pool.query("UPDATE roomqc_control.cluster_policies SET manual_closed=true WHERE cluster_id='cluster-a'");
      await assert.rejects(()=>store.reserve({...input,slug:'new-affinity'},randomUUID()),{code:'AFFINITY_CLUSTER_BLOCKED'});
      await pool.query("UPDATE roomqc_control.cluster_policies SET manual_closed=false WHERE cluster_id='cluster-a'");
      const current=await store.reserve({...input,slug:'new-affinity'},randomUUID());assert.notEqual(current.id,old.id);assert.equal(current.cluster_id,'cluster-a');
      const owner={id:randomUUID(),email:input.email};
      await assert.rejects(()=>store.beginProvision(old,owner,randomUUID()),{code:'RESERVATION_CHANGED'});
      await pool.query("UPDATE roomqc_control.cluster_policies SET manual_closed=true WHERE cluster_id='cluster-a'");
      await assert.rejects(()=>store.beginProvision(current,owner,randomUUID()),{code:'PROVISIONING_WAIT'});
      assert.equal((await pool.query('SELECT owner_id FROM roomqc_control.workspaces WHERE id=$1',[current.id])).rows[0].owner_id,null);
      await pool.query("UPDATE roomqc_control.cluster_policies SET manual_closed=false WHERE cluster_id='cluster-a'");
      const started=await store.beginProvision(current,owner,randomUUID());assert.equal(started.status,'provisioning');assert.equal(started.expires_at,null);
      await pool.query("UPDATE roomqc_control.cluster_policies SET manual_closed=true WHERE cluster_id='cluster-a'");
      assert.equal((await store.beginProvision(started,owner,randomUUID())).status,'provisioning');
      await store.sweepReservations();assert.equal((await store.workspace(current.slug)).status,'provisioning');
    }finally{await store.close()}
  });
  dbtest('allocation and admin close serialize on one lock; no new reservation after close has committed',async()=>{
    const {pool,store}=await fixture('close_reserve_race');
    try{
      const input={slug:'closing-hotel',email:'owner@example.invalid',displayName:'Closing fixture'};
      const outcomes=await overlapping(pool,()=>Promise.allSettled([store.admin.execute(actor,command(),randomUUID()),store.reserve(input,randomUUID())]));
      assert.equal(outcomes[0].status,'fulfilled');
      if(outcomes[1].status==='rejected')assert.equal(outcomes[1].reason.code,'NO_CAPACITY');
      await assert.rejects(()=>store.reserve({...input,slug:'after-close',email:'other@example.invalid'},randomUUID()),{code:'NO_CAPACITY'});
      const events=(await pool.query('SELECT * FROM roomqc_control.cluster_events')).rows;assert.equal(events.length,1);
    }finally{await store.close()}
  });
  dbtest('admin pagination preserves microseconds, filter scope and redaction across 1,005 workspaces and a long timeline',async()=>{
    const {pool,store}=await fixture('admin_pagination');
    try{
      await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status,created_at)
        SELECT md5(i::text)::uuid,'sample-hotel-'||i,'Synthetic hotel '||i,'redacted-email-'||i,'cluster-a',
          md5('tenant-'||i)::uuid,md5('hotel-'||i)::uuid,md5('owner-'||i)::uuid,'active',
          '2026-01-01T00:00:00Z'::timestamptz + (i%7)*interval '1 microsecond' FROM generate_series(1,1005)i`);
      let cursor=null,ids=[];
      do{
        const page=await adminRead(store,'/workspaces',new URLSearchParams({limit:'100',...(cursor?{cursor}:{})}),{});
        assert.equal(JSON.stringify(page).includes('redacted-email'),false);ids.push(...page.items.map(r=>r.id));cursor=page.nextCursor;
      }while(cursor);
      assert.equal(ids.length,1005);assert.equal(new Set(ids).size,1005);
      const first=await adminRead(store,'/workspaces',new URLSearchParams('limit=25'),{});
      await assert.rejects(()=>adminRead(store,'/workspaces',new URLSearchParams({cursor:first.nextCursor,status:'reserved'}),{}),{code:'INVALID_PAGE'});
      await assert.rejects(()=>adminRead(store,'/workspaces',new URLSearchParams('limit=25&limit=50'),{}),{code:'INVALID_PAGE'});
      const request=randomUUID();
      await pool.query(`INSERT INTO roomqc_control.attempts(workspace_id,request_id,outcome,created_at) SELECT $1,$2,'synthetic',
        '2026-01-01T00:00:00Z'::timestamptz+(i%3)*interval '1 microsecond' FROM generate_series(1,63)i`,[ids[0],request]);
      const found=await adminRead(store,'/workspaces',new URLSearchParams({search:request}),{});assert.equal(found.items[0].id,ids[0]);
      let timelineCursor=null,timeline=[];
      do{
        const result=await adminRead(store,'/workspaces/'+ids[0],new URLSearchParams({limit:'20',...(timelineCursor?{cursor:timelineCursor}:{})}),{binding:async()=>null});
        timeline.push(...result.timeline.items.map(e=>e.id));timelineCursor=result.timeline.nextCursor;
      }while(timelineCursor);
      assert.equal(timeline.length,63);assert.equal(new Set(timeline).size,63);
      await assert.rejects(()=>adminRead(store,'/workspaces',new URLSearchParams({cursor:first.nextCursor,limit:'101'}),{}),{code:'INVALID_PAGE'});
    }finally{await store.close()}
  });
  dbtest('admin HTTP checks authority on every attempt and retry after a lost committed response returns the original receipt',async()=>{
    const {pool,store,config}=await fixture('admin_http');
    let authorized=true,checks=0,dropNext=false,dropped;
    // This test covers the HTTP boundary, not Supabase role/session internals.
    const gateway={supportActor:async token=>{checks++;if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(token!=='admin-token'||!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor}};
    const runtime=await startControl(config,{store,gateway});
    runtime.server.prependListener('request',(req,res)=>{if(dropNext&&req.url.endsWith('/commands'))res.end=function(body){dropNext=false;dropped=JSON.parse(body);res.destroy();return res}});
    const url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const post=(key,token='admin-token')=>fetch(url+'/clusters/cluster-a/commands',{method:'POST',headers:{Origin:config.publicOrigin,
      'Content-Type':'application/json','Idempotency-Key':key,...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify({operation:'close_admission',expectedVersion:1,reason:'Verify lost HTTP response',payload:{}})});
    try{
      for(const token of ['', 'owner-token','staff-token'])assert.equal((await post(randomUUID(),token)).status,token?403:401);
      const key=randomUUID();dropNext=true;await assert.rejects(()=>post(key));
      assert.equal((await pool.query('SELECT * FROM roomqc_control.control_commands WHERE idempotency_key=$1',[key])).rowCount,1);
      const response=await post(key);assert.equal(response.status,200);const replay=await response.json();
      assert.equal(replay.commandId,dropped.commandId);assert.notEqual(replay.requestId,dropped.requestId);assert.equal(replay.targetVersion,2);
      authorized=false;assert.equal((await post(key)).status,403);
      assert.equal((await fetch(url+'/clusters',{headers:{Authorization:'Bearer admin-token'}})).status,403);
      assert.equal(checks,7);
      assert.equal((await pool.query('SELECT * FROM roomqc_control.cluster_events')).rowCount,1);
    }finally{await runtime.shutdown()}
  });
}
