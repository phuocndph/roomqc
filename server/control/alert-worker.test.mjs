import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {alertAcknowledgement,alertCommandReceipt} from './alert-commands.mjs';
import {alertConfiguration,loadAlertConfiguration} from './workers/alert-config.mjs';
import {AlertWorker,createAlertSender} from './workers/alert-worker.mjs';
import {startAlertRuntime} from './workers/alert-runtime.mjs';

const raw=()=>({schemaVersion:1,instanceId:'test-alerts',poolMax:2,concurrency:2,intervalMs:100,requestTimeoutMs:1000,leaseMs:12000,
  shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:30,otherAllocatedConnections:20,instances:1,reservedConnections:5}});
const secrets={databaseUrl:'postgresql://fixture:fixture@127.0.0.1/fixture',endpoint:'http://127.0.0.1/operations',
  token:'synthetic-operations-token',production:false,allowLocal:true};
test('alert command: canonical identity and strict immutable receipt reject inconsistent results and strip stored extras',()=>{
  const id=randomUUID(),key=randomUUID(),command=alertAcknowledgement(id,{expectedVersion:1,reason:'  Handle incident '},key);
  assert.equal(command.payloadHash,alertAcknowledgement(id,{reason:'Handle incident',expectedVersion:1},key).payloadHash);
  assert.equal(command.payloadHash,alertAcknowledgement(id.toUpperCase(),{reason:'Handle incident',expectedVersion:1},key.toUpperCase()).payloadHash);
  assert.notEqual(command.payloadHash,alertAcknowledgement(id,{expectedVersion:2,reason:'Handle incident'},key).payloadHash);
  for(const [target,body,token]of [[[id],{expectedVersion:1,reason:'valid reason'},key],[id,{expectedVersion:0,reason:'valid reason'},key],
    [id,{expectedVersion:1,reason:'valid reason',actorId:randomUUID()},key],[id,{expectedVersion:1,reason:'valid reason'},[key]]])
    assert.throws(()=>alertAcknowledgement(target,body,token),{code:'INVALID_ALERT_COMMAND'});
  const now=new Date().toISOString(),actorId=randomUUID(),row={id:randomUUID(),status:'succeeded',expected_version:'1',actor_id:actorId,finished_at:now,
    result:{status:'succeeded',targetVersion:2,result:{id,resourceId:'cluster-a',type:'DISK_CRITICAL',severity:'critical',openedAt:now,lastSeenAt:now,
      acknowledgedAt:now,acknowledgedBy:actorId,resolvedAt:null,rowVersion:2,privateKey:'private-marker'},privateKey:'private-marker'}};
  assert.equal(JSON.stringify(alertCommandReceipt(row,id)).includes('private-marker'),false);
  for(const delta of [{status:'started'},{finished_at:null},{expected_version:2},{actor_id:randomUUID()},
    {result:{...row.result,targetVersion:'2'}},{result:{...row.result,result:{...row.result.result,rowVersion:3}}},
    {result:{...row.result,result:{...row.result.result,acknowledgedAt:null}}}])
    assert.throws(()=>alertCommandReceipt({...row,...delta},id),{code:'ALERT_COMMAND_PENDING'});
});
test('alert configuration: explicit files, HTTPS/TLS in production, bounded pools, lease and connection budget; secrets are never echoed',async()=>{
  assert.equal(alertConfiguration(raw(),secrets).allowLocal,true);
  for(const changed of [{...secrets,production:true},{...secrets,allowLocal:false},{...secrets,token:'short'},
    {...secrets,endpoint:'http://169.254.169.254/metadata'},{...secrets,endpoint:'https://user:password@example.invalid/send'},
    {...secrets,endpoint:'https://example.invalid/send?token=secret'}])assert.throws(()=>alertConfiguration(raw(),changed),{code:'INVALID_ALERT_CONFIG'});
  for(const changed of [{...raw(),unexpected:true},{...raw(),leaseMs:1000},{...raw(),concurrency:3},
    {...raw(),connectionBudget:{...raw().connectionBudget,maxConnections:5}},{...raw(),approvedAddresses:['bad']}])
    assert.throws(()=>alertConfiguration(changed,secrets),{code:'INVALID_ALERT_CONFIG'});
  const temp=await mkdtemp(join(tmpdir(),'roomqc-alert-config-'));
  try{
    for(const [file,body]of [['config',JSON.stringify(raw())],['db',secrets.databaseUrl],['endpoint',secrets.endpoint],['token',secrets.token]])
      await writeFile(join(temp,file),body,{mode:0o600});
    const env={ROOMQC_ALERT_CONFIG_FILE:join(temp,'config'),ROOMQC_ALERT_DATABASE_URL_FILE:join(temp,'db'),ROOMQC_ALERT_ENDPOINT_FILE:join(temp,'endpoint'),
      ROOMQC_ALERT_TOKEN_FILE:join(temp,'token'),ROOMQC_ALERT_ALLOW_LOCAL:'true',NODE_ENV:'test'};
    assert.equal((await loadAlertConfiguration(env)).token,secrets.token);
    await assert.rejects(()=>loadAlertConfiguration({...env,ROOMQC_ALERT_TOKEN_FILE:undefined}),error=>error.code==='INVALID_ALERT_CONFIG'&&!error.message.includes('synthetic'));
  }finally{await rm(temp,{recursive:true})}
});
test('alert worker: bounded concurrent dispatch, no overlap, redacted dependency failure, stale heartbeat, shutdown and scheduler cancellation',async()=>{
  let active=0,max=0,claimed=0,settled=0;const events=[];
  const store={readiness:async()=>{},claim:async()=>({id:randomUUID(),token:randomUUID(),attempt:++claimed,payload:{}}),
    settle:async()=>{settled++;return {settled:true,state:'delivered'}}};
  const worker=new AlertWorker({store,send:async()=>{active++;max=Math.max(max,active);await delay(20);active--;return {outcome:'delivered'}},
    concurrency:2,intervalMs:100,requestTimeoutMs:1000,shutdownTimeoutMs:2000,onEvent:e=>events.push(e)});
  const running=worker.tick();assert.deepEqual(await worker.tick(),{skipped:true,reason:'ALREADY_RUNNING'});await running;
  assert.equal(max,2);assert.equal(settled,2);assert.equal(worker.status().ready,true);
  worker.lastCycleAt=new Date(Date.now()-60000).toISOString();assert.equal(worker.status().ready,false);
  store.readiness=async()=>{throw new Error('private-database-password')};await worker.tick();assert.equal(worker.status().ready,false);
  assert.equal(worker.status().lastErrorCode,'ALERT_DEPENDENCY_FAILED');assert.equal(JSON.stringify(events).includes('password'),false);
  await worker.shutdown();assert.deepEqual(await worker.tick(),{skipped:true,reason:'STOPPING'});
});
test('alert worker: timed-out or aborted sends settle with stable retry; shutdown during claim sends nothing; scheduler stops',async()=>{
  const outcomes=[];let sends=0,releaseClaim;
  const store={readiness:async()=>{},claim:async()=>({id:randomUUID(),token:randomUUID(),attempt:1,payload:{}}),
    settle:async(claim,result)=>{outcomes.push(result);return {settled:true,state:'retry'}}};
  const worker=new AlertWorker({store,send:()=>{sends++;return new Promise(()=>{})},concurrency:1,intervalMs:100,requestTimeoutMs:20,shutdownTimeoutMs:100});
  const keepAlive=setTimeout(()=>{},2000);
  try{
    await worker.tick();assert.equal(outcomes[0].code,'DELIVERY_TIMEOUT');
    worker.start();await delay(5);assert.equal((await worker.shutdown()).timedOut,false);assert.equal(outcomes[1].code,'DELIVERY_INTERRUPTED');
    await delay(120);assert.equal(sends,2);
    const held=new AlertWorker({store:{...store,claim:()=>new Promise(resolve=>{releaseClaim=()=>resolve({id:randomUUID(),token:randomUUID(),attempt:1,payload:{}})})},
      send:async()=>{sends++;return {outcome:'delivered'}},concurrency:1,requestTimeoutMs:20,shutdownTimeoutMs:100});
    const running=held.tick();await delay(5);const stopped=held.shutdown();releaseClaim();await running;await stopped;
    assert.equal(sends,2);assert.equal(outcomes.at(-1).code,'DELIVERY_INTERRUPTED');
  }finally{clearTimeout(keepAlive);await worker.shutdown()}
});
test('alert sender: local HTTP classification, redirects never followed, response bounded, timeout is retry and destination pinning rejects metadata',async()=>{
  let status=429,redirectHits=0,large=false;
  const sink=createServer((req,res)=>{if(req.url==='/redirect-target')redirectHits++;res.writeHead(status,status===302?{location:'/redirect-target'}:{});res.end(large?'x'.repeat(5000):'{}')});
  await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
  try{
    const config=alertConfiguration(raw(),{...secrets,endpoint:`http://127.0.0.1:${sink.address().port}/send`}),send=createAlertSender(config),claim={id:randomUUID(),payload:{version:1}};
    const dispatch=()=>send(claim,{signal:AbortSignal.timeout(2000)});
    for(const [code,outcome,errorCode]of [[204,'delivered',undefined],[429,'retry','DELIVERY_RATE_LIMIT'],[503,'retry','DELIVERY_SERVER_ERROR'],
      [408,'retry','DELIVERY_TIMEOUT'],[401,'permanent','DELIVERY_AUTH_REJECTED'],[422,'permanent','DELIVERY_REJECTED'],[302,'permanent','DELIVERY_DESTINATION_DENIED']]){
      status=code;const result=await dispatch();assert.equal(result.outcome,outcome);assert.equal(result.code,errorCode);
    }
    assert.equal(redirectHits,0);status=200;large=true;assert.equal((await dispatch()).code,'DELIVERY_RESPONSE_INVALID');
    const aborted=new AbortController();aborted.abort();assert.equal((await send(claim,{signal:aborted.signal})).code,'DELIVERY_INTERRUPTED');
    const denied=createAlertSender({...config,endpoint:'https://169.254.169.254/send'});
    assert.equal((await denied(claim,{signal:AbortSignal.timeout(100)})).code,'DELIVERY_DESTINATION_DENIED');
  }finally{sink.closeAllConnections();await new Promise(resolve=>sink.close(resolve))}
});
test('alert runtime: binds only local status, startup refuses bad DB authority and shutdown is idempotent',async()=>{
  const config=alertConfiguration(raw(),secrets),store={readiness:async()=>{},claim:async()=>null,settle:async()=>{}};
  const runtime=await startAlertRuntime(config,{store,send:async()=>({outcome:'delivered'}),port:0,autoStart:false});
  try{
    const origin=`http://127.0.0.1:${runtime.server.address().port}`;assert.equal(runtime.server.address().address,'127.0.0.1');
    assert.equal((await fetch(origin+'/livez')).status,200);assert.equal((await fetch(origin+'/readyz')).status,503);
    await runtime.worker.tick();assert.equal((await fetch(origin+'/readyz')).status,200);
    const [a,b]=await Promise.all([runtime.shutdown(),runtime.shutdown()]);assert.deepEqual(a,b);assert.equal(a.timedOut,false);
    await assert.rejects(()=>startAlertRuntime(config,{store:{...store,readiness:async()=>{throw new Error('isolated unavailable')}},port:0}),/isolated unavailable/);
  }finally{await runtime.shutdown()}
});
