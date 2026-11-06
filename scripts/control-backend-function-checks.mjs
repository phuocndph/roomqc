// Run only by the owned backend sandbox, inside its Storage container.
// Credentials come from exec environment, never command arguments or output.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

const origin='http://api-gw:8000',challenge=randomBytes(32).toString('hex');
const token=process.env.ROOMQC_FIXTURE_PROBE_TOKEN,key=process.env.ROOMQC_FIXTURE_ANON_KEY;
assert.ok(token&&key);
const invoke=(bearer=token,body={challenge})=>fetch(origin+'/functions/v1/control-probe',{
  method:'POST',signal:AbortSignal.timeout(5000),headers:{apikey:key,'content-type':'application/json',
    ...(bearer?{authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});

if(process.env.ROOMQC_FIXTURE_FUNCTION_STOPPED==='true'){
  let status=null,timedOut=false;
  try{const result=await invoke();status=result.status;assert.ok(status>=500,'Stopped runtime must not return a successful canary')}
  catch(error){if(error.name!=='TimeoutError')throw error;timedOut=true}
  console.log(JSON.stringify({stoppedRuntimeRejected:true,status,timedOut}));
}else{
  const positive=await invoke();assert.equal(positive.status,200,'Real function must execute on the isolated runtime');
  assert.equal(positive.headers.get('cache-control'),'no-store');const body=await positive.json();
  assert.deepEqual(Object.keys(body).sort(),['contractVersion','service','clusterId','releaseId','challenge','checkedAt'].sort());
  assert.equal(body.contractVersion,3);assert.equal(body.service,'functions');assert.equal(body.clusterId,'fixture-a');
  assert.equal(body.releaseId,'sandbox-v1');assert.equal(body.challenge,challenge);
  assert.ok(Math.abs(Date.now()-Date.parse(body.checkedAt))<5000);
  for(const bearer of [null,key,process.env.ROOMQC_FIXTURE_SERVICE_KEY,token.slice(0,-12)+'invalidsig00']){
    assert.ok([401,403].includes((await invoke(bearer)).status),'Wrong/missing roles or signatures must fail');
  }
  assert.equal((await invoke(token,{challenge:'wrong'})).status,400);
  console.log(JSON.stringify({functionInvokeVerified:true,negativeControls:5,nonceMatched:true}));
}
