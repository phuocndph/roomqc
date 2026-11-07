import {isAbsolute} from 'node:path';
import {ControlError} from './errors.mjs';
import {exact} from './probe-secrets.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';
import {loadReleaseApprovalTrust} from './release-approval.mjs';
import {setupTargetApproval} from './workers/setup-config.mjs';
import {SetupRecoveryGateway} from './setup-recovery.mjs';
import {normalizeAddress} from './safe-http.mjs';
import {resourceDatabaseConnection} from './resource-database.mjs';
import {loadRuntimeResourceContext,assertBackfillResources,assertBackfillApplyResources} from './resource-runtime.mjs';

const invalid=()=>new ControlError(400,'INVALID_SETUP_BACKFILL_CONFIG','Cấu hình đọc đối soát không hợp lệ.');
function configuration(raw,trust,{allowLocal=false,now=Date.now()}={},assertResources=assertBackfillResources){
  try{
    if(!exact(raw,['schemaVersion','environment','directory','releaseTrustFile','resourceBudgetFile','targets'])||raw.schemaVersion!==1
      ||!['local','staging','production'].includes(raw.environment)||typeof raw.releaseTrustFile!=='string'||!isAbsolute(raw.releaseTrustFile)
      ||raw.resourceBudgetFile!==null&&(typeof raw.resourceBudgetFile!=='string'||!isAbsolute(raw.resourceBudgetFile))
      ||!exact(raw.directory,['dsnFile','expected'])||typeof raw.directory.dsnFile!=='string'||!isAbsolute(raw.directory.dsnFile)
      ||!exact(raw.directory.expected,['systemIdentifier','databaseOid','databaseName','role'])
      ||!(/^[1-9][0-9]{0,19}$/).test(raw.directory.expected.systemIdentifier)
      ||BigInt(raw.directory.expected.systemIdentifier)>18446744073709551615n
      ||!(/^[1-9][0-9]{0,9}$/).test(raw.directory.expected.databaseOid)||BigInt(raw.directory.expected.databaseOid)>4294967295n
      ||!['databaseName','role'].every(k=>typeof raw.directory.expected[k]==='string'&&Buffer.byteLength(raw.directory.expected[k])>=1
        &&Buffer.byteLength(raw.directory.expected[k])<=63&&!/[\x00-\x1f\x7f]/.test(raw.directory.expected[k]))
      ||!Array.isArray(raw.targets)||!raw.targets.length||raw.targets.length>16)throw invalid();
    const local=raw.environment==='local'&&allowLocal===true;
    if(raw.environment==='local'&&!local)throw invalid();
    const targets=raw.targets.map(t=>{
      if(!exact(t,['cluster','approval','credentialFile'])||typeof t.credentialFile!=='string'||!isAbsolute(t.credentialFile))throw invalid();
      const c=t.cluster;
      if(!exact(c,['id','url','internalUrl','inventoryRef','credentialRef','hostId','approvedAddresses'])
        ||!['id','inventoryRef','credentialRef','hostId'].every(k=>typeof c[k]==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(c[k]))
        ||c.id.length>40||!Array.isArray(c.approvedAddresses)||c.approvedAddresses.length>32)throw invalid();
      for(const origin of [c.url,c.internalUrl??c.url]){
        const u=new URL(origin);if(u.origin!==origin||origin.length>2048||u.username||u.password
          ||u.protocol!=='https:'&&!(local&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw invalid();
      }
      const addresses=c.approvedAddresses.map(normalizeAddress);if(new Set(addresses).size!==addresses.length)throw invalid();
      const target={cluster:{...c,approvedAddresses:addresses,internalUrl:c.internalUrl??undefined},approval:structuredClone(t.approval),credentialFile:t.credentialFile};
      const approved=setupTargetApproval(target,trust,raw.environment,{now});
      return {...target,expected:approved.expected,identity:{clusterId:c.id,approvalId:approved.approvalId,epoch:approved.epoch,
        envelopeDigest:approved.envelopeDigest,credentialRef:c.credentialRef}};
    });
    if(new Set(targets.map(t=>t.cluster.id)).size!==targets.length||new Set(targets.map(t=>t.cluster.inventoryRef)).size!==targets.length)throw invalid();
    const resourceContext=loadRuntimeResourceContext({ROOMQC_RESOURCE_ENVIRONMENT:raw.environment,
      ROOMQC_RESOURCE_BUDGET_FILE:raw.resourceBudgetFile??undefined},{kind:'directory'});
    const config={environment:raw.environment,production:raw.environment!=='local',allowLocal:local,
      directory:structuredClone(raw.directory),targets,trust,resourceContext};
    assertResources(config);return config;
  }catch{throw invalid()}
}
export function setupBackfillConfiguration(raw,trust,options){return configuration(raw,trust,options)}
export function setupBackfillApplyConfiguration(raw,trust,options){
  try{
    if(!exact(raw,['schemaVersion','environment','directory','releaseTrustFile','resourceBudgetFile','targets','batchTrustFile'])
      ||typeof raw.batchTrustFile!=='string'||!isAbsolute(raw.batchTrustFile))throw invalid();
    const {batchTrustFile,...base}=raw;
    return {...configuration(base,trust,options,assertBackfillApplyResources),batchTrustFile};
  }catch{throw invalid()}
}
export async function loadSetupBackfillConfiguration(file,{allowLocal=false}={}){
  try{
    const raw=JSON.parse(await boundedHealthFile(file,128*1024));
    const trust=await loadReleaseApprovalTrust(raw.releaseTrustFile,{maximumValidityMs:86400000});
    const config=setupBackfillConfiguration(raw,trust,{allowLocal});
    const secret=(await boundedHealthFile(config.directory.dsnFile,8192,{sensitive:true})).trim();
    const connection=resourceDatabaseConnection(secret,{expected:config.directory.expected},config.environment);
    return {...config,connection:{...connection,max:1,application_name:'roomqc-setup-backfill-reader'}};
  }catch{throw invalid()}
}
export function setupBackfillGateways(config){
  const inventory=new Map(config.targets.map(t=>[t.cluster.inventoryRef,{url:t.cluster.url,internalUrl:t.cluster.internalUrl,
    approvedAddresses:t.cluster.approvedAddresses}]));
  return config.targets.map(t=>{
    const gateway=new SetupRecoveryGateway({allowLocal:config.allowLocal,inventory},t.cluster,{expected:t.expected,credentialFile:t.credentialFile});
    return [t.cluster.id,{binding:gateway.binding,receipt:async(workspace,options)=>{
      setupTargetApproval(t,config.trust,config.environment);return gateway.receipt(workspace,options);
    }}];
  });
}
