import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tenantSummaryBinding,validateTenantSummaryCredential,projectTenantSummary,readTenantSummary} from './tenant-summary.mjs';
import {adminRead} from './admin-read.mjs';
const cluster={id:'cluster-a',ref:'a-credentials',inventoryRef:'a-inventory',url:'https://a.example.invalid',approvedAddresses:[],publishableKey:'sb_publishable_fixture'};
const binding=tenantSummaryBinding(cluster),now=Date.now();
const workspace={id:randomUUID(),owner_id:randomUUID(),tenant_id:randomUUID(),hotel_id:randomUUID(),cluster_id:cluster.id,
  api_url:cluster.url,routing_version:2,status:'active',cluster_status:'active',cluster_version:'1',credential_ref:cluster.ref,inventory_ref:cluster.inventoryRef};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const claims={role:'roomqc_tenant_summary',iss:'roomqc-tenant-summary/v1',aud:'authenticated',jti:randomUUID(),cluster_id:cluster.id,
  binding_sha256:binding.bindingHash,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+600};
const credential=(changes={},extra={})=>({version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:'sb_publishable_fixture',
  token:encode({alg:'HS256'})+'.'+encode({...claims,...changes})+'.fixture',...extra});
const summary=()=>({state:'available',clusterId:cluster.id,workspaceId:workspace.id,tenantId:workspace.tenant_id,observedAt:new Date(now).toISOString(),
  tenant:{id:workspace.tenant_id,name:'Hotel A',subscriptionStatus:'trial',trialEndsAt:null,hotelCount:1,staffCount:0,roomCount:0}});
test('summary credential is bound to approved cluster transport and rejects broad, stale, expired and mismatched credentials',()=>{
  validateTenantSummaryCredential(credential(),binding,{now});
  for(const changes of [{role:'service_role'},{cluster_id:'cluster-b'},{iss:'wrong'},{binding_sha256:'f'.repeat(64)},
    {exp:claims.iat+3601},{exp:claims.iat-1},{iat:claims.iat+100},{jti:'invalid'}])
    assert.throws(()=>validateTenantSummaryCredential(credential(changes),binding,{now}),{code:'TENANT_SUMMARY_CREDENTIAL_INVALID'});
  assert.throws(()=>validateTenantSummaryCredential(credential({}, {publishableKey:'sb_secret_fixture'}),binding,{now}),{code:'TENANT_SUMMARY_CREDENTIAL_INVALID'});
  for(const field of ['url','internalUrl','id','ref','inventoryRef','approvedAddresses']){
    const other={...cluster,[field]:field==='approvedAddresses'?['10.0.0.1']:field==='id'?'cluster-b':'https://other.example.invalid'};
    assert.notEqual(tenantSummaryBinding(other).bindingHash,binding.bindingHash);
  }
});
test('summary preserves actual zero while missing is unknown, and rejects wrong target, stale data and private extras',()=>{
  const result=projectTenantSummary(summary(),workspace,{now});assert.equal(result.tenant.staffCount,0);assert.equal(result.tenant.roomCount,0);
  assert.equal(result.status,'available');assert.equal(result.routingVersion,2);
  const missing=projectTenantSummary({state:'missing',clusterId:cluster.id,workspaceId:workspace.id,tenantId:workspace.tenant_id},workspace,{now});
  assert.equal(missing.status,'unavailable');assert.equal(missing.tenant,null);assert.equal(missing.observedAt,null);assert.equal(missing.errorCode,'TENANT_SUMMARY_MISSING');
  for(const change of [{clusterId:'cluster-b'},{workspaceId:randomUUID()},{tenantId:randomUUID()},
    {observedAt:new Date(now-61000).toISOString()},{observedAt:new Date(now+10000).toISOString()},{secret:'private'}])
    assert.throws(()=>projectTenantSummary({...summary(),...change},workspace,{now}),{code:'TENANT_SUMMARY_INVALID_RESPONSE'});
  for(const change of [{roomCount:-1},{staffCount:1.5},{hotelCount:Number.MAX_SAFE_INTEGER+1},{id:randomUUID()},{email:'private'}])
    assert.throws(()=>projectTenantSummary({...summary(),tenant:{...summary().tenant,...change}},workspace,{now}),{code:'TENANT_SUMMARY_INVALID_RESPONSE'});
});
test('summary dispatch uses only dedicated token, fixed RPC and exact receipt identity; configuration failure never falls back',async()=>{
  let calls=0;
  const loadCredential=async()=>credential();
  const fetcher=async(url,options,target)=>{
    calls++;assert.equal(url,cluster.url+'/rest/v1/rpc/tenant_summary');assert.equal(options.headers['Content-Profile'],'roomqc_summary');
    assert.equal(options.headers.authorization,'Bearer '+credential().token);assert.equal(options.headers.apikey,'sb_publishable_fixture');
    assert.equal(target.serviceKey,undefined);assert.deepEqual(JSON.parse(options.body),{p_workspace_id:workspace.id,p_tenant_id:workspace.tenant_id,
      p_owner_id:workspace.owner_id,p_hotel_id:workspace.hotel_id});return Response.json(summary());
  };
  const result=await readTenantSummary({}, {...cluster,serviceKey:'private-server-marker'},workspace,{fetcher,loadCredential,now:()=>now});
  assert.equal(result.tenant.name,'Hotel A');assert.equal(calls,1);
  await assert.rejects(readTenantSummary({},cluster,workspace,{fetcher}),{code:'TENANT_SUMMARY_CONFIGURATION_REQUIRED'});assert.equal(calls,1);
  await assert.rejects(readTenantSummary({},cluster,workspace,{fetcher,loadCredential:async()=>credential({role:'service_role'}),now:()=>now}),{code:'TENANT_SUMMARY_CREDENTIAL_INVALID'});
  assert.equal(calls,1);
  for(const status of [401,403,500])await assert.rejects(readTenantSummary({},cluster,workspace,{loadCredential,now:()=>now,
    fetcher:async()=>new Response('private-server-marker',{status})}),{code:status===500?'TENANT_SUMMARY_UNAVAILABLE':'TENANT_SUMMARY_CREDENTIAL_DENIED'});
});
test('admin summary rejects injected query, distinguishes unbound/offline and discards results after mapping or credential version changes',async()=>{
  let count=0,remote=0,after={...workspace};
  const store={pool:{query:async()=>({rows:[count++?after:workspace]})}},gateway={tenantSummary:async()=>{remote++;return projectTenantSummary(summary(),workspace,{now})}};
  await assert.rejects(adminRead(store,'/workspaces/'+workspace.id+'/tenant-summary',new URLSearchParams('tenantId='+randomUUID()),gateway),{code:'INVALID_PAGE'});
  assert.equal(count,0);assert.equal(remote,0);
  const read=()=>adminRead(store,'/workspaces/'+workspace.id+'/tenant-summary',new URLSearchParams(),gateway);
  assert.equal((await read()).tenant.roomCount,0);
  for(const [key,value]of Object.entries({routing_version:3,cluster_id:'cluster-b',credential_ref:'other',cluster_version:'2',status:'migrating'})){
    count=0;after={...workspace,[key]:value};await assert.rejects(read(),{code:'TENANT_SUMMARY_TARGET_CHANGED'});
  }
  for(const changed of [{...workspace,tenant_id:null},{...workspace,cluster_status:'offline'}]){
    const local={pool:{query:async()=>({rows:[changed]})}},before=remote;
    const data=await adminRead(local,'/workspaces/'+workspace.id+'/tenant-summary',new URLSearchParams(),gateway);
    assert.equal(data.tenant,null);assert.equal(data.status,'unavailable');assert.equal(remote,before);
  }
});
