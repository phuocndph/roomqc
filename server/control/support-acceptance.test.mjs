import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ClusterGateway} from './cluster.mjs';
import {supportAcceptanceContext,supportAcceptanceReceipt} from './support-acceptance.mjs';
const actor={id:randomUUID(),clusterId:'authority'},sessionId=randomUUID();
const scope=()=>({attemptId:randomUUID(),audience:randomUUID(),operation:'cluster_command',target:'cluster-a',key:randomUUID().toUpperCase(),payloadHash:'a'.repeat(64)});
const receipt=c=>({protocolVersion:1,acceptanceId:randomUUID(),actorId:c.actorId,sessionId,attemptId:c.attemptId,audience:c.audience,
 operation:c.operation,target:c.target,requestKey:c.key,payloadSha256:c.payloadHash,acceptedAtMs:1000000,observedAtMs:1000100,expiresAtMs:1005000});
test('acceptance context binds exact command identity and rejects extra/coercible scope values',()=>{
 const s=scope(),c=supportAcceptanceContext(actor,s);assert.equal(c.key,s.key);assert(Object.isFrozen(c));
 for(const key of Object.keys(s))for(const value of [null,[s[key]],{toString:()=>s[key]}])
  assert.throws(()=>supportAcceptanceContext(actor,{...s,[key]:value}),{code:'SUPPORT_ACCEPTANCE_INVALID'});
 for(const bad of [{...s,operation:'new_admin_action'},{...s,target:'Cluster-A'},{...s,target:'a'.repeat(49)},
  {...s,payloadHash:'A'.repeat(64)},{...s,sessionId},{...s,serviceKey:'secret'}])
  assert.throws(()=>supportAcceptanceContext(actor,bad),{code:'SUPPORT_ACCEPTANCE_INVALID'});
});
test('acceptance receipt is evidence for one attempt, never a caller-supplied permission or arbitrary remote payload',()=>{
 const c=supportAcceptanceContext(actor,scope()),value=receipt(c);
 const safe=supportAcceptanceReceipt({...value,secret:'private-marker'},c,sessionId);
 assert.equal(JSON.stringify(safe).includes('private-marker'),false);assert(Object.isFrozen(safe));
 for(const key of ['actorId','sessionId','attemptId','audience','operation','target','requestKey','payloadSha256'])
  assert.throws(()=>supportAcceptanceReceipt({...value,[key]:'different'},c,sessionId),{code:'SUPPORT_ACCEPTANCE_INVALID'});
 for(const patch of [{protocolVersion:2},{acceptanceId:[value.acceptanceId]},{expiresAtMs:value.acceptedAtMs},
  {expiresAtMs:value.acceptedAtMs+5001},{acceptedAtMs:NaN},{acceptedAtMs:-1},{observedAtMs:undefined},
  {observedAtMs:value.acceptedAtMs-1},{observedAtMs:value.expiresAtMs},{expiresAtMs:'1005000'}])
  assert.throws(()=>supportAcceptanceReceipt({...value,...patch},c,sessionId),{code:'SUPPORT_ACCEPTANCE_INVALID'});
});
test('gateway sends only the scoped acceptance RPC to configured authority with the operator JWT',async()=>{
 const s=scope(),c=supportAcceptanceContext(actor,s),value=receipt(c),calls=[];
 const cluster={id:'authority',url:'https://authority.invalid',publishableKey:'public',serviceKey:'private'};
 const token='fixture.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature';
 const gateway=new ClusterGateway({clusters:[cluster],supportClusterId:'authority'},async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>({...value,secret:'private-marker'})};
 });
 assert.deepEqual(await gateway.acceptSupportCommand(actor,token,s),value);assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://authority.invalid/rest/v1/rpc/accept_platform_support_command');
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);assert.equal(calls[0].options.headers.apikey,'public');
 assert.deepEqual(JSON.parse(calls[0].options.body),{p_attempt_id:s.attemptId,p_audience:s.audience,p_operation:s.operation,p_target:s.target,p_request_key:s.key,p_payload_sha256:s.payloadHash});
 await assert.rejects(()=>gateway.acceptSupportCommand({...actor,clusterId:'elsewhere'},token,s),{code:'SUPPORT_ACTOR_CHANGED'});
 await assert.rejects(()=>gateway.acceptSupportCommand(actor,'invalid',s),{code:'LOGIN_REQUIRED'});assert.equal(calls.length,1);
});
test('transport denial, timeout and a mismatching returned receipt never fall back to a service credential',async()=>{
 const s=scope(),c=supportAcceptanceContext(actor,s),token='fixture.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature';
 for(const failure of ['transport','denied','wrong-identity']){
  let calls=0;const gateway=new ClusterGateway({clusters:[{id:'authority',url:'https://authority.invalid',publishableKey:'public',serviceKey:'private'}],supportClusterId:'authority'},async()=>{
   calls++;if(failure==='transport')throw Error('private transport');return failure==='denied'?{ok:false,status:403}:{ok:true,json:async()=>({...receipt(c),actorId:randomUUID()})};
  });
  await assert.rejects(()=>gateway.acceptSupportCommand(actor,token,s),error=>{
   assert.equal(JSON.stringify(error).includes('private transport'),false);return error.code===({transport:'CLUSTER_UNAVAILABLE',denied:'CLUSTER_REQUEST_FAILED','wrong-identity':'SUPPORT_ACCEPTANCE_INVALID'}[failure]);
  });assert.equal(calls,1);
 }
});

test('only the canonical scoped expiry response permits recovery, never a generic denial or unavailable response',async()=>{
 const s=scope(),token='fixture.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature';
 const cluster={id:'authority',url:'https://authority.invalid',publishableKey:'public',serviceKey:'private'};
 const expired={code:'55000',message:'SUPPORT_ACCEPTANCE_EXPIRED'};
 for(const [status,payload,expected]of [
  [400,expired,'SUPPORT_ACCEPTANCE_EXPIRED'],[503,expired,'SUPPORT_ACCEPTANCE_EXPIRED'],
  [401,expired,'CLUSTER_REQUEST_FAILED'],[403,expired,'CLUSTER_REQUEST_FAILED'],
  [503,{message:'SUPPORT_ACCEPTANCE_EXPIRED'},'CLUSTER_REQUEST_FAILED'],
  [503,{code:'XX000',message:'SUPPORT_ACCEPTANCE_EXPIRED'},'CLUSTER_REQUEST_FAILED'],
  [503,{code:'55000',message:'SUPPORT_ACCEPTANCE_SCOPE_CONFLICT'},'CLUSTER_REQUEST_FAILED'],
  [503,{code:'55000',message:'SUPPORT_ACCEPTANCE_EXPIRED extra'},'CLUSTER_REQUEST_FAILED']]){
  const gateway=new ClusterGateway({clusters:[cluster],supportClusterId:'authority'},async()=>({ok:false,status,json:async()=>payload}));
  await assert.rejects(()=>gateway.acceptSupportCommand(actor,token,s),{code:expected});
  await assert.rejects(()=>gateway.request(cluster,'/rest/v1/rpc/platform_support_actor',{token,body:{},supportAcceptance:true}),{code:'CLUSTER_REQUEST_FAILED'});
 }
 const malformed=new ClusterGateway({clusters:[cluster],supportClusterId:'authority'},async()=>({ok:false,status:503,json:async()=>{throw Error('invalid json')}}));
 await assert.rejects(()=>malformed.acceptSupportCommand(actor,token,s),{code:'CLUSTER_REQUEST_FAILED'});
});

test('decoding a session binding never authorizes an operator without the live authority RPC',async()=>{
 const token='fixture.'+Buffer.from(JSON.stringify({session_id:sessionId.toUpperCase(),role:'super_admin'})).toString('base64url')+'.signature';
 let calls=0;const gateway=new ClusterGateway({clusters:[{id:'authority',url:'https://authority.invalid',publishableKey:'public',serviceKey:'private'}],supportClusterId:'authority'},async()=>{
  calls++;return {ok:false,status:403};
 });
 assert.equal(gateway.supportSessionId(token),sessionId);assert.equal(calls,0);
 await assert.rejects(()=>gateway.supportActor(token),{status:403,code:'CLUSTER_REQUEST_FAILED'});assert.equal(calls,1);
});
