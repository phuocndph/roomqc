// Pure plan metadata only. Safe to load from an unprivileged runtime.
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const capabilities=Object.freeze({
 'control-api':['api','roomqc_control_api'],
 'health-worker':['health','roomqc_control_metrics'],
 'probe-catalog':['probe','roomqc_control_probe_runtime'],
 'alert-worker':['alerts','roomqc_control_alerts'],
 'provisioning-worker':['setup','roomqc_control_setup_runtime'],
 'summary-credential-rotation':['observer','roomqc_control_setup_credential_observer'],
 'deployment-executor':['deploy','roomqc_control_deployer']
});

export function directoryRuntimePlan(raw,snapshot){
 if(!exact(raw,['version','environment','deploymentId','expected','budgetSha256'])||raw.version!==1
  ||!['local','staging','production'].includes(raw.environment)||!/^[a-z][a-z0-9-]{1,23}$/.test(raw.deploymentId??'')
  ||!exact(raw.expected,['databaseName','databaseOid','systemIdentifier'])||raw.expected.databaseName!=='roomqc_control'
  ||!/^[1-9][0-9]{0,9}$/.test(raw.expected.databaseOid??'')||!/^[1-9][0-9]{0,19}$/.test(raw.expected.systemIdentifier??'')
  ||!sha(raw.budgetSha256)||snapshot?.sha256!==raw.budgetSha256||snapshot.budget?.environment!==raw.environment)
  fail('DIRECTORY_LOGIN_PLAN_INVALID');
 const db=snapshot.budget.databases.find(d=>d.kind==='directory');
 if(!db)fail('DIRECTORY_LOGIN_PLAN_INVALID');
 const roles=[];
 for(const [consumerId,[suffix,group]]of Object.entries(capabilities)){
  const consumer=db.consumers.find(c=>c.id===consumerId);
  if(!consumer||consumer.replicas===0)continue;
  const limit=consumer.pools.reduce((n,p)=>n+p.max,0)+consumer.fixedConnectionsPerReplica;
  if(consumerId==='deployment-executor'&&(limit!==1||consumer.fixedConnectionsPerReplica!==0
    ||consumer.pools.length!==1||consumer.pools[0].max!==1))fail('DIRECTORY_LOGIN_PLAN_INVALID');
  if(!Number.isSafeInteger(limit)||limit<1||limit>128||consumer.replicas>128)fail('DIRECTORY_LOGIN_PLAN_INVALID');
  for(let ordinal=1;ordinal<=consumer.replicas;ordinal++){
   roles.push({consumerId,ordinal,name:'rq_'+raw.deploymentId.replaceAll('-','_')+'_'+suffix+'_'+ordinal,group,connectionLimit:limit});
  }
 }
 if(!roles.length||roles.length>128)fail('DIRECTORY_LOGIN_PLAN_INVALID');
 const plan={version:1,environment:raw.environment,deploymentId:raw.deploymentId,expected:{...raw.expected},
  budgetSha256:raw.budgetSha256,databaseId:db.id,maxConnections:db.maxConnections,roles,
  otherConsumers:db.consumers.filter(c=>c.replicas>0&&!Object.hasOwn(capabilities,c.id)).map(c=>c.id)};
 return {...plan,planSha256:hash(plan)};
}
export function assertPlan(plan){
 const {planSha256,...body}=plan??{};
 if(!sha(planSha256)||hash(body)!==planSha256||body.version!==1||!Array.isArray(body.roles)||!body.roles.length
  ||body.roles.some(r=>!capabilities[r.consumerId]||r.group!==capabilities[r.consumerId][1]
   ||!/^[a-z][a-z0-9_]{1,62}$/.test(r.name)||!Number.isSafeInteger(r.connectionLimit)||r.connectionLimit<1||r.connectionLimit>128))
  fail('DIRECTORY_LOGIN_PLAN_INVALID');
}
