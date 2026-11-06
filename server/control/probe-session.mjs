import {createClusterFetch} from './safe-http.mjs';
import {probeBinding,validateProbeBundle,probeSessionPolicy} from './probe-credentials.mjs';
import {probeError} from './probe-secrets.mjs';
import {normalizeHealthProof} from './health-evidence.mjs';
import {serviceProbeConfiguration} from './service-probes.mjs';
import {releaseApprovalIdentity} from './release-authority.mjs';

async function abortable(run,signal){
  signal.throwIfAborted();let listener;
  const aborted=new Promise((resolve,reject)=>{listener=()=>reject(probeError('PROBE_REFRESH_UNCERTAIN'));signal.addEventListener('abort',listener,{once:true})});
  try{return await Promise.race([Promise.resolve().then(run),aborted])}finally{signal.removeEventListener('abort',listener)}
}
// No retries: a lost HTTP response may already have consumed the refresh token.
// No service key, password grant, account creation, email, or alternate origin.
export async function refreshProbeSession(config,cluster,bundle,{signal,fetcher}={}){
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(probeSessionPolicy.requestTimeoutMs)])
    :AbortSignal.timeout(probeSessionPolicy.requestTimeoutMs);
  try{
    validateProbeBundle(bundle,{allowExpiredAuth:true});
    return await abortable(async()=>{
      const response=await (fetcher??createClusterFetch(config,{maxResponseBytes:32768}))(
        (cluster.internalUrl||cluster.url)+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',redirect:'error',signal:deadline,headers:{apikey:bundle.credential.publishableKey,'content-type':'application/json'},
          body:JSON.stringify({refresh_token:bundle.auth.refreshToken})},cluster);
      if(!response.ok)throw probeError('PROBE_REFRESH_UNCERTAIN');
      const session=await response.json();
      const next={credential:{...bundle.credential},auth:{...bundle.auth,token:session?.access_token,refreshToken:session?.refresh_token}};
      if(session?.user?.id!==bundle.auth.userId||!session?.user?.email_confirmed_at)throw probeError('PROBE_REFRESH_UNCERTAIN');
      validateProbeBundle(next,{minValidityMs:probeSessionPolicy.refreshedValidityMs});return next;
    },deadline);
  }catch{throw probeError('PROBE_REFRESH_UNCERTAIN')}
}

export class ProbeSessionManager {
  constructor({store,config,cluster,expected,fetcher}){
    this.store=store;this.config=config;this.cluster=Object.freeze({...cluster,
      approvedAddresses:Object.freeze([...(cluster.approvedAddresses??[])])});
    this.binding=probeBinding(this.cluster,expected);this.fetcher=fetcher;
  }
  async run(probe,{signal}={}){
    if(signal?.aborted)throw probeError('PROBE_RESULT_ABORTED');
    let acquired=await this.store.acquire(this.binding);
    if(acquired.kind==='refresh'){
      try{
        const next=await refreshProbeSession(this.config,this.cluster,acquired.bundle,{signal,fetcher:this.fetcher});
        acquired=await this.store.complete(this.binding,acquired,next);
      }catch{
        // If persisting failure is impossible (DB down), the lease remains and
        // the next process quarantines it on expiry. It NEVER steals/replays it.
        await this.store.fail(this.binding,acquired).catch(()=>{});
        throw probeError('PROBE_REFRESH_UNCERTAIN');
      }
    }
    if(signal?.aborted)throw probeError('PROBE_RESULT_ABORTED');
    // Do not pass refresh tokens, session IDs or installer credentials to probes.
    const settings=Object.freeze({credential:Object.freeze({...acquired.bundle.credential}),
      auth:Object.freeze({token:acquired.bundle.auth.token,userId:acquired.bundle.auth.userId})});
    const result=await probe(settings);
    if(signal?.aborted)throw probeError('PROBE_RESULT_ABORTED');
    await this.store.assertCurrent(this.binding,acquired.revision);
    return {result,credentialRevision:acquired.revision,bindingHash:this.binding.bindingHash};
  }
}

// Bridges the manager to HealthWorker without exposing credentials beyond the
// five-service collector. No database transaction spans the remote collection.
export function managedHealthProbe({managerFor,collect,storageFor,approvalFor,clock=Date.now}){
  if(typeof managerFor!=='function'||typeof collect!=='function'||typeof storageFor!=='function'||typeof approvalFor!=='function'||typeof clock!=='function')throw probeError('SERVICE_PROBES_UNCONFIGURED');
  return async(target,signal,context)=>{
    const manager=managerFor(target);
    const approval=approvalFor(target);
    await manager.store.assertReleaseApproval(approval);
    if(manager.binding.clusterId!==target.clusterId)throw probeError('PROBE_TARGET_CHANGED');
    const storage=storageFor(target);
    const run=await manager.run(settings=>collect(manager.config,manager.cluster,serviceProbeConfiguration({
      ...settings,expected:manager.binding.expected,storage}),{signal}),{signal});
    const evidence=normalizeHealthProof({version:2,binding:manager.binding,releaseApproval:releaseApprovalIdentity(approval),credentialRevision:run.credentialRevision,
      policyVersion:context?.policyVersion,targetFingerprint:context?.fingerprint,targetVersion:context?.targetVersion,
      checkedAt:new Date(clock()).toISOString()});
    return {probes:run.result.probes,evidence};
  };
}
