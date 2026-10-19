import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {PrometheusSource,queryTemplates,validateTelemetryTarget,telemetryTargetFingerprint} from './telemetry-source.mjs';

const at=Date.UTC(2026,9,19),gib=1024**3;
const probes={auth:true,rest:true,storage:true,realtime:true,functions:true};
export function target(){return {clusterId:'fixture-a',hostId:'fixture-host',environment:'local',dbConnectionBudget:100,measurementScope:'docker-desktop-vm',
  dataMounts:[{id:'database',mountpoint:'/data/postgres',device:'/dev/sda1',fstype:'ext4'},
    {id:'storage',mountpoint:'/data/objects',device:'/dev/sdb1',fstype:'xfs'}]}}
function response(value,timestamp=at/1000){return {status:'success',data:{resultType:'vector',result:[{metric:{},value:[timestamp,String(value)]}]}}}
function values(){return {cpuUsedPercent:30,memoryAvailableBytes:8*gib,memoryTotalBytes:16*gib,dbConnectionsUsed:10,
  'disk:database:freeBytes':100*gib,'disk:database:totalBytes':200*gib,'disk:database:inodeFree':80,'disk:database:inodeTotal':100,'disk:database:readonly':0,
  'disk:storage:freeBytes':60*gib,'disk:storage:totalBytes':120*gib,'disk:storage:inodeFree':90,'disk:storage:inodeTotal':100,'disk:storage:readonly':0,
  sourceObservedAt:at/1000-30}}
function fakeSource(overrides={},options={}){
  const queries=queryTemplates(target()),byQuery=new Map(Object.entries(queries).map(([key,query])=>[query,key])),all={...values(),...overrides};
  return new PrometheusSource({url:'https://metrics.example.invalid',clock:()=>at,fetcher:async raw=>{
    const key=byQuery.get(new URL(raw).searchParams.get('query'));assert.ok(key);return {ok:true,json:async()=>response(all[key])};
  },...options});
}

test('telemetry inventory binds host/cluster/scope and real mounts, rejecting ambiguous or unsupported mappings',()=>{
  const input=target(),clean=validateTelemetryTarget(input);input.dataMounts[0].mountpoint='/changed';
  assert.equal(clean.dataMounts[0].mountpoint,'/data/postgres');assert.ok(Object.isFrozen(clean.dataMounts[0]));
  for(const change of [{clusterId:['fixture-a']},{hostId:'bad"id'},{environment:'unknown'},{dataMounts:[]},
    {dbConnectionBudget:0},{dbConnectionBudget:1.5},{environment:'staging'},{query:'up'}]){
    assert.throws(()=>validateTelemetryTarget({...target(),...change}),{code:'TELEMETRY_SOURCE_INVALID'});
  }
  for(const change of [{mountpoint:'/data/../elsewhere'},{mountpoint:'/data/postgres/'},{device:'/dev/../sda1'},{device:'overlay'},
    {fstype:'tmpfs'},{fstype:'zfs'},{mountpoint:'/data\nobjects'},{query:'up'},{id:'bad/id'}]){
    const input=target();input.dataMounts[1]={...input.dataMounts[1],...change};
    assert.throws(()=>validateTelemetryTarget(input),{code:'TELEMETRY_SOURCE_INVALID'});
  }
  for(const key of ['id','mountpoint']){const input=target();input.dataMounts[1][key]=input.dataMounts[0][key];assert.throws(()=>validateTelemetryTarget(input),{code:'TELEMETRY_SOURCE_INVALID'})}
  const reordered=target();reordered.dataMounts.reverse();assert.equal(telemetryTargetFingerprint(target()),telemetryTargetFingerprint(reordered));
  for(const key of ['hostId','dbConnectionBudget','measurementScope']){
    const input=target();input[key]=key==='dbConnectionBudget'?101:key==='hostId'?'other-host':'linux-host';
    assert.notEqual(telemetryTargetFingerprint(target()),telemetryTargetFingerprint(input));
  }
  assert.equal(validateTelemetryTarget({...target(),environment:'staging',measurementScope:'linux-host'}).environment,'staging');
});

test('query templates select fixed inventory and retain every source timestamp using distinct union labels',()=>{
  const queries=queryTemplates(target());assert.equal(Object.keys(queries).length,15);
  for(const query of Object.values(queries))for(const field of ['host_id="fixture-host"','cluster_id="fixture-a"','environment="local"'])assert.ok(query.includes(field));
  assert.ok(queries.cpuUsedPercent.includes('[1m]'));
  assert.ok(queries['disk:storage:freeBytes'].includes('mountpoint="/data/objects",device="/dev/sdb1",fstype="xfs"'));
  const unique=[...queries.sourceObservedAt.matchAll(/"roomqc_source", "(s\d+)"/g)].map(match=>match[1]);
  assert.equal(unique.length,14);assert.equal(new Set(unique).size,14);
});

test('collection produces one coherent v2 sample from separate disks and never hides a failing service',async()=>{
  const sample=await fakeSource().collect(target(),{...probes,realtime:false});
  assert.equal(sample.observedAt,new Date(at-30000).toISOString());assert.equal(sample.schemaVersion,2);
  assert.equal(sample.targetFingerprint,telemetryTargetFingerprint(target()));assert.equal(sample.measurementScope,'docker-desktop-vm');
  assert.deepEqual(sample.requiredMountIds,['database','storage']);assert.equal(sample.dataDisks[1].freeBytes,60*gib);
  assert.equal(sample.metrics.dataDiskTotalBytes,200*gib);assert.equal(sample.metrics.dataDiskFreeBytes,100*gib);
  assert.equal(sample.dataDisks[1].inodeFreePercent,90);assert.equal(sample.probes.realtime,false);
});

test('scalar rejects empty/ambiguous/malformed/stale evaluation results instead of coercing them to zero',async()=>{
  const good=response(30),bad=[null,{}, {status:'error'}, {...good,data:{resultType:'matrix',result:good.data.result}},
    {...good,data:{resultType:'vector',result:[]}},{...good,data:{resultType:'vector',result:[...good.data.result,...good.data.result]}}];
  for(const value of ['', ' ', 'NaN','+Inf','Infinity','0x10',null,30]){
    const data=response(30);data.data.result[0].value[1]=value;bad.push(data);
  }
  for(const stamp of [null,'',at/1000-30,at/1000+10])bad.push(response(30,stamp));
  for(const data of bad){
    const source=fakeSource({}, {fetcher:async()=>({ok:true,json:async()=>data})});
    await assert.rejects(()=>source.collect(target(),probes),{code:'TELEMETRY_SOURCE_INVALID'});
  }
  await assert.rejects(()=>fakeSource({}, {fetcher:async()=>({ok:true,json:async()=>{throw new SyntaxError('raw sensitive payload')}})}).collect(target(),probes),{code:'TELEMETRY_SOURCE_INVALID'});
  await assert.rejects(()=>fakeSource({}, {fetcher:async()=>{throw new Error('raw connection secret')}}).collect(target(),probes),error=>{
    assert.equal(error.code,'TELEMETRY_SOURCE_UNAVAILABLE');assert.equal(error.message.includes('secret'),false);return true;
  });
});

test('collection rejects stale/future/invalid source time, incomplete probes and readonly or invalid inode counters',async()=>{
  for(const [overrides,code]of [[{sourceObservedAt:at/1000-121},'INVALID_SAMPLE_TIME'],[{sourceObservedAt:at/1000+6},'INVALID_SAMPLE_TIME'],
    [{sourceObservedAt:1e16},'TELEMETRY_SOURCE_INVALID'],[{'disk:storage:readonly':1},'TELEMETRY_SOURCE_INVALID'],
    [{'disk:storage:inodeTotal':0},'TELEMETRY_SOURCE_INVALID'],[{'disk:storage:inodeFree':101},'TELEMETRY_SOURCE_INVALID'],
    [{'disk:storage:inodeFree':1.5},'TELEMETRY_SOURCE_INVALID'],[{memoryTotalBytes:0},'INVALID_SAMPLE']]){
    await assert.rejects(()=>fakeSource(overrides).collect(target(),probes),{code});
  }
  await assert.rejects(()=>fakeSource().collect(target(),{auth:true}),{code:'INVALID_PROBES'});
});

test('all queries use the same evaluation instant with at most four concurrent requests',async()=>{
  const byQuery=new Map(Object.entries(queryTemplates(target())).map(([key,query])=>[query,key]));
  let active=0,maxActive=0;const seen=[];
  const source=fakeSource({}, {fetcher:async(raw,init,cluster)=>{
    active++;maxActive=Math.max(maxActive,active);const url=new URL(raw);seen.push(url);
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(cluster.id,'prometheus');
    try{await delay(2);return {ok:true,json:async()=>response(values()[byQuery.get(url.searchParams.get('query'))])}}finally{active--}
  }});
  await source.collect(target(),probes);assert.equal(maxActive,4);assert.equal(active,0);assert.equal(seen.length,15);
  for(const url of seen){assert.equal(url.searchParams.get('time'),String(at/1000));assert.equal(url.searchParams.get('timeout'),'3s')}
});

test('internal deadline cannot be disabled by caller signal; cancellation stops further fanout',async()=>{
  const keepAlive=setTimeout(()=>{},2000);
  try{
    for(const inputSignal of [undefined,new AbortController().signal]){
      let calls=0;const source=fakeSource({}, {deadlineMs:20,fetcher:()=>{calls++;return new Promise(()=>{})}});
      await assert.rejects(()=>source.collect(target(),probes,inputSignal),{code:'TELEMETRY_SOURCE_UNAVAILABLE'});assert.equal(calls,4);
    }
    const controller=new AbortController();controller.abort();let calls=0;
    await assert.rejects(()=>fakeSource({}, {fetcher:()=>{calls++;return new Promise(()=>{})}}).collect(target(),probes,controller.signal),{code:'TELEMETRY_SOURCE_UNAVAILABLE'});
    assert.equal(calls,0);
  }finally{clearTimeout(keepAlive)}
});

test('real loopback HTTP transport enforces origin/response bounds, rejects redirects and never leaks raw payloads',async()=>{
  let mode='ok';const queries=queryTemplates(target()),byQuery=new Map(Object.entries(queries).map(([key,query])=>[query,key]));
  const server=createServer((req,res)=>{
    if(mode==='redirect'){res.writeHead(302,{Location:'http://unapproved.invalid'});res.end();return}
    if(mode==='large'){res.end('x'.repeat(129*1024));return}
    const url=new URL(req.url,'http://localhost');assert.equal(url.pathname,'/api/v1/query');
    res.end(JSON.stringify(response(values()[byQuery.get(url.searchParams.get('query'))])));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const source=new PrometheusSource({url:'http://127.0.0.1:'+server.address().port,allowLocal:true,clock:()=>at});
  try{
    assert.equal((await source.collect(target(),probes)).dataDisks.length,2);
    mode='redirect';await assert.rejects(()=>source.collect(target(),probes),{code:'CLUSTER_DESTINATION_DENIED'});
    mode='large';await assert.rejects(()=>source.collect(target(),probes),{code:'CLUSTER_RESPONSE_TOO_LARGE'});
    for(const url of ['invalid','https://metrics.example.invalid/path','https://username:password@metrics.example.invalid','http://unapproved.invalid']){
      assert.throws(()=>new PrometheusSource({url}),{code:'TELEMETRY_SOURCE_INVALID'});
    }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
