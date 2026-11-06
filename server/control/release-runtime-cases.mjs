import {fixtureAdminExecute} from './support-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {ControlStore} from './store.mjs';
import {ClusterGateway} from './cluster.mjs';
import {clusterCommand} from './admin.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {fixtureReleaseTrust,fixtureReleaseContext,fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {ReleaseValidationCatalog} from './release-validation.mjs';
import {ReleaseApprovalStore} from './release-authority.mjs';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {startControl} from './server.mjs';

const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:()=>resolve()}};
const command=(operation,version=1)=>clusterCommand({operation,expectedVersion:version,reason:'Owned signed runtime test',payload:{}},randomUUID(),'cluster-a');
const requestOptions=expectedVersion=>({expectedVersion,key:randomUUID(),requestId:randomUUID(),reason:'Owned runtime approval fixture'});
const withdraw=(f,mode)=>mode==='key'
  ?f.authority.withdrawKey(fixtureReleaseTrust.verify(f.approval,f.context).keyFingerprint,requestOptions(0))
  :f.authority.withdraw(f.context.clusterId,f.approval.payload.approvalId,requestOptions(1));
export function registerReleaseRuntimeCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label,selected=cluster){
    const {pool,url}=await database(label);await migrateDirectory(pool);await importInitialRegistry(pool,[selected]);await seedOperationalCluster(pool);
    const role='release_runtime_api_'+(++serial);await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const runtimeUrl=new URL(url);runtimeUrl.username=role;
    const config=fixtureConfig(runtimeUrl.href,[selected]),store=new ControlStore(config),actor={id:randomUUID(),clusterId:cluster.id};
    const context=fixtureReleaseContext(selected,syntheticRelease),approval=fixtureReleaseApproval(context);
    return {pool,config,store,actor,context,approval,authority:new ReleaseApprovalStore(store.pool,fixtureReleaseTrust)};
  }
  const effectSnapshot=async pool=>(await pool.query(`SELECT
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) FROM roomqc_control.clusters t) AS clusters,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY cluster_id),'[]'::jsonb)::text) FROM roomqc_control.cluster_health_current t) AS health,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) FROM roomqc_control.workspaces t) AS workspaces,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) FROM roomqc_control.control_commands t) AS commands,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) FROM roomqc_control.cluster_events t) AS events,
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) FROM roomqc_control.attempts t) AS attempts`)).rows[0];
  for(const mode of ['approval','key'])dbtest('signed runtime DB: '+mode+' withdrawal fences reserve, open gate and provisioning retry even if operator flags are cleared',async()=>{
    const f=await fixture('signed_runtime_dispatch_'+mode);
    try{
      const input={slug:'signed-runtime-hotel',email:'owner@example.invalid',displayName:'Owned runtime fixture'};
      const reserved=await f.store.reserve(input,randomUUID()),user={id:randomUUID(),email:input.email};
      const started=await f.store.beginProvision(reserved,user,randomUUID());assert.equal(started.status,'provisioning');
      await withdraw(f,mode);
      await f.pool.query('UPDATE roomqc_control.cluster_policies SET manual_closed=false,operator_reopen_required=false');
      const before=await effectSnapshot(f.pool);
      assert.ok((await f.store.admin.cluster(cluster.id)).release_authority_current===false);
      await assert.rejects(()=>f.store.reserve({...input,slug:'blocked-runtime-hotel',email:'other@example.invalid'},randomUUID()),{code:'NO_CAPACITY'});
      await assert.rejects(()=>f.store.beginProvision(started,user,randomUUID()),{code:'PROVISIONING_WAIT'});
      await assert.rejects(()=>fixtureAdminExecute(f.store.admin,f.actor,command('open_admission'),randomUUID()),{code:'ADMISSION_BLOCKED'});
      await assert.rejects(()=>f.store.authorizeRelease({id:cluster.id}),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await effectSnapshot(f.pool),before);
      const old=await f.store.workspace(input.slug);assert.equal(old.id,reserved.id);assert.equal(old.status,'provisioning');
    }finally{await f.store.close()}
  });
  for(const mode of ['approval','key'])dbtest('signed runtime DB: actual held HTTP manifest cannot validate after '+mode+' withdrawal and next call sends no request',async()=>{
    const entered=deferred(),release=deferred();let calls=0;
    const server=createServer(async(req,res)=>{
      calls++;let body='';for await(const part of req)body+=part;
      const challenge=JSON.parse(body).p_challenge;entered.resolve();await release.promise;
      res.setHeader('content-type','application/json');res.end(JSON.stringify({...syntheticRelease,challenge,
        contractVersion:3,schemaFingerprintVersion:3,expectedSchemaManifestHash:syntheticRelease.schemaManifestHash,checkedAt:new Date().toISOString()}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const selected={...cluster,url:'http://127.0.0.1:'+server.address().port},f=await fixture('signed_runtime_held_'+mode,selected);
    const gateway=new ClusterGateway(f.config,undefined,f.store);
    try{
      const pending=gateway.validateCluster(await f.store.admin.cluster(cluster.id));
      await entered.promise;
      await withdraw(f,mode);
      const before=await effectSnapshot(f.pool);release.resolve();const validation=await pending;
      await assert.rejects(()=>fixtureAdminExecute(f.store.admin,f.actor,command('validate'),randomUUID(),validation),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await effectSnapshot(f.pool),before);
      await assert.rejects(async()=>gateway.validateCluster(await f.store.admin.cluster(cluster.id)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.equal(calls,1);assert.deepEqual(await effectSnapshot(f.pool),before);
    }finally{release.resolve();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.store.close()}
  });
  for(const mode of ['approval','key'])dbtest('signed runtime DB: receipt recovery after '+mode+' withdrawal never dispatches another provision write',async()=>{
    const f=await fixture('signed_runtime_receipt_'+mode);let runtime;
    try{
      const input={slug:'signed-receipt-hotel',email:'receipt@example.invalid',displayName:'Owned receipt fixture'};
      const reserved=await f.store.reserve(input,randomUUID()),user={id:randomUUID(),email:input.email};
      await f.store.beginProvision(reserved,user,randomUUID());
      await withdraw(f,mode);
      const receipt={workspace_id:reserved.id,tenant_id:randomUUID(),hotel_id:randomUUID(),owner_id:user.id};let writes=0,reads=0;
      runtime=await startControl(f.config,{store:f.store,gateway:{user:async()=>user,binding:async()=>{reads++;return receipt},
        provision:async()=>{writes++;throw Error('Unexpected provision dispatch')}}});
      const response=await fetch('http://127.0.0.1:'+runtime.server.address().port+'/api/control/workspaces/'+input.slug+'/provision',
        {method:'POST',headers:{origin:f.config.publicOrigin,'content-type':'application/json',authorization:'Bearer synthetic-owner'},body:'{}'});
      assert.equal(response.status,200);const result=await response.json();assert.equal(result.success,true);assert.equal(result.idempotent,true);
      assert.equal(result.tenant_id,receipt.tenant_id);assert.equal(writes,0);assert.equal(reads,1);
      const active=await f.store.workspace(input.slug);assert.equal(active.status,'active');assert.equal(active.cluster_id,cluster.id);
      assert.equal(active.tenant_id,receipt.tenant_id);assert.equal(active.routing_version,reserved.routing_version);
    }finally{if(runtime)await runtime.shutdown();else await f.store.close()}
  });
}
