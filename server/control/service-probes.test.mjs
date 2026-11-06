import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {collectServiceProbes,serviceProbeConfiguration,probeRealtimeCanary,verifyRealtimeProbeIsolation} from './service-probes.mjs';

const bytes=Buffer.from('synthetic storage canary'),id='11111111-1111-4111-8111-111111111111';
const jwt=claims=>['header',Buffer.from(JSON.stringify(claims)).toString('base64url'),'signature'].join('.');
const expected={clusterId:'fixture-a',releaseId:'release-1',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
  migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
const input={expected,credential:{publishableKey:'synthetic-public',token:jwt({role:'roomqc_control_probe',exp:Math.floor(Date.now()/1000)+300})},
  auth:{token:jwt({role:'authenticated',sub:id,session_id:id,exp:Math.floor(Date.now()/1000)+300}),userId:id},storage:{sha256:createHash('sha256').update(bytes).digest('hex')}};
async function fixture(){
  const mode={auth:'ok',rest:'ok',storage:'ok',realtime:'ok',functions:'ok'},seen=[];
  const server=createServer(async(req,res)=>{
    const service=req.url.startsWith('/auth/')?'auth':req.url.startsWith('/rest/')?'rest':req.url.startsWith('/storage/')?'storage':'functions';
    seen.push({service,authorization:req.headers.authorization});
    if(mode[service]==='hang')return;
    if(mode[service]==='denied'){res.writeHead(403);res.end('{}');return}
    if(mode[service]==='down'){res.writeHead(503);res.end('{}');return}
    let raw='';for await(const part of req)raw+=part;const data=raw?JSON.parse(raw):{};
    if(service==='auth'){res.end(JSON.stringify({id:mode.auth==='wrong'?expected.clusterId:id,email_confirmed_at:new Date().toISOString()}));return}
    if(service==='storage'){res.end(mode.storage==='wrong'?Buffer.from('wrong bytes'):bytes);return}
    if(service==='rest'){res.end(JSON.stringify({...expected,contractVersion:3,schemaFingerprintVersion:3,
      expectedSchemaManifestHash:expected.schemaManifestHash,challenge:mode.rest==='wrong'?'wrong':data.p_challenge,checkedAt:new Date().toISOString()}));return}
    res.end(JSON.stringify({contractVersion:3,service:'functions',clusterId:expected.clusterId,
      releaseId:mode.functions==='wrong'?'wrong':expected.releaseId,challenge:data.challenge,checkedAt:new Date().toISOString()}));
  });
  const ws=new WebSocketServer({server});
  ws.on('connection',socket=>socket.on('message',raw=>{
    const message=JSON.parse(raw.toString());
    if(mode.realtime==='hang')return;
    if(mode.realtime==='close'){socket.close();return}
    if(message.event==='phx_join'){
      socket.send(JSON.stringify({topic:mode.realtime==='wrong-topic'?'realtime:unrelated':message.topic,event:'phx_reply',
        ref:mode.realtime==='wrong-ref'?'unrelated':message.ref,payload:{status:mode.realtime==='ok'?'ok':'error',
          response:{reason:mode.realtime==='wrong-reason'?'Unrelated service error':
            'Unauthorized: You do not have permissions to read from this Channel topic: '+message.topic.slice('realtime:'.length)}}}));return;
    }
    for(const client of ws.clients)if(client!==socket)client.send(JSON.stringify(message));
  }));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const cluster={id:expected.clusterId,url:'http://127.0.0.1:'+server.address().port};
  return {mode,seen,cluster,config:{allowLocal:true,inventory:new Map([[cluster.id,cluster]])},
    close:async()=>{for(const client of ws.clients)client.terminate();await new Promise(resolve=>ws.close(resolve));
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('five protocol probes require DB user identity, nonce manifest, exact private bytes and real two-client broadcast',async()=>{
  const f=await fixture();try{
    const result=await collectServiceProbes(f.config,f.cluster,input);
    assert.deepEqual(result.probes,{auth:true,rest:true,storage:true,realtime:true,functions:true});
    assert.equal(result.results.length,5);assert.ok(result.results.every(r=>r.status==='ok'&&r.targetFingerprint.length===64));
    assert.equal(f.seen.find(r=>r.service==='auth').authorization,'Bearer '+input.auth.token);
    for(const entry of f.seen.filter(r=>r.service!=='auth'))assert.equal(entry.authorization,'Bearer '+input.credential.token);
    for(const service of ['auth','rest','storage','functions']){
      f.mode[service]='wrong';const failed=await collectServiceProbes(f.config,f.cluster,input);
      assert.equal(failed.probes[service],false);assert.equal(failed.results.find(r=>r.service===service).status,'invalid_response');f.mode[service]='ok';
    }
    f.mode.realtime='denied';const denied=await collectServiceProbes(f.config,f.cluster,input);
    assert.equal(denied.probes.realtime,false);assert.equal(denied.results.find(r=>r.service==='realtime').status,'denied');
  }finally{await f.close()}
});

test('HTTP/WS port or upgrade without valid payload never becomes healthy; parallel deadline is bounded',async()=>{
  const f=await fixture();try{
    for(const service of Object.keys(f.mode))f.mode[service]='hang';
    const started=Date.now(),result=await collectServiceProbes(f.config,f.cluster,input,{timeoutMs:80});
    assert.ok(Date.now()-started<1500,'Five deadlines run concurrently, not sequentially');
    assert.ok(result.results.every(r=>r.status==='timeout'));assert.ok(Object.values(result.probes).every(v=>v===false));
    assert.ok(!JSON.stringify(result).includes(input.auth.token));assert.ok(!JSON.stringify(result).includes(input.credential.token));
    const cancelled=new AbortController();cancelled.abort();
    const aborted=await collectServiceProbes(f.config,f.cluster,input,{signal:cancelled.signal});
    assert.ok(Object.values(aborted.probes).every(v=>v===false));
  }finally{await f.close()}
});

test('service configuration forbids service-role fallback, extra keys, business bucket paths and mismatched identity',async()=>{
  assert.ok(Object.isFrozen(serviceProbeConfiguration(input)));
  for(const raw of [null,{...input,extra:true},{...input,credential:{...input.credential,serviceKey:'not-allowed'}},
    {...input,credential:{...input.credential,token:jwt({role:'service_role'})}},
    {...input,storage:{...input.storage,bucket:'business'}},{...input,auth:{...input.auth,userId:expected.clusterId}}]){
    assert.throws(()=>serviceProbeConfiguration(raw),{code:'SERVICE_PROBES_UNCONFIGURED'});
  }
  await assert.rejects(()=>collectServiceProbes({}, {id:'fixture-b'}, input),{code:'SERVICE_PROBES_UNCONFIGURED'});
});

test('private Realtime deployment initialization works without a manifest and preserves credential/deadline boundaries',async()=>{
  const f=await fixture();try{
    await probeRealtimeCanary(f.config,f.cluster,input.credential);
    assert.equal(f.seen.length,0,'Initialization must not call REST or invent an expected schema hash');
    await assert.rejects(()=>probeRealtimeCanary(f.config,f.cluster,{...input.credential,token:jwt({role:'service_role'})}),
      {code:'SERVICE_PROBES_UNCONFIGURED'});
    f.mode.realtime='denied';await assert.rejects(()=>probeRealtimeCanary(f.config,f.cluster,input.credential),{code:'SERVICE_PROBE_DENIED'});
    f.mode.realtime='hang';const started=Date.now();
    await assert.rejects(()=>probeRealtimeCanary(f.config,f.cluster,input.credential,{timeoutMs:60}));
    assert.ok(Date.now()-started<1000);
    const cancelled=new AbortController();cancelled.abort();
    await assert.rejects(()=>probeRealtimeCanary(f.config,f.cluster,input.credential,{signal:cancelled.signal}));
  }finally{await f.close()}
});

test('private Realtime isolation requires the explicit Unauthorized denial correlated to its topic and request',async()=>{
  const f=await fixture();try{
    f.mode.realtime='denied';const result=await verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential);
    assert.deepEqual(result,{verified:true,event:'phx_reply',status:'error',reasonCode:'Unauthorized',matchedRequest:true,timeoutMs:8000});
    assert.ok(!JSON.stringify(result).includes(input.credential.token));
    for(const mode of ['ok','wrong-topic','wrong-ref','wrong-reason']){
      f.mode.realtime=mode;
      await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential),{code:'SERVICE_PROBE_INVALID'});
    }
    f.mode.realtime='ok';await probeRealtimeCanary(f.config,f.cluster,input.credential);
  }finally{await f.close()}
});

test('private Realtime isolation never treats close, timeout, abort or invalid credentials as successful denial',async()=>{
  const f=await fixture();try{
    f.mode.realtime='close';await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential),{code:'SERVICE_PROBE_UNAVAILABLE'});
    f.mode.realtime='hang';const started=Date.now();
    await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential,{timeoutMs:60}),{name:'TimeoutError'});
    assert.ok(Date.now()-started<1500);
    const cancelled=new AbortController();cancelled.abort();
    await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential,{signal:cancelled.signal}),{name:'AbortError'});
    await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,{...input.credential,token:jwt({role:'service_role'})}),
      {code:'SERVICE_PROBES_UNCONFIGURED'});
    await assert.rejects(()=>verifyRealtimeProbeIsolation(f.config,f.cluster,input.credential,{timeoutMs:10001}),{code:'SERVICE_PROBES_UNCONFIGURED'});
  }finally{await f.close()}
});
