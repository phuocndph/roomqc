import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUpdateUser} from '../../supabase/functions/update-user/handler.mjs';

const userId='11111111-1111-4111-8111-111111111111', hotelId='22222222-2222-4222-8222-222222222222';
const positionId='33333333-3333-4333-8333-333333333333', requestId='44444444-4444-4444-8444-444444444444';
const body={protocolVersion:1,userId,fullName:'Owned Employee',hotelId,positionId,reportsTo:null,
  expectedUpdatedAt:'2026-10-27T01:02:03.123456+00:00',requestId};
const result={id:userId,full_name:body.fullName,hotel_id:hotelId,position_id:positionId,reports_to:null,
  department:'housekeeping',user_level_code:'staff',updated_at:'2026-10-27T01:02:04.123456+00:00'};
const request=(data=body, headers={}, method='POST')=>new Request('https://owned.invalid/functions/v1/update-user',{
  method,headers:{authorization:'Bearer caller-token','content-type':'application/json',...headers},
  ...(method==='POST'?{body:JSON.stringify(data)}:{})});
const options=(transport)=>({endpoint:'https://owned.invalid',publishableKey:'public-fixture',fetch:transport});

test('forwards exact request identity and caller JWT to one atomic RPC, with no elevated key or extra returned fields',async()=>{
  const calls=[];const reply=await handleUpdateUser(request(),options(async(url,init)=>{
    calls.push({url:String(url),init});return new Response(JSON.stringify({...result,private:'must not escape'}));}));
  assert.equal(reply.status,200);assert.equal(reply.headers.get('cache-control'),'no-store');
  assert.deepEqual((await reply.json()).user,result);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://owned.invalid/rest/v1/rpc/edit_employee_profile');
  assert.equal(calls[0].init.headers.authorization,'Bearer caller-token');assert.equal(calls[0].init.headers.apikey,'public-fixture');
  assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.credentials,'omit');
  assert.deepEqual(JSON.parse(calls[0].init.body),{p_target_id:userId,p_changes:{full_name:body.fullName,hotel_id:hotelId,position_id:positionId,reports_to:null},p_expected_updated_at:body.expectedUpdatedAt,p_request_id:requestId});
});
for(const field of ['userLevelCode','role','status','phone','departments'])test('rejects legacy '+field+' without silently applying the remaining fields',async()=>{
  let calls=0;const reply=await handleUpdateUser(request({...body,[field]:'owner'}),options(async()=>{calls++;}));
  assert.equal(reply.status,409);assert.equal((await reply.json()).code,'CLIENT_UPDATE_REQUIRED');assert.equal(calls,0);
});
for(const [name,value] of [['old-shape',{userId,fullName:'Old'}],['missing-key',Object.fromEntries(Object.entries(body).filter(([key])=>key!=='requestId'))],
  ['unknown-field',{...body,tenantId:hotelId}],['bad-version',{...body,expectedUpdatedAt:'not a date'}],['bad-id',{...body,hotelId:'bad'}],
  ['array-id',{...body,userId:[userId]}]])
  test('does not dispatch '+name,async()=>{let calls=0;const reply=await handleUpdateUser(request(value),options(async()=>{calls++;}));
    assert.ok([400,409].includes(reply.status));assert.equal(calls,0);});
test('bounds request size and does not dispatch oversized input',async()=>{
  let calls=0;const reply=await handleUpdateUser(request({...body,fullName:'x'.repeat(16385)}),options(async()=>{calls++;}));
  assert.equal(reply.status,413);assert.equal(calls,0);
});
test('denies missing bearer, unsupported method and malformed JSON before dispatch',async()=>{
  let calls=0;const config=options(async()=>{calls++;});const missing=request();missing.headers.delete('authorization');
  assert.equal((await handleUpdateUser(missing,config)).status,401);
  assert.equal((await handleUpdateUser(request(body,{},'GET'),config)).status,405);
  const malformed=new Request('https://owned.invalid/',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'{'});
  assert.equal((await handleUpdateUser(malformed,config)).status,400);assert.equal(calls,0);
});
for(const [status,code,message,expected]of [[401,'42501','private auth',401],[403,'42501','private permission',403],
  [409,'PT409','EMPLOYEE_EDIT_STALE_VERSION',409],[409,'PT409','EMPLOYEE_EDIT_REQUEST_CONFLICT',409],
  [400,'22023','private validation',400],[400,'23514','private trigger',502],[500,'XX000','private failure',502]])
  test('maps upstream '+status+'/'+code+'/'+message+' without exposing diagnostics',async()=>{
    const reply=await handleUpdateUser(request(),options(async()=>new Response(JSON.stringify({code,message,details:'secret-diagnostic'}),{status})));
    assert.equal(reply.status,expected);const text=await reply.text();assert.ok(!text.includes('secret-diagnostic'));assert.ok(!text.includes('private'));
  });
for(const [name,patch]of [['target',{id:hotelId}],['name',{full_name:'other'}],['hotel',{hotel_id:userId}],['version',{updated_at:'bad'}]])
  test('keeps malformed success outcome unknown: '+name,async()=>{
    const reply=await handleUpdateUser(request(),options(async()=>new Response(JSON.stringify({...result,...patch}))));
    assert.equal(reply.status,502);assert.equal((await reply.json()).code,'OUTCOME_UNKNOWN');
  });
test('bounds a non-cooperating transport without inventing a new request key',async()=>{
  const reply=await handleUpdateUser(request(),{...options(()=>new Promise(()=>{})),deadlineMs:5});
  assert.equal(reply.status,503);assert.equal((await reply.json()).code,'OUTCOME_UNKNOWN');
});
