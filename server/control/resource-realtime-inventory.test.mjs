import test from 'node:test';
import assert from 'node:assert/strict';
import {realtimeResourceInventory,realtimeTenantResourceComponents} from './resource-vendor-realtime.mjs';
import {realtimeResourceSnapshotSource,parseRealtimeResourceSnapshot} from './resource-realtime-observation.mjs';
import {vendorResourceCatalog} from './resource-vendor-catalog.mjs';
const image=vendorResourceCatalog.entries.find(e=>e.id==='realtime').image;
const service=()=>({image,environment:{DB_POOL_SIZE:'2',RUN_JANITOR:'true',SEED_SELF_HOST:'true',ERL_AFLAGS:'-proto_dist inet_tcp'}});
test('Realtime inventory keeps metadata, janitor, discovery, tenant rows and restart reseeding separate',()=>{
  const r=realtimeResourceInventory(service(),{image});
  assert.equal(r.metadata.activePoolMax,2);assert.equal(r.scheduledMaintenance.maxConcurrentTasks,5);
  assert.equal(r.startup.storedTenantOverridesSurviveReseed,false);
  assert.ok(r.unresolvedReasons.includes('self_host_seed_deletes_and_recreates_existing_tenant'));
  for(const key of ['plannedServerConnections','tenantCount'])assert.equal(r[key],null);
  for(const key of ['poolPlanVerified','capacityProven','tenantSettingsObserved'])assert.equal(r[key],false);
  assert.equal(r.healthUsesExistingConnectPool,true);
});
test('tenant recipe uses persisted db_pool and actual subcriber key, never DB_POOL_SIZE or subs_pool_size',()=>{
  const r=realtimeTenantResourceComponents({DB_POOL_SIZE:2,subs_pool_size:1,postgres_changes_pool:2,db_password:'fixture-private-password'});
  assert.equal(r.configuredClientConnections,7);assert.equal(r.configuredReplicationSessions,1);assert.equal(r.configuredSessions,8);
  assert.equal(r.components.find(c=>c.id==='subscriptions').max,4);
  assert.equal(r.vendorReadinessEstimate.subscriberPoolMax,1);
  assert.equal(r.vendorReadinessEstimate.subscriberInputMatchesActual,false);
  assert.equal(r.dedicatedHealthConnections,0);assert.equal(r.tenantTlsPolicy,'verify-none');
  assert.equal(r.tenantTlsPeerVerified,false);assert.ok(!JSON.stringify(r).includes('fixture-private-password'));
  assert.deepEqual(r.transientComponents.find(c=>c.id==='dashboard-pgdelta-pool'),
    {id:'dashboard-pgdelta-pool',maxPerPool:5,globalConcurrencyBoundVerified:false});
  const changed=realtimeTenantResourceComponents({db_pool:3,subcriber_pool_size:2,subs_pool_size:99,ssl_enforced:false});
  assert.equal(changed.configuredSessions,8);assert.equal(changed.components[0].max,3);
  assert.equal(changed.components[2].max,2);assert.equal(changed.tenantTlsPolicy,'disabled');
  assert.equal(changed.vendorReadinessEstimate.subscriberPoolMax,99);
  assert.equal(changed.vendorReadinessEstimate.rawSessionEstimate,110);assert.equal(changed.vendorReadinessEstimate.requirement,105);
  for(const value of [null,false])assert.equal(realtimeTenantResourceComponents({subcriber_pool_size:value}).components[2].max,1);
});
test('invalid persisted pools cannot be clamped, ignored or converted to a successful inventory',()=>{
  for(const key of ['db_pool','subcriber_pool_size','subs_pool_size'])for(const value of [0,-1,1.5,'2','',10001,{},[]])
    assert.throws(()=>realtimeTenantResourceComponents({[key]:value}),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  assert.throws(()=>realtimeTenantResourceComponents(null));
});
test('regional metadata replicas are not all counted as running and unknown selection stays unresolved',()=>{
  const s=service();s.environment.DB_MASTER_REGION='different';s.environment.DB_REPLICA_POOL_SIZE='7';
  const r=realtimeResourceInventory(s,{image});assert.equal(r.metadata.activePoolMax,null);
  assert.equal(r.metadata.readReplicaPoolMax,7);assert.equal(r.metadata.activeRepoSelectionVerified,false);
  assert.equal(r.plannedServerConnections,null);
});
test('pinned inventory refuses alternate release code, mounted code and Erlang loader injection',()=>{
  for(const mutate of [s=>s.image+='x',s=>s.command=['sh','-c','/app/bin/server'],s=>s.entrypoint=['sh'],s=>s.volumes=[{target:'/app'}],
    s=>s.environment.ERL_AFLAGS='-eval evil',s=>s.environment.ERL_FLAGS='-pa /data',s=>s.environment.ERL_ZFLAGS='-eval evil',
    s=>s.environment.RELEASE_CONFIG_DIR='/data',s=>s.environment.MIX_ENV='dev']){
    const s=service();mutate(s);assert.throws(()=>realtimeResourceInventory(s,{image}),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
  }
  for(const value of ['0','02','2.5','2oops','-1','10001']){
    const s=service();s.environment.DB_POOL_SIZE=value;assert.throws(()=>realtimeResourceInventory(s,{image}),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  }
  const s=service();s.environment.CLUSTER_STRATEGIES='fixture-private-password';s.environment.DB_AFTER_CONNECT_QUERY='private';
  const r=realtimeResourceInventory(s,{image});assert.ok(!JSON.stringify(r).includes('fixture-private-password'));
  assert.ok(r.unresolvedReasons.includes('metadata_after_connect_sql_not_reviewed'));
});
const snapshot=()=>({schemaVersion:1,tenantCount:1,extensions:[{tenantSha256:'a'.repeat(64),targetSha256:'b'.repeat(64),dbPool:1,
  subscriberPool:4,guardSubscriberPool:1,sslEnforced:false,persistedSettingsSha256:'c'.repeat(64)}],metadata:{configuredPoolMax:2,runningRepo:true,primary:true,
    loadedPoolSizeIndependentlyVerified:false},healthUsesExistingConnectPool:true});
const parse=v=>parseRealtimeResourceSnapshot('ROOMQC_REALTIME_INVENTORY '+JSON.stringify(v)+'\n');
test('runtime snapshot parser accepts only bounded redacted entries and cannot promote runtime/capacity proof',()=>{
  assert.deepEqual(parse(snapshot()),snapshot());
  for(const mutate of [r=>r.password='private',r=>r.tenantCount=2,r=>r.metadata.loadedPoolSizeIndependentlyVerified=true,
    r=>r.extensions[0].dbPool=0,r=>r.extensions[0].subscriberPool='private',r=>r.extensions[0].targetSha256='private',
    r=>r.extensions[0].db_password='private',r=>r.healthUsesExistingConnectPool=false,r=>r.metadata.runningRepo=false,
    r=>{r.tenantCount=2;r.extensions.push({...r.extensions[0]})}]){
    const r=snapshot();mutate(r);assert.throws(()=>parse(r),{code:'RESOURCE_REALTIME_OBSERVATION_INVALID'});
  }
  for(const output of ['', 'ROOMQC_REALTIME_INVENTORY {',('ROOMQC_REALTIME_INVENTORY '+JSON.stringify(snapshot())+'\n').repeat(2)])
    assert.throws(()=>parseRealtimeResourceSnapshot(output),{code:'RESOURCE_REALTIME_OBSERVATION_INVALID'});
  const source=realtimeResourceSnapshotSource();assert.ok(source.includes('limit: 257'));assert.ok(source.includes('decrypt_settings'));
  assert.ok(!source.includes('Application.ensure_all_started'));assert.ok(!source.includes('Jason.encode!(settings)'));
});
