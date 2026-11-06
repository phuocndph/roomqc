import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {SetupRecoveryGateway,recoveryBinding,validateRecoveryCredential} from './setup-recovery.mjs';
const now=1800000000000;
function fixture(){
 const cluster={id:'cluster-a',url:'https://hotel.roomqc.example',internalUrl:'https://internal.roomqc.example',
  inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['10.0.0.2'],serviceKey:'never-forward-service-secret'};
 const expected={clusterId:cluster.id,releaseId:'owned-test',artifactDigest:'a'.repeat(64),frontendArtifactDigest:'b'.repeat(64),
  migrationSetHash:'c'.repeat(64),schemaManifestHash:'d'.repeat(64)};
 const binding=recoveryBinding(cluster,expected),workspace={id:randomUUID(),owner_id:randomUUID(),cluster_id:cluster.id,
  api_url:cluster.url,routing_version:1};
 const dispatch={id:randomUUID(),workspace_id:workspace.id,owner_id:workspace.owner_id,cluster_id:cluster.id,
  routing_version:1,payload_sha256:'e'.repeat(64)};
 const mint=patch=>{const body=[{alg:'HS256',typ:'JWT'},{iss:'roomqc-setup-recovery/v1',aud:'authenticated',role:'roomqc_setup_recovery',
  iat:now/1000-1,exp:now/1000+1800,jti:randomUUID(),cluster_id:cluster.id,binding_sha256:binding.bindingHash,...patch}]
   .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return body+'.'+createHmac('sha256','owned unit fixture only').update(body).digest('base64url')};
 const credential=(patch={})=>({version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:'sb_publishable_owned',token:mint(),...patch});
 const closed={dispatch_id:dispatch.id,workspace_id:workspace.id,owner_id:workspace.owner_id,routing_version:1,
  payload_sha256:dispatch.payload_sha256,state:'closed',success:false,tenant_id:null,hotel_id:null};
 return {cluster,expected,binding,workspace,dispatch,mint,credential,closed};
}
test('recovery credential is bound to target/release and rejects owner/service/probe, malformed, long-lived and near-expiry tokens',()=>{
 const f=fixture();assert.ok(validateRecoveryCredential(f.credential(),f.binding,{now}).credentialId);
 for(const patch of [{role:'service_role'},{role:'authenticated'},{role:'roomqc_control_probe'},{iss:'wrong'},
  {aud:'other'},{cluster_id:'cluster-b'},{binding_sha256:'0'.repeat(64)},{jti:'wrong'},{exp:now/1000+5},
  {exp:now/1000+7200},{iat:now/1000+60},{exp:'1800001800'}])
   assert.throws(()=>validateRecoveryCredential(f.credential({token:f.mint(patch)}),f.binding,{now}),{code:'RECOVERY_CREDENTIAL_INVALID'});
 for(const patch of [{serviceKey:'extra'},{publishableKey:'sb_secret_forbidden'},{publishableKey:f.mint({role:'service_role'})},
  {clusterId:'cluster-b'},{bindingSha256:'0'.repeat(64)},{token:'bad'},{token:'a.b.c extra'}])
   assert.throws(()=>validateRecoveryCredential(f.credential(patch),f.binding,{now}),{code:'RECOVERY_CREDENTIAL_INVALID'});
 assert.notEqual(f.binding.bindingHash,recoveryBinding({...f.cluster,internalUrl:'https://other.roomqc.example'},f.expected).bindingHash);
 assert.notEqual(f.binding.bindingHash,recoveryBinding(f.cluster,{...f.expected,releaseId:'new'}).bindingHash);
});
test('gateway exposes only receipt/close under the dedicated schema, forwards no service role and reloads credentials for rotation',async()=>{
 const f=fixture(),requests=[],ids=[];const gateway=new SetupRecoveryGateway({},f.cluster,{expected:f.expected,now:()=>now,
  loadCredential:async()=>{const value=f.credential();ids.push(value.token);return value},fetcher:async(url,init,cluster)=>{
   requests.push({url,init,cluster});return {ok:true,status:200,json:async()=>url.endsWith('/receipt')?null:f.closed}}});
 assert.equal(await gateway.receipt(f.workspace),null);assert.deepEqual(await gateway.close(f.workspace,f.dispatch),f.closed);
 assert.equal(requests.length,2);assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
 for(const r of requests){assert.ok(r.url.startsWith(f.cluster.internalUrl+'/rest/v1/rpc/'));assert.equal(r.init.redirect,'error');
  assert.equal(r.init.headers['Content-Profile'],'roomqc_setup');assert.equal(r.init.headers.apikey,'sb_publishable_owned');
  assert.equal(r.init.method,'POST');assert.ok(r.init.signal);assert.ok(!JSON.stringify(r).includes(f.cluster.serviceKey));}
 assert.equal(gateway.request,undefined);assert.equal(gateway.provision,undefined);
});
test('changed workspace/dispatch are rejected before reading credentials or sending requests',async()=>{
 const f=fixture();let touched=0;const gateway=new SetupRecoveryGateway({},f.cluster,{expected:f.expected,now:()=>now,
  loadCredential:async()=>{touched++;return f.credential()},fetcher:async()=>{touched++}});
 for(const patch of [{cluster_id:'cluster-b'},{api_url:'https://other.roomqc.example'},{owner_id:null},{routing_version:0}])
  await assert.rejects(gateway.receipt({...f.workspace,...patch}),{code:'RECOVERY_TARGET_CHANGED'});
 for(const patch of [{id:null},{owner_id:randomUUID()},{workspace_id:randomUUID()},{cluster_id:'cluster-b'},
  {routing_version:2},{payload_sha256:'wrong'}])await assert.rejects(gateway.close(f.workspace,{...f.dispatch,...patch}),{code:'RECOVERY_TARGET_CHANGED'});
 assert.equal(touched,0);
});
test('wrong receipt identity/terminal response cannot activate or close an unrelated workspace',async()=>{
 const f=fixture();let value;const gateway=new SetupRecoveryGateway({},f.cluster,{expected:f.expected,now:()=>now,
  loadCredential:async()=>f.credential(),fetcher:async()=>({ok:true,status:200,json:async()=>value})});
 for(const patch of [{workspace_id:randomUUID()},{owner_id:randomUUID()},{dispatch_id:randomUUID()},{routing_version:2},
  {payload_sha256:'0'.repeat(64)},{state:'committed',success:true},{state:'busy',dispatch_id:randomUUID()}]){
  value={...f.closed,...patch};await assert.rejects(gateway.close(f.workspace,f.dispatch),{code:'RECOVERY_RECEIPT_INVALID'});
 }
 value={...f.closed,state:'busy'};assert.equal((await gateway.close(f.workspace,f.dispatch)).state,'busy');
 value={workspace_id:f.workspace.id,owner_id:randomUUID(),tenant_id:randomUUID(),hotel_id:randomUUID()};
 await assert.rejects(gateway.receipt(f.workspace),{code:'RECOVERY_RECEIPT_INVALID'});
});
test('denied/expired credentials, redirects, malformed responses and aborted requests never fall back to service role or expose remote details',async()=>{
 const f=fixture();let calls=0,status=403;const gateway=new SetupRecoveryGateway({},f.cluster,{expected:f.expected,now:()=>now,
  loadCredential:async()=>f.credential(),fetcher:async()=>{calls++;return {ok:false,status,json:async()=>{throw Error('private-provider-secret')}}}});
 await assert.rejects(gateway.close(f.workspace,f.dispatch),e=>e.code==='RECOVERY_CREDENTIAL_DENIED'&&!e.message.includes('private'));
 status=302;await assert.rejects(gateway.close(f.workspace,f.dispatch),{code:'RECOVERY_UNAVAILABLE'});
 const controller=new AbortController();controller.abort();await assert.rejects(gateway.receipt(f.workspace,{signal:controller.signal}),{code:'RECOVERY_UNAVAILABLE'});
 assert.equal(calls,2);
 const expired=new SetupRecoveryGateway({},f.cluster,{expected:f.expected,now:()=>now,
  loadCredential:async()=>f.credential({token:f.mint({exp:1})}),fetcher:async()=>{calls++}});
 await assert.rejects(expired.receipt(f.workspace),{code:'RECOVERY_CREDENTIAL_INVALID'});assert.equal(calls,2);
});
test('native HTTP transport retains a minimal approved inventory snapshot across external config mutation',async()=>{
 const f=fixture(),server=createServer((request,response)=>{
  assert.equal(request.headers['content-profile'],'roomqc_setup');response.setHeader('content-type','application/json');response.end('null');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const cluster={...f.cluster,url:origin,internalUrl:origin,approvedAddresses:['127.0.0.1']};
  const binding=recoveryBinding(cluster,f.expected),config={allowLocal:true,inventory:new Map([['cluster-a',cluster]]),
   serviceKey:'never-retain-this-config-secret'};
  const gateway=new SetupRecoveryGateway(config,cluster,{expected:f.expected,now:()=>now,
   loadCredential:async()=>f.credential({bindingSha256:binding.bindingHash,token:f.mint({binding_sha256:binding.bindingHash})})});
  config.allowLocal=false;cluster.url='https://changed.roomqc.example';cluster.internalUrl=cluster.url;
  cluster.approvedAddresses.push('169.254.169.254');config.inventory.clear();
  assert.equal(await gateway.receipt({...f.workspace,api_url:origin}),null);
  assert.equal(gateway.binding.url,origin);assert.deepEqual(gateway.binding.approvedAddresses,['127.0.0.1']);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
