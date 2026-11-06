import {createHash} from 'node:crypto';
import {assertSummaryCredentialBudget} from './tenant-summary-installer.mjs';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
const fail=()=>{throw Object.assign(new Error('SUMMARY_ROTATION_RESOURCE_INVALID'),{code:'SUMMARY_ROTATION_RESOURCE_INVALID'})};
const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
 ?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
// Hash metadata as expressed INSIDE the container. Never hash/read secret
// contents here. POSIX paths retain identical spelling in the Windows planner.
export const summaryResourceConfigurationHash=(policy,config)=>createHash('sha256').update(canonical({policy,config})).digest('hex');
export function summaryResourceProfile(config,contexts,configurationSha256){
 if(config.consumerId!=='summary-credential-rotation'||!/^[a-f0-9]{64}$/.test(configurationSha256??''))fail();
 const databases=['directory','business'].map(kind=>{
  const context=contexts?.[kind];
  if(!context||context.environment!==config.environment||context.budget.environment!==config.environment
   &&!(config.environment==='local'&&context.budget.environment==='example')
   ||kind==='business'&&context.databaseId!==config.businessDatabaseId)fail();
  const d=assertSummaryCredentialBudget(config,context,kind),c=d.consumers.find(c=>c.id===config.consumerId);
  return {databaseId:d.id,consumers:[{id:c.id,replicas:c.replicas,pools:c.pools.map(p=>({id:p.id,max:p.max})),fixedConnectionsPerReplica:0}]};
 });
 if(databases[0].databaseId===databases[1].databaseId)fail();
 return freeze({schemaVersion:2,budgetSha256:config.resourceBudgetSha256,environment:config.environment,configurationSha256,databases});
}
