import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {handleControlProbe} from '../../supabase/functions/control-probe/handler.mjs';

const jwtSecret=randomBytes(32).toString('hex'),now=Date.now(),challenge='a'.repeat(64);
const config={jwtSecret,clusterId:'fixture-a',releaseId:'release-1',now:()=>now};
const jwt=(claims={},secret=jwtSecret,header={alg:'HS256',typ:'JWT'})=>{
  const data=[header,{role:'roomqc_control_probe',exp:Math.floor(now/1000)+120,...claims}]
    .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
};
const request=(token=jwt(),body={challenge},extra={})=>new Request('https://fixture.invalid/control-probe',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),...extra});

test('function canary verifies dedicated signed role and nonce without granting business or provider access',async()=>{
  const result=await handleControlProbe(request(),config);assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(await result.json(),{contractVersion:3,service:'functions',clusterId:config.clusterId,
    releaseId:config.releaseId,challenge,checkedAt:new Date(now).toISOString()});
  for(const token of ['not-jwt',jwt({role:'anon'}),jwt({role:'authenticated'}),jwt({role:'service_role'}),
    jwt({exp:Math.floor(now/1000)-1}),jwt({nbf:Math.floor(now/1000)+60}),jwt({},'wrong-secret'),
    jwt({},jwtSecret,{alg:'none'}),jwt({},jwtSecret,{alg:'HS256',crit:['unknown']})]){
    const denied=await handleControlProbe(request(token),config);assert.equal(denied.status,401);
    assert.equal((await denied.json()).code,'PROBE_UNAUTHORIZED');
  }
});

test('function canary bounds input, fails closed on missing identity and does not echo invalid input',async()=>{
  for(const body of [{challenge:'x'},{challenge,extra:true},[],null,{challenge:'a'.repeat(5000)}]){
    const result=await handleControlProbe(request(jwt(),body),config);assert.equal(result.status,400);
    assert.deepEqual(await result.json(),{code:'PROBE_CHALLENGE_INVALID'});
  }
  assert.equal((await handleControlProbe(request(jwt(),{challenge},{headers:{authorization:'Bearer '+jwt(),'content-type':'text/plain'}}),config)).status,400);
  assert.equal((await handleControlProbe(request(),{...config,clusterId:undefined})).status,503);
  assert.equal((await handleControlProbe(request(),{...config,jwtSecret:undefined})).status,401);
  assert.equal((await handleControlProbe(new Request('https://fixture.invalid/control-probe'),config)).status,405);
});
