import {fixtureAdminExecute,fixtureAdminRegister,fixtureSupportGateway} from './support-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ControlStore,ControlError} from './store.mjs';
import {clusterCommand,publicCluster} from './admin.mjs';
import {adminRead} from './admin-read.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {startControl} from './server.mjs';
import {ClusterGateway} from './cluster.mjs';
import {ReleaseValidationCatalog} from './release-validation.mjs';
import {fixtureReleaseTrust,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';
import {ReleaseApprovalStore} from './release-authority.mjs';

const actor={id:randomUUID(),clusterId:'cluster-a'};
const command=(operation='close_admission',expectedVersion=1,payload={},key=randomUUID(),target='cluster-a')=>clusterCommand({
  operation,expectedVersion,payload,reason:'Verify isolated admin operation'},key,target);
async function overlapping(pool,operation,{waiters=2,includeCommandFence=false}={}){
  const lock=await pool.connect();await lock.query('SELECT pg_advisory_lock(727001)');
  let waiting=false,result;
  try{
    result=operation();
    for(let i=0;i<100;i++){
      const count=await pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND ($1::boolean OR objid=727001) AND NOT granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,[includeCommandFence]);
      if(Number(count.rows[0].count)>=waiters){waiting=true;break}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  }finally{await lock.query('SELECT pg_advisory_unlock(727001)');lock.release()}
  const outcome=await result;assert.equal(waiting,true,`At least ${waiters} concurrent operations must actually wait on allocation or the selected command fence`);return outcome;
}
export function registerAdminCases({dbtest,database,password,cluster}){
  async function fixture(name,{clusters=[cluster],open=true,limit=99,poolMax=4}={}){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,clusters);
    await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const runtimeUrl=new URL(url);runtimeUrl.username=name;
    const config={...fixtureConfig(runtimeUrl.href,clusters),poolMax},store=new ControlStore(config);
    if(open)for(const c of clusters)await seedOperationalCluster(pool,c.id,{limit});
    return {pool,store,config};
  }
  dbtest('admin overview: real primary snapshot distinguishes global closure, available slots, full and stale clusters with live authority',async()=>{
    const second={...cluster,id:'cluster-b'}, {pool,store,config}=await fixture('admin_signup_overview',{clusters:[cluster,second],limit:2,poolMax:1});
    let authorized=true;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor;
    }});
    const runtime=await startControl(config,{store,gateway});
    const url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin/overview`;
    const read=(suffix='',token='fixture-admin')=>fetch(url+suffix,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(5000)});
    const overview=()=>adminRead(store,'/overview',new URLSearchParams());
    const query=store.pool.query.bind(store.pool);let statements=0;
    try{
      assert.equal((await read('',null)).status,401);
      store.pool.query=(...args)=>{statements++;return query(...args)};
      const closed=await overview();assert.equal(statements,1,'Fleet counts must use one primary snapshot');
      store.pool.query=query;
      assert.equal(closed.clusterCount,2);assert.equal(closed.admissionOpenCount,2);
      assert.deepEqual(closed.signup,{enabled:false,setupDispatchEnabled:false,state:'closed',openClusterCount:2,availableWorkspaceSlots:4,reasonCodes:['SIGNUP_CLOSED_CONFIG']});
      config.signupEnabled=true;config.setupDispatchEnabled=true;
      const open=await overview();assert.equal(open.signup.state,'open');assert.equal(open.signup.setupDispatchEnabled,true);
      await store.reserve({slug:'overview-one',email:'one@example.invalid',displayName:'Isolated one'},randomUUID());
      assert.equal((await overview()).signup.availableWorkspaceSlots,3);
      await pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=now()-interval '2 minutes',valid_until=now()-interval '1 second' WHERE cluster_id='cluster-b'");
      const stale=await overview();assert.deepEqual(stale.staleClusterIds,['cluster-b']);assert.equal(stale.signup.openClusterCount,1);
      assert.equal(stale.signup.availableWorkspaceSlots,1);assert.equal(stale.workspaceCounts.reserved,1);
      await store.reserve({slug:'overview-two',email:'two@example.invalid',displayName:'Isolated two'},randomUUID());
      const full=await overview();assert.equal(full.signup.state,'no_capacity');assert.equal(full.signup.availableWorkspaceSlots,0);
      assert.deepEqual(full.signup.reasonCodes,['NO_OPEN_CLUSTER']);assert.equal(full.workspaceCounts.reserved,2);
      const response=await read();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const body=await response.json();assert.equal(body.signup.state,'no_capacity');
      assert.doesNotMatch(JSON.stringify(body),/test-server|test-public|api_url|publishable_key|email_hash|databaseUrl/);
      for(const suffix of ['?clusterId=cluster-a','?limit=1','?status=active','?unexpected=yes'])assert.equal((await read(suffix)).status,400);
      store.pool.query=async(...args)=>{const result=await query(...args);if(String(args[0]).includes('statement_timestamp() AS as_of'))authorized=false;return result};
      const denied=await read();assert.equal(denied.status,403);assert.equal(Object.hasOwn(await denied.json(),'signup'),false);
      store.pool.query=query;authorized=true;
      assert.equal((await read()).status,200);
      config.signupEnabled=false;assert.equal((await overview()).signup.state,'closed');
    }finally{store.pool.query=query;await runtime.shutdown()}
  });
  dbtest('admin tenant summary HTTP: primary mapping, poolMax1, target change and post-read revoke fence the body',async()=>{
    const {pool,store,config}=await fixture('admin_summary_http',{poolMax:1});
    const w=await store.reserve({slug:'summary-owned',email:'summary@example.invalid',displayName:'Summary fixture'},randomUUID());
    await pool.query("UPDATE roomqc_control.workspaces SET tenant_id=$2,owner_id=$3,hotel_id=$4,status='active',expires_at=null WHERE id=$1",
      [w.id,randomUUID(),randomUUID(),randomUUID()]);
    let authorized=true,mode='available',remote=0;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor;
    },tenantSummary:async row=>{
      remote++;assert.equal(row.cluster_id,cluster.id);await store.pool.query('SELECT 1');
      if(mode==='offline')throw new ControlError(503,'TENANT_SUMMARY_UNAVAILABLE','private-marker');
      if(mode==='route')await pool.query('UPDATE roomqc_control.workspaces SET routing_version=routing_version+1 WHERE id=$1',[w.id]);
      if(mode==='revoke')authorized=false;
      return {workspaceId:row.id,routingVersion:row.routing_version,clusterId:row.cluster_id,tenantId:row.tenant_id,status:'available',
        observedAt:new Date().toISOString(),errorCode:null,tenant:{id:row.tenant_id,name:'Summary fixture',subscriptionStatus:'trial',trialEndsAt:null,hotelCount:1,staffCount:0,roomCount:0}};
    }});
    const runtime=await startControl(config,{store,gateway}),url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin/workspaces/${w.id}/tenant-summary`;
    const read=(suffix='',token='admin-token')=>fetch(url+suffix,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(5000)});
    try{
      assert.equal((await read('',null)).status,401);assert.equal(remote,0);
      assert.equal((await read('?tenantId='+randomUUID())).status,400);assert.equal(remote,0);
      const good=await read();assert.equal(good.status,200);assert.equal((await good.json()).tenant.roomCount,0);
      mode='offline';const unavailable=await read();assert.equal(unavailable.status,200);const data=await unavailable.json();
      assert.equal(data.status,'unavailable');assert.equal(data.tenant,null);assert.equal(JSON.stringify(data).includes('private-marker'),false);
      mode='route';assert.equal((await read()).status,409);
      mode='revoke';const denied=await read();assert.equal(denied.status,403);assert.equal(Object.hasOwn(await denied.json(),'tenant'),false);
      authorized=true;mode='available';assert.equal((await read()).status,200);
      await pool.query("UPDATE roomqc_control.workspaces SET tenant_id=null,hotel_id=null,owner_id=null,status='reserved',expires_at=now()+interval '1 day' WHERE id=$1",[w.id]);
      const before=remote;const unbound=await read();assert.equal((await unbound.json()).errorCode,'TENANT_SUMMARY_UNBOUND');assert.equal(remote,before);
    }finally{await runtime.shutdown()}
  });
  dbtest('admin hosts and cluster candidates: limited-role pages, projection, inventory revision and live HTTP authority',async()=>{
    const {pool,store,config}=await fixture('admin_hosts');
    const entry=id=>({id,url:'https://backend.example.invalid',internalUrl:'https://private-marker.invalid',hostId:'host-'+id,hostName:'VPS '+id,
      environment:'local',backendKind:'self_hosted',credentialRef:'cred-'+id,providerLabel:'Test provider',private:'private-marker'});
    for(const id of ['cluster-b','cluster-c','cluster-d'])config.inventory.set(id,entry(id));
    config.inventory.set('a'.repeat(41),entry('a'.repeat(41)));
    const registerBody=id=>({id,hostId:'host-'+id,backendKind:'self_hosted',endpointRef:id,credentialRef:'cred-'+id,expectedVersion:1,reason:'Record test-only prepared cluster'});
    let authorized=true;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor;
    }});
    const runtime=await startControl(config,{store,gateway});
    const url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const read=(path,token='admin-token')=>fetch(url+path,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(5000)});
    try{
      for(const path of ['/hosts','/cluster-candidates'])assert.equal((await read(path,null)).status,401);
      assert.equal((await adminRead(store,'/hosts',new URLSearchParams())).items.length,1);
      assert.equal((await store.admin.cluster(cluster.id)).host_id,'cluster-a','Reading must not assign or alter the existing host link');
      const first=await adminRead(store,'/cluster-candidates',new URLSearchParams('limit=1'));
      assert.equal(first.items[0].id,'cluster-d');assert.ok(first.nextCursor);
      assert.equal(JSON.stringify(first).includes('private-marker'),false);
      const second=await adminRead(store,'/cluster-candidates',new URLSearchParams({limit:'1',cursor:first.nextCursor}));
      assert.equal(second.items[0].id,'cluster-c');
      config.inventory.get('cluster-d').hostName='Changed candidate';
      await assert.rejects(()=>adminRead(store,'/cluster-candidates',new URLSearchParams({cursor:first.nextCursor})),{code:'INVALID_PAGE'});
      await fixtureAdminRegister(store.admin,actor,registerBody('cluster-b'),randomUUID(),randomUUID());
      await fixtureAdminRegister(store.admin,actor,registerBody('cluster-c'),randomUUID(),randomUUID());
      const remaining=await adminRead(store,'/cluster-candidates',new URLSearchParams());
      assert.deepEqual(remaining.items.map(row=>row.id),['cluster-d']);
      await pool.query("UPDATE roomqc_control.hosts SET created_at='2026-01-01T00:00:00Z',name=repeat('N',400),provider_label='provider' WHERE environment='local'");
      const page=await adminRead(store,'/hosts',new URLSearchParams('limit=1&environment=local'));
      assert.equal(page.items.length,1);assert.ok(page.nextCursor);assert.equal(page.items[0].name.length,200);
      assert.equal(page.items[0].id,'host-cluster-c');assert.equal(page.items[0].cluster.hostId,page.items[0].id);
      const next=await adminRead(store,'/hosts',new URLSearchParams({limit:'1',environment:'local',cursor:page.nextCursor}));
      assert.equal(next.items[0].id,'host-cluster-b');assert.ok(next.nextCursor);
      await assert.rejects(()=>adminRead(store,'/hosts',new URLSearchParams({environment:'production',cursor:page.nextCursor})),{code:'INVALID_PAGE'});
      for(const query of ['status=invalid','environment=local&environment=local','secret=yes'])assert.equal((await read('/hosts?'+query)).status,400);
      for(const path of ['/hosts','/cluster-candidates']){
        const response=await read(path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
        assert.equal(JSON.stringify(await response.json()).includes('private-marker'),false);
      }
      authorized=false;assert.equal((await read('/hosts')).status,403);authorized=true;
      const original=store.pool.query.bind(store.pool);
      store.pool.query=async(...args)=>{const result=await original(...args);if(String(args[0]).includes('FROM roomqc_control.hosts h'))authorized=false;return result};
      const denied=await read('/hosts');assert.equal(denied.status,403);assert.equal(Object.hasOwn(await denied.json(),'items'),false);
      store.pool.query=original;
    }finally{await runtime.shutdown()}
  });
  dbtest('admin commands: 20 overlapping replays commit one mutation, event and stable receipt',async()=>{
    const {pool,store}=await fixture('admin_replays');
    try{
      const input=command();
      const receipts=await overlapping(pool,()=>Promise.all(Array.from({length:20},()=>fixtureAdminExecute(store.admin,actor,input,randomUUID()))),{includeCommandFence:true});
      assert.equal(new Set(receipts.map(r=>r.commandId)).size,1);
      const state=(await pool.query(`SELECT c.row_version,p.manual_closed,(SELECT count(*) FROM roomqc_control.control_commands) AS commands,
        (SELECT count(*) FROM roomqc_control.cluster_events) AS events FROM roomqc_control.clusters c
        JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id`)).rows[0];
      assert.equal(Number(state.row_version),2);assert.equal(state.manual_closed,true);assert.equal(Number(state.commands),1);assert.equal(Number(state.events),1);
      for(const changed of [command('close_admission',2,{},input.key),command('close_admission',1,{},input.key,'cluster-b')]){
        await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,changed,randomUUID()),{code:'IDEMPOTENCY_CONFLICT'});
      }
    }finally{await store.close()}
  });
  dbtest('admin commands: competing versions have one winner and audit failure rolls back mutation and receipt',async()=>{
    const {pool,store}=await fixture('admin_versions');
    try{
      const results=await overlapping(pool,()=>Promise.allSettled([fixtureAdminExecute(store.admin,actor,command(),randomUUID()),
        fixtureAdminExecute(store.admin,{...actor,id:randomUUID()},command('set_draining'),randomUUID())]));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
      await pool.query(`CREATE FUNCTION roomqc_control.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Isolated audit failure'; END $$;
        CREATE TRIGGER reject_event BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_event()`);
      const input=command('update_policy',2,{tenantLimit:7});
      await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,input,randomUUID()),{code:'P0001'});
      assert.equal(Number((await store.admin.cluster('cluster-a')).row_version),2);
      assert.equal((await store.admin.cluster('cluster-a')).tenant_limit,99);
      assert.equal((await pool.query('SELECT 1 FROM roomqc_control.control_commands WHERE idempotency_key=$1',[input.key])).rowCount,0);
      await pool.query('DROP TRIGGER reject_event ON roomqc_control.cluster_events');
      const result=await fixtureAdminExecute(store.admin,actor,input,randomUUID());assert.equal(result.targetVersion,3);assert.equal(result.result.tenantLimit,7);
      await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
      assert.equal((await store.admin.cluster('cluster-a')).tenant_limit,7);
    }finally{await store.close()}
  });
  dbtest('admin opening rechecks health, backups and policy; draining/serving never silently reopen admission',async()=>{
    const {pool,store}=await fixture('admin_gate');
    try{
      await fixtureAdminExecute(store.admin,actor,command(),randomUUID());
      await pool.query("UPDATE roomqc_control.cluster_health_current SET valid_until=now()-interval '1 second',observed_at=now()-interval '3 minutes'");
      const stale=publicCluster(await store.admin.cluster('cluster-a'),store.config);
      assert.equal(stale.health.status,'unknown');assert.ok(stale.health.reasonCodes.includes('METRICS_STALE'));
      await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,command('open_admission',2),randomUUID()),{code:'ADMISSION_BLOCKED'});
      await pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=now(),valid_until=now()+interval '120 seconds'");
      await pool.query("UPDATE roomqc_control.backup_runs SET completed_at=now()-interval '2 days'");
      await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,command('open_admission',2),randomUUID()),{code:'ADMISSION_BLOCKED'});
      await pool.query('UPDATE roomqc_control.backup_runs SET completed_at=now()');
      assert.equal((await fixtureAdminExecute(store.admin,actor,command('open_admission',2),randomUUID())).result.admission.decision,'open');
      assert.equal((await fixtureAdminExecute(store.admin,actor,command('set_draining',3),randomUUID())).result.status,'draining');
      const resumed=await fixtureAdminExecute(store.admin,actor,command('set_serving',4),randomUUID());
      assert.equal(resumed.result.status,'active');assert.equal(resumed.result.admission.decision,'manual_closed');
      await fixtureAdminExecute(store.admin,actor,command('update_policy',5,{tenantLimit:12}),randomUUID());
      await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,command('open_admission',6),randomUUID()),{code:'ADMISSION_BLOCKED'});
    }finally{await store.close()}
  });
  dbtest('host maintenance and retirement close signup even while cluster telemetry is healthy',async()=>{
    const {pool,store}=await fixture('host_lifecycle_signup');
    try{
      await pool.query("UPDATE roomqc_control.hosts SET status='maintenance' WHERE id='cluster-a'");
      const maintenance=publicCluster(await store.admin.cluster('cluster-a'),store.config);
      assert.ok(maintenance.admission.reasonCodes.includes('HOST_MAINTENANCE'));
      await assert.rejects(()=>store.reserve({slug:'maintenance-hotel',email:'maintenance@example.invalid',displayName:'Maintenance hotel'},randomUUID()),{code:'NO_CAPACITY'});
      await pool.query("UPDATE roomqc_control.hosts SET status='retired' WHERE id='cluster-a'");
      const retired=publicCluster(await store.admin.cluster('cluster-a'),store.config);
      assert.ok(retired.admission.reasonCodes.includes('HOST_RETIRED'));
      await assert.rejects(()=>store.reserve({slug:'retired-hotel',email:'retired@example.invalid',displayName:'Retired hotel'},randomUUID()),{code:'NO_CAPACITY'});
    }finally{await store.close()}
  });
  dbtest('admin host lifecycle commands atomically drain and restore the linked cluster without reopening signup',async()=>{
    const {pool,store}=await fixture('host_lifecycle_commands');
    try{
      const maintenance=await fixtureAdminExecute(store.admin,actor,command('set_host_maintenance',1),randomUUID());
      assert.equal(maintenance.result.hostStatus,'maintenance');
      assert.equal(maintenance.result.status,'draining');
      assert.equal(maintenance.result.admission.decision,'manual_closed');
      assert.equal((await pool.query("SELECT status FROM roomqc_control.hosts WHERE id='cluster-a'")).rows[0].status,'maintenance');
      const active=await fixtureAdminExecute(store.admin,actor,command('set_host_active',2),randomUUID());
      assert.equal(active.result.hostStatus,'active');
      assert.equal(active.result.status,'active');
      assert.equal(active.result.admission.decision,'manual_closed');
      assert.equal((await pool.query("SELECT status FROM roomqc_control.hosts WHERE id='cluster-a'")).rows[0].status,'active');
    }finally{await store.close()}
  });
  dbtest('registry registration is draft, inventory-only, idempotent and rejects duplicate host/cluster',async()=>{
    const {store,config}=await fixture('admin_register');
    try{
      config.inventory.set('cluster-b',{id:'cluster-b',url:'https://backend-b.example.invalid',hostId:'host-b',environment:'local',
        backendKind:'self_hosted',credentialRef:'credential-b'});
      const body={id:'cluster-b',hostId:'host-b',backendKind:'self_hosted',endpointRef:'cluster-b',credentialRef:'credential-b',expectedVersion:1,reason:'Register isolated draft cluster'};
      const key=randomUUID(),result=await fixtureAdminRegister(store.admin,actor,body,key,randomUUID());
      assert.equal(result.result.validationState,'pending');assert.equal(result.result.credentialConfigured,false);assert.notEqual(result.result.admission.decision,'open');
      assert.equal((await fixtureAdminRegister(store.admin,actor,body,key,randomUUID())).commandId,result.commandId);
      assert.deepEqual(await store.admin.commandResult(actor,{targetId:body.id,operation:'register_cluster',key}),result);
      config.inventory.set('cluster-prod',{id:'cluster-prod',url:'https://backend-prod.example.invalid',hostId:'host-prod',environment:'production',
        backendKind:'self_hosted',credentialRef:'credential-prod'});
      const production={id:'cluster-prod',hostId:'host-prod',backendKind:'self_hosted',endpointRef:'cluster-prod',credentialRef:'credential-prod',expectedVersion:1,reason:'Register production draft'};
      await assert.rejects(()=>fixtureAdminRegister(store.admin,actor,production,randomUUID(),randomUUID()),{code:'HOST_PREFLIGHT_REQUIRED'});
      config.inventory.get('cluster-prod').preflight={capturedAt:new Date().toISOString(),deploymentAllowed:true,diskFreePercent:42,dockerServerVersion:'29.1.3'};
      const productionResult=await fixtureAdminRegister(store.admin,actor,production,randomUUID(),randomUUID());
      assert.equal(productionResult.result.validationState,'pending');
      await assert.rejects(()=>fixtureAdminRegister(store.admin,actor,{...body,url:'http://169.254.169.254'},randomUUID(),randomUUID()),{code:'INVALID_COMMAND'});
      await assert.rejects(()=>fixtureAdminRegister(store.admin,actor,{...body,endpointRef:'unapproved'},randomUUID(),randomUUID()),{code:'INVENTORY_REQUIRED'});
      await assert.rejects(()=>fixtureAdminRegister(store.admin,actor,{...body,id:'cluster-c'},randomUUID(),randomUUID()),{code:'CLUSTER_ALREADY_REGISTERED'});
      await assert.rejects(()=>fixtureAdminRegister(store.admin,actor,{...body,reason:'A different operation reason'},key,randomUUID()),{code:'IDEMPOTENCY_CONFLICT'});
    }finally{await store.close()}
  });
  dbtest('admission: 20 competing new registrations can reserve only the final slot; retry does not extend expiry',async t=>{
    const {pool,store}=await fixture('allocation_race',{limit:1,poolMax:20});
    try{
      // Exercise twenty DB contenders, not sixteen queued pool acquisitions.
      // The production acquire/statement deadlines stay unchanged. Preparing
      // clients before the lock keeps cold connection startup out of this race.
      const warm=await Promise.allSettled(Array.from({length:20},()=>store.pool.connect()));
      try{
        assert.ok(warm.every(r=>r.status==='fulfilled'),'All twenty race clients must be connected before starting');
        await Promise.all(warm.map(r=>r.value.query('SELECT 1')));
      }finally{for(const r of warm)if(r.status==='fulfilled')r.value.release()}
      const results=await overlapping(pool,()=>Promise.allSettled(Array.from({length:20},(_,i)=>store.reserve({slug:'race-hotel-'+i,
        email:'owner-'+i+'@example.invalid',displayName:'Race hotel'},randomUUID()))),{waiters:20});
      const accepted=results.filter(r=>r.status==='fulfilled');assert.equal(accepted.length,1);
      const rejected=results.filter(r=>r.status==='rejected');
      const reasonCounts={};
      for(const {reason} of rejected){
        // Safe diagnostics only: never include a connection URL or raw DB error.
        const code=/^[A-Z0-9_]{2,64}$/.test(reason?.code??'')?reason.code
          :reason?.message==='timeout exceeded when trying to connect'?'POOL_ACQUIRE_TIMEOUT':'UNCLASSIFIED_ERROR';
        reasonCounts[code]=(reasonCounts[code]??0)+1;
      }
      assert.equal(rejected.length,19);
      assert.ok(rejected.every(r=>r.reason.code==='NO_CAPACITY'),JSON.stringify({accepted:accepted.length,rejected:rejected.length,reasonCounts}));
      t.diagnostic(JSON.stringify({assertedConcurrentWaiters:20,accepted:accepted.length,rejected:rejected.length,reasonCounts}));
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
      await assert.rejects(()=>store.beginProvision(started,owner,randomUUID()),{code:'PROVISIONING_WAIT'});
      await store.sweepReservations();assert.equal((await store.workspace(current.slug)).status,'provisioning');
    }finally{await store.close()}
  });
  dbtest('allocation and admin close serialize on one lock; no new reservation after close has committed',async()=>{
    const {pool,store}=await fixture('close_reserve_race');
    try{
      const input={slug:'closing-hotel',email:'owner@example.invalid',displayName:'Closing fixture'};
      const outcomes=await overlapping(pool,()=>Promise.allSettled([fixtureAdminExecute(store.admin,actor,command(),randomUUID()),store.reserve(input,randomUUID())]));
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
  // Only hashes leave the SQL layer if an assertion fails; never dump raw rows.
  dbtest('admin backups: 1,005 metadata rows preserve microseconds, totals, filters, redaction and read-only API grants',async()=>{
    const second={...cluster,id:'cluster-b',url:'https://backend-b.example.invalid'};
    const {pool,store}=await fixture('admin_backups',{clusters:[cluster,second],open:false});
    const snapshot=async()=>(await pool.query("SELECT md5(jsonb_agg(to_jsonb(b) ORDER BY id)::text) AS digest FROM roomqc_control.backup_runs b")).rows[0].digest;
    try{
      await pool.query(`INSERT INTO roomqc_control.backup_runs(id,cluster_id,scope,backup_id,manifest_hash,verification_state,completed_at,restore_test_at,created_at)
        SELECT md5('backup-'||i)::uuid,CASE WHEN i%3=0 THEN NULL WHEN i%3=1 THEN 'cluster-a' ELSE 'cluster-b' END,
          (ARRAY['directory','cluster','objects','bundle'])[1+i%4],
          CASE WHEN i=1 THEN 'https://private.invalid/object?signature=private-marker' ELSE 'backup-'||i END,
          CASE WHEN i=1 THEN 'private-marker' ELSE repeat('a',64) END,(ARRAY['pending','verified','failed'])[1+i%3],
          CASE WHEN i%3=0 THEN NULL ELSE '2026-10-29T00:00:00Z'::timestamptz END,
          CASE WHEN i%5=0 THEN '2026-10-29T00:30:00Z'::timestamptz ELSE NULL END,
          '2026-01-01T00:00:00Z'::timestamptz+(i%7)*interval '1 microsecond' FROM generate_series(1,1005)i`);
      const before=await snapshot();let cursor=null,ids=[];
      do{
        const page=await adminRead(store,'/backups',new URLSearchParams({limit:'100',...(cursor?{cursor}:{})}),{});
        assert.equal(page.total,1005);assert(Number.isFinite(Date.parse(page.asOf)));
        assert.equal(JSON.stringify(page).includes('private-marker'),false);assert.equal(JSON.stringify(page).includes('private.invalid'),false);
        ids.push(...page.items.map(item=>item.id));cursor=page.nextCursor;
      }while(cursor);
      assert.equal(ids.length,1005);assert.equal(new Set(ids).size,1005);
      const expected=(await pool.query("SELECT id FROM roomqc_control.backup_runs ORDER BY created_at DESC,id DESC")).rows.map(r=>r.id);
      assert.deepEqual(ids,expected);
      const filters={clusterId:'cluster-a',scope:'bundle',verificationState:'verified'},page=await adminRead(store,'/backups',new URLSearchParams({...filters,limit:'2'}),{});
      const amount=Number((await pool.query("SELECT count(*) FROM roomqc_control.backup_runs WHERE cluster_id='cluster-a' AND scope='bundle' AND verification_state='verified'")).rows[0].count);
      assert(amount>2);assert.equal(page.total,amount);assert.equal(page.items.length,2);assert(page.nextCursor);
      const next=await adminRead(store,'/backups',new URLSearchParams({...filters,limit:'2',cursor:page.nextCursor}),{});
      assert.equal(next.total,amount);assert(!page.items.some(a=>next.items.some(b=>b.id===a.id)));
      for(const query of ['clusterId=../private','scope=unknown','verificationState=unknown','scope=bundle&scope=cluster','signedUrl=yes','limit=101'])
        await assert.rejects(()=>adminRead(store,'/backups',new URLSearchParams(query),{}),{code:'INVALID_PAGE'});
      for(const change of [{...filters,scope:'cluster'},{...filters,clusterId:'cluster-b'},{...filters,verificationState:'failed'}])
        await assert.rejects(()=>adminRead(store,'/backups',new URLSearchParams({...change,cursor:page.nextCursor}),{}),{code:'INVALID_PAGE'});
      const other=await adminRead(store,'/clusters',new URLSearchParams('limit=1'),{});
      await assert.rejects(()=>adminRead(store,'/backups',new URLSearchParams({cursor:other.nextCursor}),{}),{code:'INVALID_PAGE'});
      const empty=await adminRead(store,'/backups',new URLSearchParams('clusterId=absent-cluster'),{});
      assert.equal(empty.total,0);assert.deepEqual(empty.items,[]);assert.equal(empty.nextCursor,null);
      assert.equal(await snapshot(),before);
      await assert.rejects(()=>store.pool.query('DELETE FROM roomqc_control.backup_runs'),{code:'42501'});
      assert.equal(await snapshot(),before);
    }finally{await store.close()}
  });
  dbtest('admin backups HTTP: unavailable reads and authority revoked after SQL never become empty or successful metadata',async()=>{
    const {pool,store,config}=await fixture('admin_backup_http',{open:false});
    let authorized=true,hold=false,releaseRead,observedRead;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor;
    }});
    const query=store.pool.query.bind(store.pool);
    store.pool.query=async(...args)=>{const result=await query(...args);if(hold&&String(args[0]).startsWith('SELECT statement_timestamp()')){
      observedRead();await new Promise(resolve=>{releaseRead=resolve});}return result;};
    const runtime=await startControl(config,{store,gateway}),url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin/backups`;
    const read=token=>fetch(url,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(5000)});
    let pending;
    try{
      assert.equal((await read()).status,401);
      const empty=await read('admin-token');assert.equal(empty.status,200);assert.equal((await empty.json()).total,0);
      await pool.query('REVOKE SELECT ON roomqc_control.backup_runs FROM roomqc_control_api');
      const unavailable=await read('admin-token'),error=await unavailable.json();assert.equal(unavailable.status,503);
      assert.equal(error.error,'CONTROL_UNAVAILABLE');assert.equal(Object.hasOwn(error,'items'),false);
      await pool.query('GRANT SELECT ON roomqc_control.backup_runs TO roomqc_control_api');
      const observed=new Promise(resolve=>{observedRead=resolve});hold=true;pending=read('admin-token');
      await Promise.race([observed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Owned backup read barrier missing')),3000))]);
      authorized=false;hold=false;releaseRead();releaseRead=null;
      const revoked=await pending;assert.equal(revoked.status,403);assert.equal(Object.hasOwn(await revoked.json(),'items'),false);
      authorized=true;const recovered=await read('admin-token');assert.equal(recovered.status,200);assert.equal((await recovered.json()).total,0);
      assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.backup_runs')).rows[0].count,'0');
    }finally{hold=false;releaseRead?.();await pending?.catch(()=>{});await runtime.shutdown()}
  });
  const commandSnapshot=async pool=>(await pool.query(`SELECT
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM roomqc_control.clusters t) AS clusters,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.cluster_id),'[]'::jsonb)::text) FROM roomqc_control.cluster_policies t) AS policies,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM roomqc_control.control_commands t) AS commands,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM roomqc_control.cluster_events t) AS events`)).rows[0];
  dbtest('registry validate command fences changed approval after an observed lock wait; failure has no effects and recovery closes admission',async()=>{
    const {pool,store,config}=await fixture('admin_release_validate');
    const expected={clusterId:'cluster-a',releaseId:'fixture-v3',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
      migrationSetHash:'3'.repeat(64),schemaManifestHash:'a'.repeat(64)};
    const token=['header',Buffer.from(JSON.stringify({role:'roomqc_control_probe',exp:Math.floor(Date.now()/1000)+600})).toString('base64url'),'synthetic-signature'].join('.');
    const context=fixtureReleaseContext(cluster,expected);
    const approval=fixtureReleaseApproval(context,{epoch:2});
    await new ReleaseApprovalStore(pool,fixtureReleaseTrust).install(approval,context,
      {expectedVersion:1,key:randomUUID(),requestId:randomUUID(),reason:'Owned validation approval fixture'});
    const approved={version:2,entries:[{inventoryRef:'cluster-a',approval,credential:{publishableKey:cluster.publishableKey,token}}]};
    config.releaseValidation=new ReleaseValidationCatalog(approved,{trust:fixtureReleaseTrust});
    const gateway=new ClusterGateway(config,async(url,init)=>{
      assert.equal(url,cluster.url+'/rest/v1/rpc/control_cluster_manifest');
      assert.equal(init.headers.authorization,'Bearer '+token);assert.equal(init.headers.apikey,cluster.publishableKey);
      return {ok:true,json:async()=>({...expected,contractVersion:3,schemaFingerprintVersion:3,
        expectedSchemaManifestHash:expected.schemaManifestHash,challenge:JSON.parse(init.body).p_challenge,checkedAt:new Date().toISOString()})};
    },store);
    try{
      const validation=await gateway.validateCluster(await store.admin.cluster('cluster-a')),before=await commandSnapshot(pool);
      for(const bad of [undefined,{...validation,validationFingerprint:'invalid'},
        {...validation,manifest:{...validation.manifest,checkedAt:new Date(Date.now()-31000).toISOString()}}]){
        await assert.rejects(()=>fixtureAdminExecute(store.admin,actor,command('validate'),randomUUID(),bad),{code:'VALIDATION_REQUIRED'});
        assert.deepEqual(await commandSnapshot(pool),before);
      }
      const blocker=await pool.connect();let waiting=false,pending;
      try{
        await blocker.query('SELECT pg_advisory_lock(727001)');
        pending=fixtureAdminExecute(store.admin,actor,command('validate'),randomUUID(),validation).then(
          ()=>({succeeded:true}),error=>({code:error.code}));
        for(let i=0;i<100;i++){
          const result=await pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted
            AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
          if(Number(result.rows[0].count)>=1){waiting=true;break}
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        const changed=structuredClone(approved);
        changed.entries[0].approval=fixtureReleaseApproval({...context,expected:{...expected,artifactDigest:'e'.repeat(64)}},{epoch:2});
        config.releaseValidation=new ReleaseValidationCatalog(changed,{trust:fixtureReleaseTrust});
      }finally{await blocker.query('SELECT pg_advisory_unlock(727001)');blocker.release()}
      assert.equal(waiting,true,'The actual command must wait before its commit-side approval check');
      assert.deepEqual(await pending,{code:'VALIDATION_REQUIRED'});assert.deepEqual(await commandSnapshot(pool),before);
      config.releaseValidation=new ReleaseValidationCatalog(approved,{trust:fixtureReleaseTrust});
      const key=randomUUID(),result=await fixtureAdminExecute(store.admin,actor,command('validate',1,{},key),randomUUID(),validation);
      assert.equal(result.result.validationState,'valid');assert.equal(result.result.admission.decision,'manual_closed');
      assert.equal(result.targetVersion,2);assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.control_commands')).rows[0].count,'1');
      assert.equal((await pool.query("SELECT count(*) FROM roomqc_control.cluster_events WHERE source='admin'")).rows[0].count,'1');
      const manifest=(await pool.query("SELECT validation_manifest FROM roomqc_control.clusters WHERE id='cluster-a'")).rows[0].validation_manifest;
      assert.equal(manifest.expectationFingerprint,validation.manifest.expectationFingerprint);assert.equal(JSON.stringify(manifest).includes(token),false);
      assert.equal((await store.admin.commandResult(actor,{targetId:'cluster-a',operation:'validate',key})).commandId,result.commandId);
    }finally{await store.close()}
  });
  dbtest('admin command-result HTTP scopes actor, authority, target, operation and exact key without side effects',async()=>{
    const second={...cluster,id:'cluster-b',url:'https://backend-b.example.invalid'};
    const {pool,store,config}=await fixture('admin_result_scope',{clusters:[cluster,second]});
    const other={...actor,id:randomUUID()};let checks=0;
    const gateway={supportActor:async token=>{checks++;
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(token==='other-token')return other;
      if(token==='foreign-authority')return {...actor,clusterId:'cluster-b'};
      if(token!=='admin-token')throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor}};
    const runtime=await startControl(config,{store,gateway}),url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const input=command('close_admission',1,{},randomUUID().toUpperCase());
    const read=({target='cluster-a',query='operation=close_admission',key=input.key,token='admin-token'}={})=>fetch(
      `${url}/clusters/${target}/command-result?${query}`,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...(key===null?{}:{'Idempotency-Key':key})}});
    const expect=async(options,status,code)=>{
      const before=await commandSnapshot(pool),response=await read(options),body=await response.json();
      assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-request-id'),body.requestId);if(code)assert.equal(body.error,code);
      assert.equal(Object.hasOwn(body,'commandId'),status===200);assert.deepEqual(await commandSnapshot(pool),before);
      return body;
    };
    try{
      const saved=await fixtureAdminExecute(store.admin,actor,input,randomUUID());
      assert.equal((await expect({},200)).commandId,saved.commandId);
      for(const options of [{token:'other-token'},{target:'cluster-b'},{query:'operation=set_draining'},
        {key:randomUUID()},{key:input.key.toLowerCase()}])await expect(options,404,'COMMAND_RESULT_UNKNOWN');
      await expect({token:null},401,'LOGIN_REQUIRED');await expect({token:'owner-token'},403,'SUPPORT_ADMIN_REQUIRED');
      await expect({token:'foreign-authority'},403,'ADMIN_PERMISSION_REQUIRED');
      for(const options of [{key:null},{key:'invalid'},{key:input.key+','+input.key},{target:'CLUSTER-A'},
        {query:''},{query:'operation=unknown'},{query:'operation=close_admission&operation=close_admission'},
        {query:'operation=close_admission&actorId='+actor.id}])await expect(options,400,'INVALID_COMMAND_LOOKUP');
      await pool.query("UPDATE roomqc_control.control_commands SET authority_cluster_id='cluster-b' WHERE id=$1",[saved.commandId]);
      await expect({},404,'COMMAND_RESULT_UNKNOWN');
      await pool.query("UPDATE roomqc_control.control_commands SET authority_cluster_id='cluster-a' WHERE id=$1",[saved.commandId]);
      const theirs=await fixtureAdminExecute(store.admin,other,command('close_admission',2,{},input.key),randomUUID());
      assert.equal((await expect({token:'other-token'},200)).commandId,theirs.commandId);
      assert.equal((await expect({},200)).commandId,saved.commandId);
      assert.equal(checks,23,'Twenty entry checks plus fresh authority after each of the three successful result reads');
      assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.control_commands')).rows[0].count,'2');
      assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.cluster_events')).rows[0].count,'2');
    }finally{await runtime.shutdown()}
  });
  dbtest('admin command-result never treats uncommitted, started, failed or inconsistent receipts as success and can recover',async()=>{
    const {pool,store,config}=await fixture('admin_result_pending');
    const gateway=fixtureSupportGateway({supportActor:async()=>actor});
    const runtime=await startControl(config,{store,gateway}),url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const key=randomUUID(),pendingId=randomUUID();let transaction;
    const read=()=>fetch(url+'/clusters/cluster-a/command-result?operation=close_admission',{
      headers:{Authorization:'Bearer admin-token','Idempotency-Key':key},signal:AbortSignal.timeout(3000)});
    const expect=async(status,code)=>{
      const before=await commandSnapshot(pool),response=await read(),body=await response.json();
      assert.equal(response.status,status);if(code)assert.equal(body.error,code);
      assert.equal(Object.hasOwn(body,'commandId'),status===200);assert.deepEqual(await commandSnapshot(pool),before);
      return body;
    };
    try{
      const saved=await fixtureAdminExecute(store.admin,actor,command(),randomUUID());
      transaction=await pool.connect();await transaction.query('BEGIN');
      await transaction.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,
        idempotency_key,payload_hash,expected_version,reason,status,result)
        SELECT $1,actor_id,authority_cluster_id,operation,target_id,$2,payload_hash,expected_version,reason,'started',result
        FROM roomqc_control.control_commands WHERE id=$3`,[pendingId,key,saved.commandId]);
      await expect(404,'COMMAND_RESULT_UNKNOWN');
      await transaction.query('COMMIT');transaction.release();transaction=null;
      await expect(409,'COMMAND_RESULT_UNAVAILABLE');
      await pool.query("UPDATE roomqc_control.control_commands SET status='failed',finished_at=now() WHERE id=$1",[pendingId]);
      await expect(409,'COMMAND_RESULT_UNAVAILABLE');
      const original=JSON.parse(JSON.stringify({status:saved.status,targetVersion:saved.targetVersion,result:saved.result}));
      await pool.query("UPDATE roomqc_control.control_commands SET status='succeeded',finished_at=NULL WHERE id=$1",[pendingId]);
      await expect(409,'COMMAND_RESULT_UNAVAILABLE');
      for(const bad of [null,{...original,status:'failed'},{...original,targetVersion:'2'},
        {...original,result:{...original.result,id:'cluster-b'}},{...original,result:{...original.result,rowVersion:3}},
        {...original,result:{...original.result,health:{}}}]){
        await pool.query('UPDATE roomqc_control.control_commands SET result=$2::jsonb,finished_at=now() WHERE id=$1',[pendingId,JSON.stringify(bad)]);
        await expect(409,'COMMAND_RESULT_UNAVAILABLE');
      }
      const extra=structuredClone(original);extra.reason='private-marker';extra.result.credentialRef='private-marker';
      extra.result.admission.raw='private-marker';extra.result.health.metrics.raw='private-marker';
      extra.result.health.dataDisks=[{id:'database',freeBytes:1,totalBytes:10,inodeFreePercent:50,device:'private-marker',mountpoint:'private-marker'}];
      await pool.query('UPDATE roomqc_control.control_commands SET result=$2::jsonb WHERE id=$1',[pendingId,JSON.stringify(extra)]);
      const projected=await expect(200);assert.equal(JSON.stringify(projected).includes('private-marker'),false);
      assert.deepEqual(projected.result.health.dataDisks,[{id:'database',freeBytes:1,totalBytes:10,inodeFreePercent:50}]);
      await pool.query('UPDATE roomqc_control.control_commands SET result=$2::jsonb WHERE id=$1',[pendingId,JSON.stringify(original)]);
      const recovered=await expect(200);assert.deepEqual(recovered.result,original.result);assert.equal(recovered.commandId,pendingId);
      assert.equal((await pool.query('SELECT count(*) FROM roomqc_control.cluster_events')).rows[0].count,'1');
      assert.equal(Number((await pool.query("SELECT row_version FROM roomqc_control.clusters WHERE id='cluster-a'")).rows[0].row_version),2);
    }finally{
      if(transaction){await transaction.query('ROLLBACK');transaction.release()}
      await runtime.shutdown();
    }
  });
  dbtest('admin HTTP checks authority on every attempt and retry after a lost committed response returns the original receipt',async()=>{
    const {pool,store,config}=await fixture('admin_http');
    let authorized=true,checks=0,dropNext=false,dropped;
    // This test covers the HTTP boundary, not Supabase role/session internals.
    const gateway=fixtureSupportGateway({supportActor:async token=>{checks++;if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login required');
      if(token!=='admin-token'||!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Permission required');return actor}});
    let runtime=await startControl(config,{store,gateway});
    runtime.server.prependListener('request',(req,res)=>{if(dropNext&&req.url.endsWith('/commands'))res.end=function(body){dropNext=false;dropped=JSON.parse(body);res.destroy();return res}});
    let url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const read=key=>fetch(url+'/clusters/cluster-a/command-result?operation=close_admission',{
      headers:{Authorization:'Bearer admin-token','Idempotency-Key':key}});
    const post=(key,token='admin-token')=>fetch(url+'/clusters/cluster-a/commands',{method:'POST',headers:{Origin:config.publicOrigin,
      'Content-Type':'application/json','Idempotency-Key':key,...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify({operation:'close_admission',expectedVersion:1,reason:'Verify lost HTTP response',payload:{}})});
    try{
      for(const token of ['', 'owner-token','staff-token'])assert.equal((await post(randomUUID(),token)).status,token?403:401);
      const key=randomUUID().toUpperCase();dropNext=true;await assert.rejects(()=>post(key));
      assert.equal(checks,10,'Three entry denials, then seven checks across entry, durable-intent preparation, effect and acceptance');
      assert.equal((await pool.query('SELECT * FROM roomqc_control.control_commands WHERE idempotency_key=$1',[key])).rowCount,1);
      const resultResponse=await read(key);assert.equal(resultResponse.status,200);
      assert.equal(checks,12,'Result lookup checks authority at entry and after the read');
      assert.equal(resultResponse.headers.get('cache-control'),'no-store');
      const result=await resultResponse.json();assert.deepEqual({...result,requestId:dropped.requestId},dropped);
      assert.notEqual(result.requestId,dropped.requestId);assert.equal(resultResponse.headers.get('x-request-id'),result.requestId);
      const response=await post(key);assert.equal(response.status,200);const replay=await response.json();
      assert.equal(checks,14,'HTTP replay checks authority at entry and after the receipt read without another acceptance');
      assert.equal(replay.commandId,dropped.commandId);assert.notEqual(replay.requestId,dropped.requestId);assert.equal(replay.targetVersion,2);
      await runtime.shutdown();runtime=await startControl(config,{store:new ControlStore(config),gateway});
      url=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
      const restarted=await read(key);assert.equal(restarted.status,200);
      assert.equal(checks,16,'Result lookup after restart retains both authorization boundaries');
      const persisted=await restarted.json();assert.deepEqual({...persisted,requestId:dropped.requestId},dropped);
      assert.notEqual(persisted.requestId,result.requestId);
      authorized=false;assert.equal((await post(key)).status,403);
      assert.equal((await read(key)).status,403);
      assert.equal((await fetch(url+'/clusters',{headers:{Authorization:'Bearer admin-token'}})).status,403);
      assert.equal(checks,19,'Three revoked entry attempts must not reach reads or mutations');
      assert.equal((await pool.query('SELECT * FROM roomqc_control.cluster_events')).rowCount,1);
      assert.equal((await pool.query('SELECT * FROM roomqc_control.control_commands')).rowCount,1);
    }finally{await runtime.shutdown()}
  });
}
