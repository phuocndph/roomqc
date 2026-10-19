import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSample,evaluateSample,admissionDecision,policyThresholds} from './health-policy.mjs';

const base=Date.UTC(2026,9,19),gib=1024**3;
function sample(at=0,metrics={},probes={}){
  return {observedAt:new Date(base+at).toISOString(),metrics:{cpuUsedPercent:30,memoryAvailableBytes:8*gib,memoryTotalBytes:16*gib,
    dataDiskFreeBytes:100*gib,dataDiskTotalBytes:200*gib,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100,...metrics},
    probes:{auth:true,rest:true,storage:true,realtime:true,functions:true,...probes}};
}
function evaluate(at,previous={},metrics={},probes={},version=1){return evaluateSample(sample(at,metrics,probes),previous,{},version,base+at)}
function walk(start,end,previous={},metrics={},probes={},version=1){let result;for(let at=start;at<=end;at+=30000){
  result=evaluate(at,previous,metrics,probes,version);previous=JSON.parse(JSON.stringify(result.state));
}return result}
function readyRow(){return {status:'active',credential_configured:true,validation_state:'valid',release_id:'release-v3',schema_manifest_hash:'a'.repeat(64),
  release_compatible:true,frontend_ready:true,frontend_current:true,manual_closed:false,operator_reopen_required:false,policy_version:1,
  health_valid_until:new Date(base+120000).toISOString(),health_observed_at:new Date(base).toISOString(),metric_status:'healthy',
  evaluator_state:{policyVersion:1,blockedReasons:[]},backup_completed_at:new Date(base).toISOString(),backup_restore_test_at:new Date(base).toISOString(),
  backup_manifest_hash:'b'.repeat(64),allocated_count:4,tenant_limit:5,source_generation:3}}

test('telemetry contract rejects invalid units, missing/nonfinite values, incomplete probes and invalid timestamps',()=>{
  for(const metrics of [{cpuUsedPercent:NaN},{cpuUsedPercent:Infinity},{cpuUsedPercent:-1},{cpuUsedPercent:101},
    {memoryAvailableBytes:'100'},{memoryTotalBytes:0},{dataDiskFreeBytes:201*gib},{dbConnectionsUsed:1.5},
    {dbConnectionBudget:0},{memoryAvailableBytes:Number.MAX_SAFE_INTEGER+1},{dataDiskInodeFreePercent:101}]){
    assert.throws(()=>normalizeSample(sample(0,metrics),base),{code:'INVALID_SAMPLE'});
  }
  const missing=sample();delete missing.metrics.memoryAvailableBytes;assert.throws(()=>normalizeSample(missing,base),{code:'INVALID_SAMPLE'});
  const probes=sample();delete probes.probes.storage;assert.throws(()=>normalizeSample(probes,base),{code:'INVALID_PROBES'});
  assert.throws(()=>normalizeSample(sample(0,{}, {other:true}),base),{code:'INVALID_PROBES'});
  for(const value of [undefined,{},null,'invalid',new Date(base+5001).toISOString(),new Date(base-120001).toISOString()]){
    assert.throws(()=>normalizeSample({...sample(),observedAt:value},base),{code:'INVALID_SAMPLE_TIME'});
  }
  assert.equal(normalizeSample(sample(0,{memoryAvailableBytes:0,cpuUsedPercent:1.25}),base).metrics.memoryAvailableBytes,0);
});

test('resource policy validates bounded thresholds and nonoverlapping warning/critical limits',()=>{
  for(const policy of [{unknown:1},{constructor:1},JSON.parse('{"__proto__":1}'),{cpuBlockPercent:95},{diskBlockBytes:10*gib+0.1},{cpuWarnPercent:75,cpuBlockPercent:75},
    {diskWarnBytes:20*gib,diskBlockBytes:20*gib},{memoryWarnPercent:20},{reopenMode:'automatic'}])assert.throws(()=>policyThresholds(policy),{code:'INVALID_POLICY'});
  assert.equal(policyThresholds({cpuBlockPercent:90}).cpuBlockPercent,90);
});

test('healthy telemetry requires five continuous minutes; gaps and policy changes restart warmup',()=>{
  assert.ok(evaluate(0).state.blockedReasons.includes('METRICS_WARMING'));
  const warm=walk(0,300000);assert.equal(warm.status,'healthy');assert.deepEqual(warm.state.blockedReasons,[]);
  const restarted=walk(330000,360000,JSON.parse(JSON.stringify(warm.state)));assert.equal(restarted.status,'healthy');
  assert.ok(evaluate(490001,restarted.state).state.blockedReasons.includes('METRICS_WARMING'));
  assert.ok(evaluate(390000,restarted.state,{}, {},2).state.blockedReasons.includes('METRICS_WARMING'));
  for(const at of [359999,360000])assert.throws(()=>evaluate(at,restarted.state),{code:'SAMPLE_NOT_NEWER'});
});

test('CPU and memory use sustained windows at their boundaries rather than a single spike',()=>{
  let cpu=walk(0,270000,{}, {cpuUsedPercent:85});assert.equal(cpu.state.blockedReasons.includes('CPU_CRITICAL'),false);
  cpu=evaluate(299999,cpu.state,{cpuUsedPercent:85});assert.equal(cpu.state.blockedReasons.includes('CPU_CRITICAL'),false);
  cpu=evaluate(300000,cpu.state,{cpuUsedPercent:85});assert.ok(cpu.state.blockedReasons.includes('CPU_CRITICAL'));
  let spike=walk(0,300000);spike=evaluate(330000,spike.state,{cpuUsedPercent:99});spike=evaluate(360000,spike.state);
  assert.equal(spike.status,'healthy');
  let memory=walk(0,90000,{}, {memoryAvailableBytes:2*gib});
  assert.equal(memory.state.blockedReasons.includes('MEMORY_CRITICAL'),false);
  memory=evaluate(120000,memory.state,{memoryAvailableBytes:2*gib});assert.ok(memory.state.blockedReasons.includes('MEMORY_CRITICAL'));
  const equal=walk(0,300000,{}, {memoryAvailableBytes:3*gib,memoryTotalBytes:20*gib});
  assert.equal(equal.state.blockedReasons.includes('MEMORY_CRITICAL'),false,'Exactly 15% is warning, not critical');
});

test('disk bytes, disk percentage and inode independently block immediately; critical state survives restart until recovery',()=>{
  for(const [metrics,reason] of [[{dataDiskFreeBytes:9*gib,dataDiskTotalBytes:30*gib},'DISK_CRITICAL'],
    [{dataDiskFreeBytes:29*gib},'DISK_CRITICAL'],[{dataDiskInodeFreePercent:9},'INODE_CRITICAL']]){
    assert.ok(evaluate(0,{},metrics).state.blockedReasons.includes(reason));
  }
  const fault=evaluate(0,{}, {dataDiskFreeBytes:9*gib});
  const recovery=walk(30000,600000,JSON.parse(JSON.stringify(fault.state)));
  assert.ok(recovery.state.blockedReasons.includes('DISK_CRITICAL'));
  assert.equal(evaluate(630000,recovery.state).status,'healthy');
  const stillFault=walk(30000,660000,fault.state,{dataDiskFreeBytes:9*gib});assert.ok(stillFault.state.blockedReasons.includes('DISK_CRITICAL'));
});

test('database connection saturation and probe failures require their own sustained intervals',()=>{
  const connections=walk(0,90000,{}, {dbConnectionsUsed:85});
  assert.equal(connections.state.blockedReasons.includes('DB_CONNECTIONS_CRITICAL'),false);
  assert.ok(evaluate(120000,connections.state,{dbConnectionsUsed:85}).state.blockedReasons.includes('DB_CONNECTIONS_CRITICAL'));
  let probes=evaluate(0,{}, {},{auth:false});probes=evaluate(10000,probes.state,{}, {auth:false});
  probes=evaluate(20000,probes.state,{}, {auth:false});assert.equal(probes.state.blockedReasons.includes('BACKEND_UNREACHABLE'),false);
  assert.ok(evaluate(60000,probes.state,{}, {auth:false}).state.blockedReasons.includes('BACKEND_UNREACHABLE'));
  const reset=evaluate(30000,probes.state);assert.equal(reset.state.probeFailures,0);
});

test('admission fails closed for every required gate and opening cannot ignore metrics, backup or capacity',()=>{
  const row=readyRow(),decision=admissionDecision(row,{now:base});assert.equal(decision.decision,'open');assert.equal(decision.healthGeneration,3);
  const conditions=[['status','draining','CLUSTER_DRAINING'],['status','offline','CLUSTER_OFFLINE'],['credential_configured',false,'CREDENTIAL_MISSING'],
    ['release_compatible',false,'RELEASE_UNVERIFIED'],['frontend_current',false,'FRONTEND_NOT_READY'],['manual_closed',true,'MANUAL_CLOSED'],
    ['operator_reopen_required',true,'OPERATOR_REOPEN_REQUIRED'],['health_valid_until',new Date(base).toISOString(),'METRICS_STALE'],
    ['evaluator_state',{policyVersion:2,blockedReasons:[]},'METRICS_POLICY_CHANGED'],['evaluator_state',{},'METRICS_UNVERIFIED'],
    ['evaluator_state',{policyVersion:1,blockedReasons:['DISK_CRITICAL']},'DISK_CRITICAL'],['metric_status','unknown','METRICS_UNAVAILABLE'],
    ['backup_completed_at',new Date(base-86400001).toISOString(),'BACKUP_UNVERIFIED'],['backup_restore_test_at',new Date(base-31*86400000).toISOString(),'BACKUP_UNVERIFIED'],
    ['allocated_count',5,'NO_CAPACITY']];
  for(const [field,value,code] of conditions){const result=admissionDecision({...row,[field]:value},{now:base});assert.notEqual(result.decision,'open');assert.ok(result.reasonCodes.includes(code),code)}
  const opening={...row,manual_closed:true,operator_reopen_required:true};
  assert.equal(admissionDecision(opening,{now:base,ignoreManual:true,ignoreReopen:true}).decision,'open');
  assert.equal(admissionDecision({...opening,allocated_count:5},{now:base,ignoreManual:true,ignoreReopen:true}).decision,'blocked');
  assert.equal(admissionDecision({...row,allocated_count:5},{now:base,ignoreCapacity:true}).decision,'open','An already-reserved slot is not allocated twice');
});
