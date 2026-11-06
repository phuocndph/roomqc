import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {preflightResourceConsumers} from '../server/control/resource-vendor.mjs';
import {vendorResourceCatalog} from '../server/control/resource-vendor-catalog.mjs';
import {realtimeTenantResourceComponents} from '../server/control/resource-vendor-realtime.mjs';
import {realtimeResourceSnapshotSource,parseRealtimeResourceSnapshot} from '../server/control/resource-realtime-observation.mjs';
export function configureRealtimeResourceFixture(bundle){
  // Retain the baseline's janitor, discovery, seed and data features. Only the
  // metadata pool is made explicit, to expose the distinction from data pools.
  Object.assign(bundle.services.realtime.environment,{DB_POOL_SIZE:'2',DB_SSL:'false'});
}
export async function runRealtimeResourceDiagnostic({repository,state,bundle,privateRun,runClient,sql,input,captureSchemaChanges,progress=()=>{}}){
  const publicationBefore=await sql(state,"SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime_messages_publication');");
  assert.equal(publicationBefore,'f','Only the new owned fixture publication may be removed');
  const raw=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));
  raw.environment='local';for(const db of raw.databases)for(const c of db.consumers)c.replicas=0;
  raw.databases.find(d=>d.kind==='directory').consumers.find(c=>c.id==='control-api').replicas=1;
  const db=raw.databases.find(d=>d.kind==='business'),consumer=db.consumers.find(c=>c.id==='realtime');consumer.replicas=1;
  const bytes=JSON.stringify(raw),budgetFile=join(state.root,'realtime-inventory.json'),id=state.projectId+'-realtime-plan';
  await writeFile(budgetFile,bytes,{flag:'wx',mode:0o600});
  const plan=await preflightResourceConsumers({schemaVersion:1,environment:'local',budgetFile,
    budgetSha256:createHash('sha256').update(bytes).digest('hex'),vendorCatalogId:vendorResourceCatalog.id,nativeProjects:[],
    vendorProjects:[{id,files:[join(state.root,'runtime.compose.json')],envFiles:[],profiles:[],services:[{
      name:'realtime',adapter:'realtime',databaseId:db.id,image:bundle.services.realtime.image}]}]},
    {resolveProject:async()=>({name:id,services:{realtime:bundle.services.realtime}})});
  assert.equal(plan.fullyCovered,false);assert.equal(plan.services[0].poolPlanVerified,false);
  assert.equal(plan.services[0].inventory.metadata.activePoolMax,2);assert.equal(plan.services[0].inventory.scheduledMaintenance.enabled,true);
  const container=state.projectId+'-realtime';
  const rpc=async source=>(await privateRun('docker',['exec','--env','ERL_FLAGS=+S 1:1',container,'/app/bin/realtime','rpc',source],{timeout:60000})).stdout;
  const snapshot=async()=>parseRealtimeResourceSnapshot(await rpc(realtimeResourceSnapshotSource()));
  const initialSnapshot=await snapshot();assert.equal(initialSnapshot.tenantCount,1);
  assert.equal(initialSnapshot.extensions[0].dbPool,1);assert.equal(initialSnapshot.extensions[0].subscriberPool,4);
  const exercise=async(phase,connectPool,subscriberPool)=>JSON.parse((await runClient(
    "import {runRealtimeResourceChecks} from '/control/testing/realtime-resource-native.mjs'; console.log(JSON.stringify(await runRealtimeResourceChecks(JSON.parse(process.env.ROOMQC_FIXTURE_REALTIME_INPUT))));",
    {ROOMQC_FIXTURE_REALTIME_INPUT:JSON.stringify({...input,phase,connectPool,subscriberPool})},180000,{memory:'256m'})).stdout);
  const initial=await exercise('default',1,4);
  progress(initial);
  await sql(state,`UPDATE _realtime.extensions SET settings=settings || '{"db_pool":3,"subcriber_pool_size":2,"subs_pool_size":99}'::jsonb
    WHERE tenant_external_id='realtime-dev' AND type='postgres_cdc_rls';`,{databaseRole:'supabase_admin'});
  await rpc('Realtime.Tenants.Cache.invalidate_tenant_cache("realtime-dev"); IO.puts("ROOMQC_REALTIME_CACHE_INVALIDATED")');
  const overrideSnapshot=await snapshot();assert.equal(overrideSnapshot.extensions[0].dbPool,3);assert.equal(overrideSnapshot.extensions[0].subscriberPool,2);
  assert.equal(overrideSnapshot.extensions[0].guardSubscriberPool,99);
  assert.notEqual(overrideSnapshot.extensions[0].persistedSettingsSha256,initialSnapshot.extensions[0].persistedSettingsSha256);
  assert.equal(overrideSnapshot.extensions[0].targetSha256,initialSnapshot.extensions[0].targetSha256);
  const guardMismatch=await exercise('guard-mismatch',3,2);progress(guardMismatch);
  await sql(state,`UPDATE _realtime.extensions SET settings=jsonb_set(settings,'{subs_pool_size}','2'::jsonb)
    WHERE tenant_external_id='realtime-dev' AND type='postgres_cdc_rls';`,{databaseRole:'supabase_admin'});
  await rpc('Realtime.Tenants.Cache.invalidate_tenant_cache("realtime-dev"); IO.puts("ROOMQC_REALTIME_CACHE_INVALIDATED")');
  const correctedSnapshot=await snapshot();assert.equal(correctedSnapshot.extensions[0].subscriberPool,2);assert.equal(correctedSnapshot.extensions[0].guardSubscriberPool,2);
  const overridden=await exercise('overrides',3,2);
  progress(overridden);
  const before=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
  await privateRun('docker',['restart',container],{timeout:60000});
  const after=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
  assert.equal(after.Image,before.Image);assert.notEqual(after.State.StartedAt,before.State.StartedAt);
  // The RPC starts only after the node is available. A restart is not success
  // until the observed tenant row and actual channels have returned.
  let restartedSnapshot;const deadline=Date.now()+60000;
  while(Date.now()<deadline){try{const candidate=await snapshot();if(candidate.extensions[0]?.dbPool===1&&candidate.extensions[0]?.subscriberPool===4){restartedSnapshot=candidate;break}}catch{}
    await new Promise(r=>setTimeout(r,500))}
  assert.ok(restartedSnapshot);assert.equal(restartedSnapshot.extensions[0].dbPool,1);assert.equal(restartedSnapshot.extensions[0].subscriberPool,4);
  assert.equal(restartedSnapshot.extensions[0].targetSha256,initialSnapshot.extensions[0].targetSha256);
  const restarted=await exercise('restart-defaults',1,4);
  progress(restarted);
  const schemaChanges=await captureSchemaChanges();
  // The first broadcast replication creates this exact vendor publication.
  // Stop the owned process before removing only the publication proven absent
  // at entry; the caller still compares the complete original schema hash.
  await privateRun('docker',['stop','--time','20',container],{timeout:60000});
  const stopped=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
  assert.equal(stopped.State.Running,false);assert.equal(stopped.Image,after.Image);
  await sql(state,'DROP PUBLICATION supabase_realtime_messages_publication;',{databaseRole:'supabase_admin'});
  return {verified:true,checks:initial.checks+guardMismatch.checks+overridden.checks+restarted.checks,initial,guardMismatch,overridden,restarted,
    snapshots:{initial:initialSnapshot,inconsistent:overrideSnapshot,corrected:correctedSnapshot,restarted:restartedSnapshot},
    defaultTenantRecipe:realtimeTenantResourceComponents({}),actualContainerRestart:true,
    reseedResetsPersistedPoolOverridesVerified:true,plan:plan.services[0],unresolvedServices:plan.unresolvedServices,
    fixturePublicationCleanup:{verified:true,publicationInitiallyAbsent:true,ownedRealtimeStopped:true,
      exactPublicationRemoved:'supabase_realtime_messages_publication',schemaChangesBeforeCleanup:schemaChanges},
    unresolvedConsumers:plan.unresolvedConsumers,wholeStackInventoryVerified:false,capacityProven:false,productAcceptance:false};
}
