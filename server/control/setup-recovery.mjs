import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {probeBinding} from './probe-credentials.mjs';
import {exact} from './probe-secrets.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';
import {createClusterFetch} from './safe-http.mjs';
import {dispatchMatches} from './setup-dispatch.mjs';

const denied=code=>new ControlError(503,code,'Phiên đối soát chưa sẵn sàng. Đăng ký được giữ nguyên.');
export function recoveryBinding(cluster,expected){
 const base=probeBinding(cluster,expected);
 return Object.freeze({...base,schema:'roomqc_setup',contractVersion:1,
  bindingHash:createHash('sha256').update('roomqc-setup-recovery/v1\0'+base.bindingHash).digest('hex')});
}
function claims(token){
 if(typeof token!=='string'||token.length>16000||/\s/.test(token))throw denied('RECOVERY_CREDENTIAL_INVALID');
 const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw denied('RECOVERY_CREDENTIAL_INVALID');
 try{return JSON.parse(Buffer.from(parts[1],'base64url'))}catch{throw denied('RECOVERY_CREDENTIAL_INVALID')}
}
// Local validation is shape/binding/expiry only. PostgREST checks the signature;
// the database checks live authority, revocation and expiry before/after writes.
export function validateRecoveryCredential(value,binding,{now=Date.now(),minimumValidityMs=10000}={}){
 if(!Number.isFinite(now)||!Number.isSafeInteger(minimumValidityMs)||minimumValidityMs<0||minimumValidityMs>60000
   ||!exact(value,['version','clusterId','bindingSha256','publishableKey','token'])||value.version!==1
   ||value.clusterId!==binding.clusterId||value.bindingSha256!==binding.bindingHash
   ||typeof value.publishableKey!=='string'||!value.publishableKey||value.publishableKey.length>16000
   ||/\s/.test(value.publishableKey)||value.publishableKey.startsWith('sb_secret_')||value.token===value.publishableKey)
   throw denied('RECOVERY_CREDENTIAL_INVALID');
 if(value.publishableKey.includes('.')){if(claims(value.publishableKey)?.role!=='anon')throw denied('RECOVERY_CREDENTIAL_INVALID')}
 const c=claims(value.token);
 if(c?.role!=='roomqc_setup_recovery'||c.iss!=='roomqc-setup-recovery/v1'||c.aud!=='authenticated'
   ||!uuidPattern.test(c.jti??'')||c.cluster_id!==binding.clusterId||c.binding_sha256!==binding.bindingHash
   ||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||!Number.isSafeInteger(c.exp*1000)
   ||c.iat*1000>now+5000||c.exp<=c.iat||c.exp-c.iat>3600||c.exp*1000<=now+minimumValidityMs)
   throw denied('RECOVERY_CREDENTIAL_INVALID');
 return Object.freeze({publishableKey:value.publishableKey,token:value.token,credentialId:c.jti,expiresAt:c.exp*1000});
}
export async function loadRecoveryCredential(file,binding,options){
 try{return validateRecoveryCredential(JSON.parse(await boundedHealthFile(file,40000,{sensitive:true})),binding,options)}
 catch{throw denied('RECOVERY_CREDENTIAL_INVALID')}
}
export class SetupRecoveryGateway{
 #binding;#cluster;#credential;#fetch;#now;
 constructor(config,cluster,{expected,credentialFile,loadCredential,fetcher,now=Date.now}={}){
  this.#binding=recoveryBinding(cluster,expected);this.#now=now;
  // Deliberately copy only transport identity. Never retain a service-role key
  // even when the caller accidentally supplies the API's broader cluster row.
  this.#cluster=Object.freeze({id:cluster.id,url:cluster.url,internalUrl:cluster.internalUrl,
    inventoryRef:cluster.inventoryRef,approvedAddresses:Object.freeze([...(cluster.approvedAddresses??[])])});
  this.#credential=loadCredential??(()=>loadRecoveryCredential(credentialFile,this.#binding,{now:this.#now()}));
  const inventoryRef=cluster.inventoryRef??cluster.id,entry=config?.inventory?.get(inventoryRef);
  const transport={allowLocal:config?.allowLocal===true,inventory:new Map(entry?[[inventoryRef,Object.freeze({
    url:entry.url,internalUrl:entry.internalUrl,approvedAddresses:Object.freeze([...(entry.approvedAddresses??[])])})]]:[])};
  this.#fetch=fetcher??createClusterFetch(transport,{maxResponseBytes:16384});
 }
 get binding(){return this.#binding}
 async readiness({signal}={}){
  // A read-only native RPC checks signature plus the database's live
  // authority/revocation/expiry fences. An unexpired file alone cannot do so.
  // A fresh nonexistent workspace must return null; never expose probe data.
  const value=await this.#request('receipt',{p_workspace_id:randomUUID()},signal);
  if(value!==null)throw denied('RECOVERY_RECEIPT_INVALID');
  return {ready:true};
 }
 #workspace(workspace){
  if(!workspace||!uuidPattern.test(workspace.id??'')||!uuidPattern.test(workspace.owner_id??'')
    ||workspace.cluster_id!==this.#binding.clusterId||workspace.api_url!==this.#binding.url
    ||!Number.isSafeInteger(workspace.routing_version)||workspace.routing_version<1)throw denied('RECOVERY_TARGET_CHANGED');
 }
 async #request(name,body,signal){
  const credential=await this.#credential();
  // A loader may already validate shape; always revalidate expiry at dispatch.
  const clean=validateRecoveryCredential({version:1,clusterId:this.#binding.clusterId,bindingSha256:this.#binding.bindingHash,
    publishableKey:credential?.publishableKey,token:credential?.token},this.#binding,{now:this.#now()});
  const timeout=AbortSignal.timeout(5000),deadline=signal?AbortSignal.any([signal,timeout]):timeout;
  let response,value;
  try{
   deadline.throwIfAborted();
   response=await this.#fetch((this.#cluster.internalUrl||this.#cluster.url)+'/rest/v1/rpc/'+name,{
    method:'POST',redirect:'error',signal:deadline,headers:{apikey:clean.publishableKey,authorization:'Bearer '+clean.token,
     'content-type':'application/json','Content-Profile':this.#binding.schema},body:JSON.stringify(body)},this.#cluster);
   if(response.status===401||response.status===403)throw denied('RECOVERY_CREDENTIAL_DENIED');
   if(!response.ok)throw denied('RECOVERY_UNAVAILABLE');
   value=await response.json();
  }catch(error){if(error instanceof ControlError&&error.code==='RECOVERY_CREDENTIAL_DENIED')throw error;
   throw denied('RECOVERY_UNAVAILABLE')}
  return value;
 }
 async receipt(workspace,{signal}={}){
  this.#workspace(workspace);const value=await this.#request('receipt',{p_workspace_id:workspace.id},signal);
  if(value===null)return null;
  if(!value||value.workspace_id!==workspace.id||value.owner_id!==workspace.owner_id
    ||!uuidPattern.test(value.tenant_id??'')||!uuidPattern.test(value.hotel_id??'')
    ||(workspace.tenant_id&&workspace.tenant_id!==value.tenant_id)||(workspace.hotel_id&&workspace.hotel_id!==value.hotel_id))
    throw denied('RECOVERY_RECEIPT_INVALID');
  return value;
 }
 async close(workspace,dispatch,{signal}={}){
  this.#workspace(workspace);
  if(!dispatch||!uuidPattern.test(dispatch.id??'')||dispatch.workspace_id!==workspace.id
    ||dispatch.owner_id!==workspace.owner_id||dispatch.cluster_id!==workspace.cluster_id
    ||dispatch.routing_version!==workspace.routing_version||!/^[a-f0-9]{64}$/.test(dispatch.payload_sha256??''))
    throw denied('RECOVERY_TARGET_CHANGED');
  const value=await this.#request('close_dispatch',{p_workspace_id:workspace.id,p_dispatch_id:dispatch.id,
   p_owner_id:dispatch.owner_id,p_routing_version:dispatch.routing_version,p_payload_sha256:dispatch.payload_sha256},signal);
  if(value?.state==='busy'&&value.dispatch_id===dispatch.id&&value.workspace_id===workspace.id&&value.owner_id===dispatch.owner_id
    &&value.routing_version===dispatch.routing_version&&value.payload_sha256===dispatch.payload_sha256)return value;
  if(!dispatchMatches(workspace,dispatch,value))throw denied('RECOVERY_RECEIPT_INVALID');
  return value;
 }
}
