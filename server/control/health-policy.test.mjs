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
function readyRow(){return {status:'active',release_authority_current:true,credential_configured:true,validation_state:'valid',release_id:'release-v3',schema_manifest_hash:'a'.repeat(64),
  host_id:'cluster-a',host_status:'active',
  release_compatible:true,frontend_ready:true,frontend_current:true,manual_closed:false,operator_reopen_required:false,policy_version:1,
  health_valid_until:new Date(base+120000).toISOString(),health_observed_at:new Date(base).toISOString(),metric_status:'healthy',
  telemetry_target_fingerprint:'c'.repeat(64),telemetry_target_version:1,telemetry_inventory_matches:true,
  credential_ref:'cluster-a',probe_credential_ref:'cluster-a',probe_state:'ready',probe_revision:1,probe_binding_hash:'e'.repeat(64),probe_expected_binding_hash:'e'.repeat(64),
  probe_auth_expires_at:new Date(base+3600000).toISOString(),probe_expires_at:new Date(base+86400000).toISOString(),
  release_authority:{authority_state:'active',authority_key_revoked:false,approval_id:'10000000-0000-4000-8000-000000000001',authority_epoch:1,envelope_digest:'f'.repeat(64)},
  evaluator_state:{policyVersion:1,sampleSchemaVersion:2,targetFingerprint:'c'.repeat(64),blockedReasons:[],probeEvidence:{version:2,
    releaseApproval:{approvalId:'10000000-0000-4000-8000-000000000001',epoch:1,envelopeDigest:'f'.repeat(64)},
    bindingHash:'e'.repeat(64),credentialRevision:1,policyVersion:1,targetFingerprint:'c'.repeat(64),targetVersion:1,checkedAt:new Date(base).toISOString()}},backup_completed_at:new Date(base).toISOString(),backup_restore_test_at:new Date(base).toISOString(),
  backup_manifest_hash:'b'.repeat(64),allocated_count:4,tenant_limit:5,source_generation:3}}
function multi(at=0,disks=[{id:'database',freeBytes:100*gib,totalBytes:200*gib,inodeFreePercent:80},
  {id:'storage',freeBytes:60*gib,totalBytes:120*gib,inodeFreePercent:80}],extra={}){
  const first=disks[0];return {...sample(at,{dataDiskFreeBytes:first.freeBytes,dataDiskTotalBytes:first.totalBytes,dataDiskInodeFreePercent:first.inodeFreePercent}),
    schemaVersion:2,targetFingerprint:'c'.repeat(64),measurementScope:'linux-host',requiredMountIds:disks.map(d=>d.id),dataDisks:disks,...extra};
}

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

test('multi-mount samples reject missing, duplicate, contradictory disks, unknown versions and missing target identity',()=>{
  assert.equal(normalizeSample(multi(),base).dataDisks.length,2);
  for(const change of [{requiredMountIds:[]},{requiredMountIds:['database','database']},{requiredMountIds:['database','absent']},
    {dataDisks:[multi().dataDisks[0]]},{dataDisks:[multi().dataDisks[0],multi().dataDisks[0]]},
    {targetFingerprint:''},{measurementScope:'windows-host'},{metrics:sample().metrics,dataDisks:[{...multi().dataDisks[0],freeBytes:99*gib},multi().dataDisks[1]]}]){
    assert.throws(()=>normalizeSample(multi(0,undefined,change),base),{code:'INVALID_DISKS'});
  }
  for(const disk of [{freeBytes:NaN},{totalBytes:0},{freeBytes:1.5},{freeBytes:201*gib},{inodeFreePercent:-1},{inodeFreePercent:101}]){
    const disks=multi().dataDisks;disks[1]={...disks[1],...disk};assert.throws(()=>normalizeSample(multi(0,disks),base),{code:'INVALID_DISKS'});
  }
  for(const schemaVersion of [undefined,1,3])assert.throws(()=>normalizeSample({...multi(),schemaVersion},base),{code:'INVALID_SAMPLE_VERSION'});
});

test('every actual disk and inode is evaluated independently; critical storage cannot be hidden by a healthy database disk',()=>{
  for(const index of [0,1])for(const [change,code] of [[{freeBytes:9*gib,totalBytes:30*gib},'DISK_CRITICAL'],
    [{freeBytes:14*gib,totalBytes:100*gib},'DISK_CRITICAL'],[{inodeFreePercent:9},'INODE_CRITICAL']]){
    const disks=multi().dataDisks;disks[index]={...disks[index],...change};
    const result=evaluateSample(multi(0,disks),{}, {},1,base);
    assert.ok(result.state.blockedReasons.includes(code));assert.deepEqual(Object.keys(result.state.affectedMounts),[disks[index].id]);
  }
  const disks=[{id:'database',freeBytes:21*gib,totalBytes:60*gib,inodeFreePercent:80},
    {id:'storage',freeBytes:100*gib,totalBytes:300*gib,inodeFreePercent:80}];
  let result;
  for(let at=0;at<=300000;at+=30000)result=evaluateSample(multi(at,disks),result?.state,{},1,base+at);
  assert.equal(result.status,'healthy','Do not combine 21 GiB from database with 300 GiB from storage');
  const equal=[{id:'database',freeBytes:15*gib,totalBytes:100*gib,inodeFreePercent:10},multi().dataDisks[1]];
  assert.equal(evaluateSample(multi(0,equal),{}, {},1,base).state.blockedReasons.includes('DISK_CRITICAL'),false);
});

test('target/schema/scope/mount identity changes restart warmup and recovery instead of inheriting old healthy windows',()=>{
  let warm;for(let at=0;at<=300000;at+=30000)warm=evaluateSample(multi(at),warm?.state,{},1,base+at);
  assert.equal(warm.status,'healthy');
  for(const change of [{targetFingerprint:'d'.repeat(64)},{measurementScope:'docker-desktop-vm'},
    {requiredMountIds:['database','objects'],dataDisks:[multi().dataDisks[0],{...multi().dataDisks[1],id:'objects'}]}]){
    const result=evaluateSample(multi(330000,undefined,change),JSON.parse(JSON.stringify(warm.state)),{},1,base+330000);
    assert.ok(result.state.blockedReasons.includes('METRICS_WARMING'));assert.equal(result.state.recoverySince,base+330000);
  }
  const legacy=walk(0,300000);
  assert.ok(evaluateSample(multi(330000),legacy.state,{},1,base+330000).state.warming);
  const disks=multi().dataDisks;disks[1].freeBytes=9*gib;
  const fault=evaluateSample(multi(330000,disks),warm.state,{},1,base+330000);
  let recovered;
  for(let at=360000;at<=930000;at+=30000)recovered=evaluateSample(multi(at),JSON.parse(JSON.stringify(recovered?.state??fault.state)),{},1,base+at);
  assert.ok(recovered.state.blockedReasons.includes('DISK_CRITICAL'));
  assert.equal(evaluateSample(multi(960000),recovered.state,{},1,base+960000).status,'healthy');
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
  const conditions=[['status','draining','CLUSTER_DRAINING'],['status','offline','CLUSTER_OFFLINE'],['host_id',null,'HOST_UNLINKED'],['host_status',null,'HOST_UNLINKED'],['host_status','maintenance','HOST_MAINTENANCE'],['host_status','retired','HOST_RETIRED'],['credential_configured',false,'CREDENTIAL_MISSING'],
    ['telemetry_target_fingerprint',null,'METRICS_TARGET_UNCONFIGURED'],['telemetry_inventory_matches',false,'METRICS_TARGET_CONFIGURATION_CHANGED'],
    ['evaluator_state',{sampleSchemaVersion:2,targetFingerprint:'d'.repeat(64)},'METRICS_TARGET_CHANGED'],
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
