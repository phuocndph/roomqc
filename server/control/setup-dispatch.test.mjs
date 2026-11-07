import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupPayload,dispatchMatches} from './setup-dispatch.mjs';
import {ClusterGateway} from './cluster.mjs';

const fixture=()=>{
 const user={id:randomUUID(),session_id:randomUUID()},workspace={id:randomUUID(),slug:'dispatch-fixture',cluster_id:'cluster-a',
  owner_id:user.id,routing_version:2,api_url:'http://127.0.0.1:54321'};
 const payload=setupPayload(workspace,{hotelName:'Fixture',totalRooms:10});
 const dispatch={id:randomUUID(),workspace_id:workspace.id,cluster_id:workspace.cluster_id,owner_id:user.id,routing_version:2,payload_sha256:payload.payloadSha256};
 const committed={dispatch_id:dispatch.id,workspace_id:workspace.id,owner_id:user.id,routing_version:2,payload_sha256:dispatch.payload_sha256,
  state:'committed',success:true,tenant_id:randomUUID(),hotel_id:randomUUID()};
 const cluster={id:workspace.cluster_id,url:workspace.api_url,publishableKey:'fixture-public',serviceKey:'fixture-api-only'};
 return {workspace,user,dispatch,...payload,committed,config:{clusters:[cluster]}};
};
test('setup payload uses stable exact bytes, strips privilege/session fields and rejects nested/oversized values',()=>{
 const w={slug:'fixture-workspace'},a=setupPayload(w,{hotelName:'Hotel',fullName:'Owner',totalRooms:5,owner_id:randomUUID(),registrationSessionId:'secret',role:'super_admin'});
 assert.deepEqual(a,setupPayload(w,{totalRooms:5,fullName:'Owner',hotelName:'Hotel'}));
 assert.deepEqual(JSON.parse(a.fieldsJson),{fullName:'Owner',hotelName:'Hotel',totalRooms:5,workspaceSlug:w.slug});
 for(const value of [{hotelName:{}},{hotelName:['A']},{hotelName:'x'.repeat(2001)},{totalRooms:1.5},{totalRooms:-1},{totalRooms:Infinity},null])
  assert.throws(()=>setupPayload(w,value),{code:'INVALID_SETUP_FIELDS'});
});
test('dispatch results require exact immutable identity and complete terminal binding; busy is not a receipt',()=>{
 const f=fixture();assert.equal(dispatchMatches(f.workspace,f.dispatch,f.committed),true);
 for(const patch of [{dispatch_id:randomUUID()},{workspace_id:randomUUID()},{owner_id:randomUUID()},{routing_version:3},
  {payload_sha256:'a'.repeat(64)},{state:'busy'},{success:false},{hotel_id:null}])
  assert.equal(dispatchMatches(f.workspace,f.dispatch,{...f.committed,...patch}),false);
 assert.equal(dispatchMatches(f.workspace,f.dispatch,{...f.committed,state:'closed',success:false,tenant_id:null,hotel_id:null}),true);
 assert.equal(dispatchMatches({...f.workspace,tenant_id:randomUUID()},f.dispatch,f.committed),false);
});
test('fenced gateway sends exact persisted hash and JSON, checks response identity and never sends owner JWT',async()=>{
 const f=fixture(),calls=[];
 const gateway=new ClusterGateway(f.config,async(url,options)=>{calls.push({url,options});return Response.json(f.committed)});
 assert.deepEqual(await gateway.provisionSetupDispatch(f.workspace,f.user,f),f.committed);
 assert.equal(calls[0].url,f.workspace.api_url+'/rest/v1/rpc/provision_workspace_setup_dispatch');
 const body=JSON.parse(calls[0].options.body);
 assert.equal(body.p_fields_json,f.fieldsJson);assert.equal(body.p_payload_sha256,f.dispatch.payload_sha256);
 assert.equal(body.p_session_id,f.user.session_id);assert.equal(body.p_owner_id,f.user.id);
 assert.equal(calls[0].options.headers.apikey,'fixture-api-only');
 await assert.rejects(()=>gateway.provisionSetupDispatch(f.workspace,{id:f.user.id},f),{code:'LOGIN_REQUIRED'});
 await assert.rejects(()=>gateway.provisionSetupDispatch(f.workspace,f.user,{...f,fieldsJson:JSON.stringify({hotelName:'Changed'})}),{code:'SETUP_DISPATCH_CHANGED'});
 assert.equal(calls.length,1,'Validation failure must not dispatch a remote mutation');
 const invalid=new ClusterGateway(f.config,async()=>Response.json({...f.committed,dispatch_id:randomUUID()}));
 await assert.rejects(()=>invalid.provisionSetupDispatch(f.workspace,f.user,f),{code:'SETUP_RECEIPT_INVALID'});
});
test('API close adapter validates busy identity, never takes an owner session and does not use legacy provisioning on transport failure',async()=>{
 const f=fixture(),calls=[];
 const busy={...f.committed,state:'busy'};
 const gateway=new ClusterGateway(f.config,async(url,options)=>{calls.push({url,options});return Response.json(busy)});
 assert.equal((await gateway.closeSetupDispatch(f.workspace,f.dispatch)).state,'busy');
 assert.equal(calls[0].url.endsWith('/close_workspace_setup_dispatch'),true);
 const body=JSON.parse(calls[0].options.body);assert.equal(Object.keys(body).length,5);
 assert.equal(body.p_session_id,undefined);assert.equal(body.p_fields_json,undefined);
 const failed=new ClusterGateway(f.config,async(url)=>{calls.push({url});throw new Error('private customer value')});
 await assert.rejects(()=>failed.provisionSetupDispatch(f.workspace,f.user,f),e=>e.code==='CLUSTER_UNAVAILABLE'&&!e.message.includes('private customer'));
 assert.equal(calls.some(c=>c.url.endsWith('/provision_workspace_registration')),false);
 const invalid=new ClusterGateway(f.config,async()=>Response.json({...busy,payload_sha256:'a'.repeat(64)}));
 await assert.rejects(()=>invalid.closeSetupDispatch(f.workspace,f.dispatch),{code:'SETUP_RECEIPT_INVALID'});
});
