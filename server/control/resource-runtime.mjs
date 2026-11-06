import {resolve} from 'node:path';
import {ControlError} from './errors.mjs';
import {loadResourceBudgetSnapshot,bindControlBudget} from './resource-budget.mjs';

const mismatch=()=>new ControlError(400,'RESOURCE_RUNTIME_MISMATCH','Cấu hình dịch vụ không khớp ngân sách tài nguyên chung.');
const required=()=>new ControlError(400,'RESOURCE_BUDGET_REQUIRED','Cần cấu hình ngân sách tài nguyên chung trước khi khởi chạy dịch vụ.');
export function resourcePoolObservationMode(env=process.env){
  const value=env.ROOMQC_RESOURCE_POOL_OBSERVATIONS;
  if(value!==undefined&&!['true','false'].includes(value))throw mismatch();
  return value==='true';
}
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value};

export function resourceMode(env=process.env){
  const environment=env.ROOMQC_RESOURCE_ENVIRONMENT??(env.NODE_ENV==='production'?'production':'local');
  if(!['local','staging','production'].includes(environment)||(env.NODE_ENV==='production'&&environment==='local'))throw mismatch();
  return {environment,production:environment!=='local'};
}
/** Metadata only. The legacy API path is an alias, never a second budget. */
export function loadRuntimeResourceContext(env=process.env,{kind,legacyFile}={}){
  const mode=resourceMode(env),file=env.ROOMQC_RESOURCE_BUDGET_FILE??legacyFile;
  if(legacyFile&&env.ROOMQC_RESOURCE_BUDGET_FILE&&resolve(legacyFile)!==resolve(env.ROOMQC_RESOURCE_BUDGET_FILE))throw mismatch();
  if(!file){if(mode.production)throw required();return null}
  const {budget,sha256:budgetSha256}=loadResourceBudgetSnapshot(file);
  if(mode.production?budget.environment!==mode.environment:!['local','example'].includes(budget.environment))throw mismatch();
  let database;
  if(kind==='directory'){
    database=budget.databases.find(d=>d.kind==='directory');
    if(env.ROOMQC_RESOURCE_DATABASE_ID&&env.ROOMQC_RESOURCE_DATABASE_ID!==database.id)throw mismatch();
  }else if(kind==='business'){
    if(!env.ROOMQC_RESOURCE_DATABASE_ID)throw mismatch();
    database=budget.databases.find(d=>d.kind==='business'&&d.id===env.ROOMQC_RESOURCE_DATABASE_ID);
  }else throw mismatch();
  if(!database)throw mismatch();
  return freeze({budget,budgetSha256,databaseId:database.id,environment:mode.environment,production:mode.production});
}
function databaseFor(config,kind){
  const context=config.resourceContext;
  if(!context){if(config.production)throw required();return null}
  if(!context.budget||!/^[a-f0-9]{64}$/.test(context.budgetSha256??'')||!['local','staging','production'].includes(context.environment)
    ||context.production!==(context.environment!=='local')||!!config.production!==context.production
    ||(context.production?context.budget.environment!==context.environment:!['local','example'].includes(context.budget.environment)))throw mismatch();
  const database=context.budget.databases.find(d=>d.id===context.databaseId&&d.kind===kind);
  if(!database)throw mismatch();return database;
}
function onePool(database,id,poolMax,replicas){
  const consumer=database.consumers.find(c=>c.id===id);
  if(!consumer||!Number.isSafeInteger(replicas)||replicas<1||consumer.replicas!==replicas||consumer.poolMax!==poolMax
    ||consumer.fixedConnectionsPerReplica!==0||consumer.pools.length!==1||consumer.pools[0].max!==poolMax)throw mismatch();
  return consumer;
}
function same(actual,expected){if(actual!==expected)throw mismatch()}
export function assertControlResources(config){
  const directory=databaseFor(config,'directory');if(!directory)return;
  if(config.resourceBudget!==config.resourceContext.budget)throw mismatch();
  bindControlBudget(config.resourceBudget,{poolMax:config.poolMax,poolBudget:config.poolBudget,apiInstances:config.apiInstances,
    production:config.resourceContext.environment==='production'});
}
export function assertHealthResources(config){
  const directory=databaseFor(config,'directory');if(!directory)return;
  const b=config.connectionBudget;
  same(b.maxConnections,directory.maxConnections);same(b.reservedConnections,directory.reservedConnections);
  onePool(directory,'health-worker',config.poolMax,b.healthInstances);
  onePool(directory,'control-api',b.apiPoolMax,b.apiInstances);
  const reconcile=directory.consumers.find(c=>c.id==='provisioning-worker');
  same(reconcile.replicas,b.reconcileInstances);same(reconcile.poolMax,b.reconcilePoolMax);same(reconcile.fixedConnectionsPerReplica,0);
  same(directory.consumers.find(c=>c.id==='db-exporter').connections,b.exporterConnections);
  same(directory.consumers.find(c=>c.id==='migration').connections,b.migrationConnections);
  const catalog=directory.consumers.find(c=>c.id==='probe-catalog');
  if(config.schemaVersion===2)onePool(directory,'probe-catalog',b.probePoolMax,b.probeInstances);
  else if(catalog.replicas!==0)throw mismatch();
}
export function assertAlertResources(config){
  const directory=databaseFor(config,'directory');if(!directory)return;
  const b=config.connectionBudget,consumer=onePool(directory,'alert-worker',config.poolMax,b.instances);
  same(b.maxConnections,directory.maxConnections);same(b.reservedConnections,directory.reservedConnections);
  same(b.otherAllocatedConnections,directory.allocatedConnections-consumer.connections);
}
export function assertProvisioningResources(config){
  const directory=databaseFor(config,'directory');if(!directory)return;
  const b=config.connectionBudget,consumer=onePool(directory,'provisioning-worker',config.poolMax,b.instances);
  same(b.maxConnections,directory.maxConnections);same(b.reservedConnections,directory.reservedConnections);
  same(b.otherAllocatedConnections,directory.allocatedConnections-consumer.connections);
}
export function assertDeploymentResources(config){
  same(config.poolMax,1);
  const directory=databaseFor(config,'directory');if(!directory)return;
  onePool(directory,'deployment-executor',1,config.executorInstances);
}
export function assertHostObserverResources(config){
  same(config.poolMax,1);
  const directory=databaseFor(config,'directory');if(!directory)return;
  onePool(directory,'host-observer',1,config.observerInstances);
}
/** One explicitly budgeted, one-shot reader; do not borrow migration reserve. */
export function assertBackfillResources(config){
  const directory=databaseFor(config,'directory');if(!directory)return;
  onePool(directory,'setup-backfill-reader',1,1);
}
/** A writer is a separate, explicitly budgeted one-shot process, even locally. */
export function assertBackfillApplyResources(config){
  if(!config.resourceContext)throw required();
  onePool(databaseFor(config,'directory'),'setup-backfill-writer',1,1);
}
export function assertBookingResources(config){
  const database=databaseFor(config,'business');if(!database)return;
  const b=config.connectionBudget,consumer=onePool(database,'external-notifications',2,b.workerInstances);
  same(b.workerPoolMax,2);same(b.maxConnections,database.maxConnections);same(b.reservedConnections,database.reservedConnections);
  same(b.otherConnections,database.allocatedConnections-consumer.connections);
}
/** Allowlisted metadata cached at startup; never reread a potentially changed mount. */
export function runtimeResourceView(config,adapter){
  if(!config.resourceContext)return null;
  const validators={'control-api':assertControlResources,'health-worker':assertHealthResources,
    'alert-worker':assertAlertResources,'external-notifications':assertBookingResources,'provisioning-worker':assertProvisioningResources,
    'deployment-executor':assertDeploymentResources,'host-observer':assertHostObserverResources};
  if(!Object.hasOwn(validators,adapter))throw mismatch();
  validators[adapter](config);
  const context=config.resourceContext,database=context.budget.databases.find(d=>d.id===context.databaseId);
  const ids=adapter==='health-worker'&&config.schemaVersion===2?['health-worker','probe-catalog']:[adapter];
  return freeze({schemaVersion:1,budgetSha256:context.budgetSha256,environment:context.environment,databaseId:context.databaseId,
    consumers:ids.map(id=>{const c=database.consumers.find(c=>c.id===id);return {id,replicas:c.replicas,
      pools:c.pools.map(p=>({id:p.id,max:p.max})),fixedConnectionsPerReplica:c.fixedConnectionsPerReplica}})});
}
