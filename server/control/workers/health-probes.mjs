import pg from 'pg';
import {healthDatabaseUrl,boundedHealthFile} from './health-config.mjs';
import {normalizeAddress,addressKind} from '../safe-http.mjs';
import {telemetryTargetFingerprint} from '../telemetry-source.mjs';
import {releaseExpectation} from '../release-manifest.mjs';
import {ProbeCredentialStore} from '../probe-credentials.mjs';
import {ProbeSessionManager,managedHealthProbe} from '../probe-session.mjs';
import {exact,probeError,loadProbeKeyring} from '../probe-secrets.mjs';
import {collectServiceProbes} from '../service-probes.mjs';
import {ReleaseApprovalTrust,loadReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from '../release-approval.mjs';

const invalid=()=>probeError('INVALID_MANAGED_HEALTH_CONFIG');
const ref=/^[a-z][a-z0-9-]{1,63}$/;
const files=['ROOMQC_HEALTH_PROBE_CONFIG_FILE','ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE','ROOMQC_HEALTH_PROBE_KEYRING_FILE',
  'ROOMQC_HEALTH_RELEASE_TRUST_FILE','ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS'];
function origin(value,allowLocal){
  let url;try{url=new URL(value)}catch{throw invalid()}
  if(url.origin!==value||url.username||url.password
    ||(url.protocol!=='https:'&&!(allowLocal&&url.protocol==='http:'
      &&['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(url.hostname))))throw invalid();
}
function publishable(value){
  if(typeof value!=='string'||!value||value.length>16000||/\s/.test(value)||value.startsWith('sb_secret_'))throw invalid();
  if(value.split('.').length===3){
    try{if(JSON.parse(Buffer.from(value.split('.')[1],'base64url')).role!=='anon')throw invalid()}catch{throw invalid()}
  }
  return value;
}

// This metadata is installer-approved, never derived from a service response or
// HTTP request. It contains neither manifest JWTs nor Auth/refresh credentials.
export class ManagedHealthCatalog {
  #entries;
  #trust;
  constructor(raw,health,trust){
    if(!(trust instanceof ReleaseApprovalTrust)||health.schemaVersion!==2||!exact(raw,['version','targets'])||raw.version!==2||!Array.isArray(raw.targets)
      ||raw.targets.length!==health.targets.length)throw invalid();
    this.#entries=new Map();this.#trust=trust;
    const targets=new Map(health.targets.map(e=>[e.target.clusterId,e.target]));
    for(const value of raw.targets){
      if(!exact(value,['cluster','expected','approval','storage'])||!exact(value.cluster,
        ['id','hostId','url','internalUrl','inventoryRef','credentialRef','approvedAddresses','publishableKey'])
        ||!exact(value.storage,['sha256'])||!/^[a-f0-9]{64}$/.test(value.storage.sha256))throw invalid();
      const c=value.cluster,target=targets.get(c.id),expected=releaseExpectation(value.expected);
      if(!target||target.hostId!==c.hostId||expected.clusterId!==c.id||!ref.test(c.inventoryRef)||!ref.test(c.credentialRef)
        ||this.#entries.has(c.id)||!Array.isArray(c.approvedAddresses)||c.approvedAddresses.length<1||c.approvedAddresses.length>32)throw invalid();
      origin(c.url,health.allowLocal);if(c.internalUrl!==null)origin(c.internalUrl,health.allowLocal);
      const addresses=c.approvedAddresses.map(normalizeAddress).sort();
      if(new Set(addresses).size!==addresses.length||addresses.some(a=>addressKind(a)==='forbidden'
        ||(!health.allowLocal&&addressKind(a)==='loopback')))throw invalid();
      const cluster=Object.freeze({...c,internalUrl:c.internalUrl??undefined,publishableKey:publishable(c.publishableKey),
        approvedAddresses:Object.freeze(addresses)});
      const approvalEnvelope=structuredClone(value.approval),context={inventoryRef:c.inventoryRef,clusterId:c.id,hostId:c.hostId,
        environment:target.environment,expected,endpointFingerprint:releaseApprovalEndpointFingerprint({url:c.url,internalUrl:c.internalUrl,
          approvedAddresses:addresses,credentialRef:c.credentialRef})};
      trust.verify(approvalEnvelope,context);
      const entry=Object.freeze({...cluster,releaseId:expected.releaseId,schemaManifestHash:expected.schemaManifestHash});
      // Expose only lookup, not a mutable Map that callers could rewrite.
      const inventory=Object.freeze({get:id=>id===c.inventoryRef?entry:undefined});
      const config=Object.freeze({allowLocal:health.allowLocal,inventory});
      this.#entries.set(c.id,{approvalEnvelope,context,entry:Object.freeze({cluster,config,expected,storage:Object.freeze({...value.storage}),
        targetFingerprint:telemetryTargetFingerprint(target)})});
    }
    Object.freeze(this);
  }
  get(target){
    const value=this.#entries.get(target.clusterId);
    if(!value||value.entry.targetFingerprint!==telemetryTargetFingerprint(target))throw probeError('PROBE_TARGET_CHANGED');
    return Object.freeze({...value.entry,approval:this.#trust.verify(value.approvalEnvelope,value.context)});
  }
}

export function managedHealthConfiguration(raw,{health,databaseUrl,trust}){
  const probe=healthDatabaseUrl(databaseUrl,health),metrics=healthDatabaseUrl(health.databaseUrl,health);
  // Separate login, same primary directory. A second DB could otherwise refresh
  // credentials unrelated to the metadata used by the snapshot writer.
  if(probe.hostname!==metrics.hostname||(probe.port||'5432')!==(metrics.port||'5432')
    ||decodeURIComponent(probe.pathname)!==decodeURIComponent(metrics.pathname)
    ||decodeURIComponent(probe.username)===decodeURIComponent(metrics.username)
    ||probe.search!==metrics.search)throw invalid();
  return Object.freeze({databaseUrl,poolMax:health.connectionBudget.probePoolMax,catalog:new ManagedHealthCatalog(raw,health,trust)});
}
export async function loadManagedHealthConfiguration(env,health){
  const supplied=files.filter(name=>env[name]!==undefined);
  if(!supplied.length)return null;
  if(supplied.length!==files.length)throw invalid();
  try{
    const raw=JSON.parse(await boundedHealthFile(env.ROOMQC_HEALTH_PROBE_CONFIG_FILE,128*1024,{sensitive:true}));
    const databaseUrl=(await boundedHealthFile(env.ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    const trust=await loadReleaseApprovalTrust(env.ROOMQC_HEALTH_RELEASE_TRUST_FILE,
      {maximumValidityMs:Number(env.ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS)});
    const config=managedHealthConfiguration(raw,{health,databaseUrl,trust});
    const keyring=await loadProbeKeyring(env.ROOMQC_HEALTH_PROBE_KEYRING_FILE);
    return Object.freeze({...config,keyring});
  }catch{throw invalid()}
}
export function createHealthProbePool(config){
  if(!Number.isInteger(config.poolMax)||config.poolMax<1||config.poolMax>4)throw invalid();
  const pool=new pg.Pool({connectionString:config.databaseUrl,max:config.poolMax,connectionTimeoutMillis:2000,
    idleTimeoutMillis:30000,statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:5000,
    application_name:'roomqc-health-probe'});
  pool.on('error',()=>{});return pool;
}
export function createManagedHealthProbe(config,pool,{collect=collectServiceProbes,store}={}){
  const credentials=store??new ProbeCredentialStore(pool,config.keyring),managers=new Map();
  const adapter=managedHealthProbe({managerFor:target=>{
    const entry=config.catalog.get(target);
    if(!managers.has(target.clusterId))managers.set(target.clusterId,new ProbeSessionManager({store:credentials,...entry}));
    return managers.get(target.clusterId);
  },storageFor:target=>config.catalog.get(target).storage,approvalFor:target=>config.catalog.get(target).approval,
  collect:(settings,cluster,input,options)=>{
    if(input.credential.publishableKey!==cluster.publishableKey)throw probeError('PROBE_TARGET_CHANGED');
    return collect(settings,cluster,input,options);
  }});
  return async(target,signal,context)=>{
    signal.throwIfAborted();
    // This check is deliberately inside the probe path, AFTER the independent
    // metrics readiness/stale sweep, so a canary outage cannot preserve old health.
    await credentials.readiness();signal.throwIfAborted();
    return adapter(target,signal,context);
  };
}
