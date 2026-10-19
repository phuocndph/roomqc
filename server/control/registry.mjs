import {ControlError} from './errors.mjs';
import {normalizeAddress} from './safe-http.mjs';
const idPattern=/^[a-z][a-z0-9-]{1,63}$/;
export function registryConfiguration(env,clusters,allowLocal){
  const credentials=new Map(clusters.map(c=>[c.credentialRef||c.id,{ref:c.credentialRef||c.id,publishableKey:c.publishableKey,serviceKey:c.serviceKey,vapidPublicKey:c.vapidPublicKey}]));
  const entries=JSON.parse(env.ROOMQC_CONTROL_CREDENTIALS||'[]'),seen=new Set();
  if(!Array.isArray(entries))throw new Error('Credential inventory must be an array');
  for(const item of entries){
    if(!idPattern.test(item.ref)||seen.has(item.ref)||!item.serviceKey||!item.publishableKey||!item.vapidPublicKey)throw new Error('Invalid credential reference');
    let role;try{role=JSON.parse(Buffer.from(item.publishableKey.split('.')[1]||'','base64url')).role}catch{}
    if(role==='service_role'||item.publishableKey.startsWith('sb_secret_')||item.publishableKey===item.serviceKey)throw new Error('Publishable key cannot be secret');
    seen.add(item.ref);credentials.set(item.ref,{...item});
  }
  if(new Set([...credentials.values()].map(c=>c.vapidPublicKey)).size!==1)throw new Error('Platform VAPID key must be shared');
  const raw=JSON.parse(env.ROOMQC_CONTROL_INVENTORY||'null')??clusters.map(c=>({id:c.id,url:c.url,internalUrl:c.internalUrl,credentialRef:c.credentialRef||c.id,
    hostId:c.id,hostName:c.id,environment:allowLocal?'local':'production',backendKind:'self_hosted',frontendReady:false}));
  if(!Array.isArray(raw))throw new Error('Endpoint inventory must be an array');
  const inventory=new Map();
  for(const item of raw){
    if(!idPattern.test(item.id)||inventory.has(item.id)||!idPattern.test(item.hostId)||!idPattern.test(item.credentialRef)
      ||!['local','staging','production'].includes(item.environment)||!['self_hosted','managed'].includes(item.backendKind))throw new Error('Invalid endpoint inventory');
    for(const field of ['url','internalUrl'])if(item[field]){
      const url=new URL(item[field]);
      if(url.origin!==item[field]||url.username||url.password)throw new Error('Inventory endpoints must be exact origins');
      if(url.protocol!=='https:'&&!(allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(url.hostname)))throw new Error('Inventory requires HTTPS');
    }
    if(!item.url||!Array.isArray(item.approvedAddresses??[])||(item.approvedAddresses??[]).length>64)throw new Error('Inventory endpoint is incomplete');
    for(const address of item.approvedAddresses??[])normalizeAddress(address);
    inventory.set(item.id,{...item});
  }
  return {credentials,inventory};
}

export function resolveCredential(config,row){
  const entry=config.inventory?.get(row.inventory_ref||row.id);
  const credentials=config.credentials?.get(row.credential_ref||row.id);
  if(!entry||!credentials||entry.url!==row.api_url||entry.credentialRef!==(row.credential_ref||row.id)){
    throw new ControlError(503,'CLUSTER_CONFIGURATION_UNAVAILABLE','Cấu hình cụm chưa được xác minh. Giữ nguyên doanh nghiệp và liên hệ hỗ trợ.');
  }
  return {...credentials,id:row.id,inventoryRef:entry.id,url:row.api_url,internalUrl:entry.internalUrl,approvedAddresses:entry.approvedAddresses};
}
