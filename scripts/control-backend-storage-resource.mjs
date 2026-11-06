import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {preflightResourceConsumers} from '../server/control/resource-vendor.mjs';
import {vendorResourceCatalog} from '../server/control/resource-vendor-catalog.mjs';

export function configureStorageResourceFixture(bundle,state){
  const env=bundle.services.storage.environment,url=new URL(env.DATABASE_URL);
  url.searchParams.set('sslmode','disable');
  Object.assign(env,{DATABASE_URL:url.href,DATABASE_ENGINE:'postgres',DATABASE_MAX_CONNECTIONS:'2',
    DATABASE_APPLICATION_NAME:'roomqc-storage-owned-'+state.run,DATABASE_CONNECTION_TIMEOUT:'15000',
    WORKERS_NUM:'1',MULTI_TENANT:'false',IS_MULTITENANT:'false',PG_QUEUE_ENABLE:'false',ENABLE_QUEUE_EVENTS:'false',
    PG_QUEUE_WORKERS_ENABLE:'false',VECTOR_ENABLED:'false',VECTOR_STORE_MIGRATIONS_ENABLED:'false',ICEBERG_ENABLED:'false',
    DATABASE_ENABLE_QUERY_CANCELLATION:'false',DATABASE_TLS_SESSION_RESUMPTION:'false',DATABASE_POOL_URL:'',
    DATABASE_MULTITENANT_URL:'',DATABASE_MULTITENANT_POOL_URL:'',MULTITENANT_DATABASE_URL:'',MULTITENANT_DATABASE_POOL_URL:'',
    PG_QUEUE_CONNECTION_URL:'',VECTOR_DATABASE_URL:'',CLUSTER_DISCOVERY:''});
}
export async function storageResourceFixturePlan({repository,state,bundle}){
  const raw=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));
  raw.environment='local';for(const db of raw.databases)for(const c of db.consumers)c.replicas=0;
  // The budget schema always reserves its Control API. This projection does
  // not launch or attest that API; preserve it as explicitly unresolved.
  raw.databases.find(d=>d.kind==='directory').consumers.find(c=>c.id==='control-api').replicas=1;
  const db=raw.databases.find(d=>d.kind==='business'),c=db.consumers.find(c=>c.id==='storage');
  c.replicas=1;c.pools=[{id:'main',max:2}];c.fixedConnectionsPerReplica=2;
  const budgetFile=join(state.root,'storage-allocation.json'),bytes=JSON.stringify(raw);await writeFile(budgetFile,bytes,{flag:'wx',mode:0o600});
  const id=state.projectId+'-storage-plan',report=await preflightResourceConsumers({schemaVersion:1,environment:'local',budgetFile,
    budgetSha256:createHash('sha256').update(bytes).digest('hex'),vendorCatalogId:vendorResourceCatalog.id,nativeProjects:[],
    vendorProjects:[{id,files:[join(state.root,'runtime.compose.json')],envFiles:[],profiles:[],services:[{
      name:'storage',adapter:'storage',databaseId:db.id,image:bundle.services.storage.image}]}]},
    {resolveProject:async()=>({name:id,services:{storage:bundle.services.storage}})});
  assert.equal(report.fullyCovered,false);assert.equal(report.services[0].poolPlanVerified,true);
  assert.equal(report.services[0].plannedServerConnections,4);
  assert.equal(report.unresolvedConsumers.length,1);assert.equal(report.unresolvedConsumers[0].consumerId,'control-api');
  return {scope:'Storage-only owned diagnostic allocation; other live sandbox services are outside this projection',
    recipe:report.services[0],budgetSha256:report.budgetSha256,vendorCatalogSha256:report.vendorCatalogSha256,
    unresolvedConsumers:report.unresolvedConsumers,fullyCovered:false,
    wholeStackInventoryVerified:false,capacityProven:false};
}
