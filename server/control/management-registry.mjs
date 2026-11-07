// The installer and bootstrap reject the same registry before creating resources.
export function assertManagementRegistry(registry,code='MANAGEMENT_BOOTSTRAP_REGISTRY_INVALID'){
 const fail=()=>{throw Object.assign(new Error(code),{code})};
 const keys=['id','url','publishableKey','vapidPublicKey','maxWorkspaces','credentialRef'];
 if(!Array.isArray(registry)||!registry.length||registry.length>128||new Set(registry.map(c=>c?.id)).size!==registry.length)fail();
 for(const c of registry){
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!==keys.sort().join(',')
   ||!/^[a-z][a-z0-9-]{1,39}$/.test(c.id??'')||!/^[a-z][a-z0-9-]{1,63}$/.test(c.credentialRef??'')
   ||!Number.isSafeInteger(c.maxWorkspaces)||c.maxWorkspaces<1||c.maxWorkspaces>1000000
   ||![c.url,c.publishableKey,c.vapidPublicKey].every(v=>typeof v==='string'&&v.length>0&&v.length<4096))fail();
  let url;try{url=new URL(c.url)}catch{fail()}
  if(url.origin!==c.url||url.protocol!=='https:'||url.username||url.password||c.publishableKey.startsWith('sb_secret_'))fail();
  let role;try{role=JSON.parse(Buffer.from(c.publishableKey.split('.')[1]??'','base64url')).role}catch{}
  if(role==='service_role')fail();
 }
 return registry;
}
