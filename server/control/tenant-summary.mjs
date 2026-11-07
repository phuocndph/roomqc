import {createHash} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {exact} from './probe-secrets.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';
import {createClusterFetch} from './safe-http.mjs';

const fail=code=>new ControlError(503,code,'Chưa thể đọc tổng quan khách sạn. Thông tin đăng ký được giữ nguyên.');
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function tenantSummaryBinding(cluster){
  if(!cluster||!/^[a-z][a-z0-9-]{1,39}$/.test(cluster.id??'')||!cluster.url||!cluster.inventoryRef||!cluster.ref)throw fail('TENANT_SUMMARY_CONFIGURATION_REQUIRED');
  const target={clusterId:cluster.id,url:cluster.url,internalUrl:cluster.internalUrl??null,inventoryRef:cluster.inventoryRef,
    credentialRef:cluster.ref,approvedAddresses:[...(cluster.approvedAddresses??[])].sort()};
  return Object.freeze({...target,bindingHash:createHash('sha256').update('roomqc-tenant-summary/v1\0'+JSON.stringify(target)).digest('hex')});
}
function claims(token){
  if(typeof token!=='string'||token.length>16000||!token.split('.').every(p=>p&&/^[\w-]+$/.test(p))||token.split('.').length!==3)throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID');
  try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID')}
}
export function validateTenantSummaryCredential(value,binding,{now=Date.now()}={}){
  if(!exact(value,['version','clusterId','bindingSha256','publishableKey','token'])||value.version!==1||value.clusterId!==binding.clusterId
    ||value.bindingSha256!==binding.bindingHash||typeof value.publishableKey!=='string'||!value.publishableKey||value.publishableKey.length>16000
    ||/\s/.test(value.publishableKey)||value.publishableKey.startsWith('sb_secret_')||value.publishableKey===value.token)throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID');
  if(value.publishableKey.includes('.')&&claims(value.publishableKey)?.role!=='anon')throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID');
  const c=claims(value.token);
  if(c.role!=='roomqc_tenant_summary'||c.iss!=='roomqc-tenant-summary/v1'||c.aud!=='authenticated'||!uuidPattern.test(c.jti??'')
    ||c.cluster_id!==binding.clusterId||c.binding_sha256!==binding.bindingHash||!Number.isFinite(now)
    ||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||!Number.isSafeInteger(c.exp*1000)
    ||c.iat*1000>now+5000||c.exp<=c.iat||c.exp-c.iat>3600||c.exp*1000<=now+5000)throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID');
  return {token:value.token,publishableKey:value.publishableKey};
}
export const tenantSummaryErrors=Object.freeze(['TENANT_SUMMARY_UNBOUND','TENANT_SUMMARY_MISSING','TENANT_SUMMARY_CONFIGURATION_REQUIRED',
  'TENANT_SUMMARY_CREDENTIAL_INVALID','TENANT_SUMMARY_CREDENTIAL_DENIED','TENANT_SUMMARY_UNAVAILABLE','TENANT_SUMMARY_INVALID_RESPONSE']);
export function unavailableTenantSummary(workspace,code){
  return {workspaceId:workspace.id,routingVersion:workspace.routing_version,clusterId:workspace.cluster_id,tenantId:workspace.tenant_id??null,status:'unavailable',observedAt:null,tenant:null,
    errorCode:tenantSummaryErrors.includes(code)?code:'TENANT_SUMMARY_UNAVAILABLE'};
}
export function projectTenantSummary(value,workspace,{now=Date.now()}={}){
  if(value?.state==='missing'&&exact(value,['state','clusterId','workspaceId','tenantId'])&&value.clusterId===workspace.cluster_id
    &&value.workspaceId===workspace.id&&value.tenantId===workspace.tenant_id)return unavailableTenantSummary(workspace,'TENANT_SUMMARY_MISSING');
  if(!exact(value,['state','clusterId','workspaceId','tenantId','observedAt','tenant'])||value.state!=='available'
    ||value.clusterId!==workspace.cluster_id||value.workspaceId!==workspace.id||value.tenantId!==workspace.tenant_id
    ||!date(value.observedAt)||Date.parse(value.observedAt)>now+5000||Date.parse(value.observedAt)<now-60000)throw fail('TENANT_SUMMARY_INVALID_RESPONSE');
  const t=value.tenant;
  if(!exact(t,['id','name','subscriptionStatus','trialEndsAt','hotelCount','staffCount','roomCount'])||t.id!==workspace.tenant_id
    ||typeof t.name!=='string'||!t.name.trim()||t.name.length>1000||typeof t.subscriptionStatus!=='string'||!t.subscriptionStatus||t.subscriptionStatus.length>100
    ||(t.trialEndsAt!==null&&!date(t.trialEndsAt))||![t.hotelCount,t.staffCount,t.roomCount].every(integer))throw fail('TENANT_SUMMARY_INVALID_RESPONSE');
  return {workspaceId:workspace.id,routingVersion:workspace.routing_version,clusterId:workspace.cluster_id,tenantId:workspace.tenant_id,status:'available',observedAt:value.observedAt,
    tenant:{id:t.id,name:t.name,subscriptionStatus:t.subscriptionStatus,trialEndsAt:t.trialEndsAt,hotelCount:t.hotelCount,staffCount:t.staffCount,roomCount:t.roomCount},errorCode:null};
}
export async function readTenantSummary(config,cluster,workspace,{fetcher,loadCredential,now=Date.now}={}){
  const binding=tenantSummaryBinding(cluster);
  if(workspace.cluster_id!==cluster.id||workspace.api_url!==cluster.url||![workspace.id,workspace.tenant_id,workspace.owner_id,workspace.hotel_id].every(v=>uuidPattern.test(v??'')))
    throw fail('TENANT_SUMMARY_INVALID_RESPONSE');
  const file=config.inventory?.get(cluster.inventoryRef)?.tenantSummaryCredentialFile;
  if(!file&&!loadCredential)throw fail('TENANT_SUMMARY_CONFIGURATION_REQUIRED');
  let raw;
  try{raw=loadCredential?await loadCredential():JSON.parse(await boundedHealthFile(file,40000,{sensitive:true}))}
  catch{throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID')}
  const credential=validateTenantSummaryCredential(raw,binding,{now:now()});
  if(credential.publishableKey!==cluster.publishableKey)throw fail('TENANT_SUMMARY_CREDENTIAL_INVALID');
  // Safe transport captures no service key. No default backend and no owner JWT.
  const target={id:cluster.id,inventoryRef:cluster.inventoryRef,url:cluster.url,internalUrl:cluster.internalUrl,approvedAddresses:cluster.approvedAddresses};
  const transport=fetcher??createClusterFetch(config,{maxResponseBytes:16384});
  let response,value;
  try{
    response=await transport((target.internalUrl||target.url)+'/rest/v1/rpc/tenant_summary',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{apikey:credential.publishableKey,authorization:'Bearer '+credential.token,
        'Content-Type':'application/json','Content-Profile':'roomqc_summary'},body:JSON.stringify({p_workspace_id:workspace.id,p_tenant_id:workspace.tenant_id,
          p_owner_id:workspace.owner_id,p_hotel_id:workspace.hotel_id})},target);
    if(response.status===401||response.status===403)throw fail('TENANT_SUMMARY_CREDENTIAL_DENIED');
    if(!response.ok)throw fail('TENANT_SUMMARY_UNAVAILABLE');
    value=await response.json();
  }catch(error){if(error instanceof ControlError)throw error;throw fail('TENANT_SUMMARY_UNAVAILABLE')}
  return projectTenantSummary(value,workspace,{now:now()});
}
