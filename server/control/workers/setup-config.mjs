import {isAbsolute} from 'node:path';
import {ControlError} from '../errors.mjs';
import {boundedHealthFile,healthDatabaseUrl} from './health-config.mjs';
import {ReleaseApprovalTrust,loadReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from '../release-approval.mjs';
import {recoveryBinding,loadRecoveryCredential} from '../setup-recovery.mjs';
import {normalizeAddress} from '../safe-http.mjs';
import {exact} from '../probe-secrets.mjs';
import {resourceMode,loadRuntimeResourceContext,assertProvisioningResources} from '../resource-runtime.mjs';

const invalid=()=>new ControlError(400,'INVALID_SETUP_WORKER_CONFIG','Cấu hình worker đối soát chưa hợp lệ.');
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value};
export function setupTargetApproval(target,trust,environment,{now=Date.now()}={}){
  const c=target.cluster,p=target.approval.payload;
  return trust.verify(target.approval,{inventoryRef:c.inventoryRef,clusterId:c.id,hostId:c.hostId,environment,
    expected:p.expected,endpointFingerprint:releaseApprovalEndpointFingerprint({url:c.url,internalUrl:c.internalUrl??null,
      approvedAddresses:c.approvedAddresses,credentialRef:c.credentialRef})},{now});
}
export function setupConfiguration(raw,{databaseUrl,trust,environment='production',allowLocal=false,now=Date.now()}={}){
  try{
    if(!(trust instanceof ReleaseApprovalTrust)||!['local','staging','production'].includes(environment)
      ||!exact(raw,['schemaVersion','instanceId','poolMax','concurrency','intervalMs','requestTimeoutMs','leaseMs',
        'retryBaseMs','shutdownTimeoutMs','targets','connectionBudget'])||raw.schemaVersion!==1
      ||typeof raw.instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(raw.instanceId))throw invalid();
    const ranges={poolMax:[1,4],concurrency:[1,4],intervalMs:[100,30000],requestTimeoutMs:[100,15000],
      leaseMs:[1000,300000],retryBaseMs:[10,60000],shutdownTimeoutMs:[1000,20000]};
    for(const [k,[min,max]] of Object.entries(ranges))if(!Number.isSafeInteger(raw[k])||raw[k]<min||raw[k]>max)throw invalid();
    if(raw.concurrency>raw.poolMax||raw.leaseMs<raw.requestTimeoutMs*2+10000||raw.shutdownTimeoutMs<raw.requestTimeoutMs+1000)throw invalid();
    const b=raw.connectionBudget;
    if(!exact(b,['maxConnections','otherAllocatedConnections','instances','reservedConnections'])
      ||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<1||n>10000)
      ||b.otherAllocatedConnections+b.instances*raw.poolMax+b.reservedConnections>b.maxConnections)throw invalid();
    const production=environment!=='local',local=!production&&allowLocal===true;
    healthDatabaseUrl(databaseUrl,{production,allowLocal:local});
    if(!Array.isArray(raw.targets)||!raw.targets.length||raw.targets.length>16)throw invalid();
    const targets=raw.targets.map(t=>{
      if(!exact(t,['cluster','approval','credentialFile'])||typeof t.credentialFile!=='string'||!isAbsolute(t.credentialFile))throw invalid();
      const c=t.cluster;
      if(!exact(c,['id','url','internalUrl','inventoryRef','credentialRef','hostId','approvedAddresses'])
        ||![c.id,c.inventoryRef,c.credentialRef,c.hostId].every(s=>typeof s==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(s))
        ||c.id.length>40||!Array.isArray(c.approvedAddresses)||c.approvedAddresses.length>32)throw invalid();
      for(const origin of [c.url,c.internalUrl??c.url]){
        const u=new URL(origin);
        if(u.origin!==origin||origin.length>2048||u.username||u.password
          ||(u.protocol!=='https:'&&!(local&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw invalid();
      }
      const cluster={...c,internalUrl:c.internalUrl??undefined,approvedAddresses:c.approvedAddresses.map(normalizeAddress)};
      if(new Set(cluster.approvedAddresses).size!==cluster.approvedAddresses.length)throw invalid();
      const target={cluster,approval:structuredClone(t.approval),credentialFile:t.credentialFile};
      const approval=setupTargetApproval(target,trust,environment,{now});
      recoveryBinding(cluster,approval.expected);
      return freeze({...target,expected:approval.expected,identity:{clusterId:c.id,approvalId:approval.approvalId,
        epoch:approval.epoch,envelopeDigest:approval.envelopeDigest,credentialRef:c.credentialRef}});
    });
    if(new Set(targets.map(t=>t.cluster.id)).size!==targets.length||new Set(targets.map(t=>t.cluster.inventoryRef)).size!==targets.length)throw invalid();
    return freeze({...raw,targets,databaseUrl,trust,environment,production,allowLocal:local,connectionBudget:{...b}});
  }catch{throw invalid()}
}
export async function setupCredentialsReady(config){
  for(const t of config.targets){
    setupTargetApproval(t,config.trust,config.environment);
    await loadRecoveryCredential(t.credentialFile,recoveryBinding(t.cluster,t.expected));
  }
}
export async function loadSetupConfiguration(env=process.env){
  try{
    const {environment}=resourceMode(env),resourceContext=loadRuntimeResourceContext(env,{kind:'directory'});
    const trust=await loadReleaseApprovalTrust(env.ROOMQC_SETUP_RELEASE_TRUST_FILE,{maximumValidityMs:86400000});
    const raw=JSON.parse(await boundedHealthFile(env.ROOMQC_SETUP_CONFIG_FILE,128*1024));
    const databaseUrl=(await boundedHealthFile(env.ROOMQC_SETUP_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    const config=Object.freeze({...setupConfiguration(raw,{databaseUrl,trust,environment,allowLocal:env.ROOMQC_SETUP_ALLOW_LOCAL==='true'}),resourceContext});
    assertProvisioningResources(config);await setupCredentialsReady(config);return config;
  }catch(error){
    if(error instanceof ControlError&&['RESOURCE_BUDGET_REQUIRED','RESOURCE_RUNTIME_MISMATCH','INVALID_RESOURCE_BUDGET','RESOURCE_CONNECTION_BUDGET'].includes(error.code))throw error;
    throw invalid();
  }
}
