import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {summaryRotationConfiguration,summaryRotationContext,summaryRotationDecision,SummaryCredentialRotator} from './tenant-summary-rotation.mjs';
import {summaryCredentialInstallerObservation,summaryCredentialInstallerFailure} from './tenant-summary-installer.mjs';
import {summaryMaintenanceBinding} from './tenant-summary-maintenance.mjs';

const root=join(tmpdir(),'owned-rotation');
const policy=()=>({version:1,instanceId:'rotator-a',installerConfigFile:join(root,'inputs','issuer.json'),journalDirectory:join(root,'journal'),
 ttlSeconds:300,overlapSeconds:10,rotateBeforeSeconds:120,intervalMs:1000});
const installer=()=>({consumerId:'summary-credential-rotation',publisher:{outputFile:join(root,'runtime','credential.json'),
 signer:{algorithm:'HS256',fingerprint:'5'.repeat(64)}},target:{cluster:{id:'owned-rotation',url:'http://127.0.0.1:54321',
 inventoryRef:'owned-rotation',credentialRef:'owned-rotation',approvedAddresses:[]},expected:{clusterId:'owned-rotation',releaseId:'owned-release',
 artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)}}});
const at=Date.now();
const observation=(remaining=60000)=>{const c=summaryRotationContext(policy(),installer());return {contractVersion:1,version:2,
 clusterId:c.clusterId,bindingSha256:c.bindingSha256,releaseSha256:c.releaseSha256,observedAt:new Date(at).toISOString(),ready:true,
 reasonCode:null,historicalResult:false,credential:{id:randomUUID(),notBefore:new Date(at-60000).toISOString(),
 expiresAt:new Date(at+remaining).toISOString(),revokedAt:null,retireAfter:null}}};
function journal(){return {pending:null,created:[],archived:[],async checkCommand(){return join(root,'check.json')},
 async readPending(){return this.pending},async prepare(context,command){this.created.push(command);return this.pending={context,command,commandFile:join(root,'pending.json')}},
 async archive(p,result){this.archived.push({command:p.command,result});this.pending=null}}}
const checked=o=>({ok:true,operation:'check',capability:'issuer',preflightVerified:true,observation:o});
const published=p=>({ok:true,operation:'issue',commandId:p.command.key,credentialId:randomUUID(),expiresAt:at+300000,filePublished:true,nativeRpcVerified:true});

test('rotation configuration reserves time for installer deadline and keeps journal outside runtime mount',()=>{
 assert.equal(summaryRotationConfiguration(policy()).ttlSeconds,300);
 for(const patch of [{ttlSeconds:119},{ttlSeconds:3601},{overlapSeconds:61},{rotateBeforeSeconds:59},{rotateBeforeSeconds:241},
  {intervalMs:30001},{installerConfigFile:'relative'},{extra:true}])assert.throws(()=>summaryRotationConfiguration({...policy(),...patch}),{code:'SUMMARY_ROTATION_CONFIG_INVALID'});
 assert.throws(()=>summaryRotationConfiguration({...policy(),ttlSeconds:120,rotateBeforeSeconds:60,intervalMs:10000}),{code:'SUMMARY_ROTATION_CONFIG_INVALID'});
 assert.throws(()=>summaryRotationContext({...policy(),journalDirectory:join(root,'runtime','journal')},installer()),{code:'SUMMARY_ROTATION_OUTPUT_ISOLATION'});
 assert.throws(()=>summaryRotationContext(policy(),{...installer(),consumerId:'summary-credential-issuer'}),{code:'SUMMARY_ROTATION_ISSUER_REQUIRED'});
});
test('rotation uses fresh live expiry and never bootstraps, revives revoked or expired heads',()=>{
 assert.equal(summaryRotationDecision(policy(),observation(180000),{now:at}).action,'idle');
 assert.equal(summaryRotationDecision(policy(),observation(120000),{now:at}).action,'rotate');
 for(const reasonCode of ['UNBOUND','CREDENTIAL_MISSING','CREDENTIAL_REVOKED','CREDENTIAL_EXPIRED','CREDENTIAL_RETIRED'])
  assert.deepEqual(summaryRotationDecision(policy(),{...observation(),ready:false,reasonCode},{now:at}),{action:'review',code:'SUMMARY_ROTATION_MANUAL_REQUIRED',reasonCode});
 for(const patch of [{historicalResult:true},{observedAt:'invalid'},
  {reasonCode:'CREDENTIAL_REVOKED'},{version:NaN}])assert.throws(()=>summaryRotationDecision(policy(),{...observation(),...patch},{now:at}),{code:'SUMMARY_ROTATION_OBSERVATION_INVALID'});
});

test('rotation uses DB clock and monotonic elapsed duration despite host clock skew',()=>{
 for(const offset of [-86400000,86400000]){
  const o=observation(125000);o.observedAt=new Date(at+offset).toISOString();
  o.credential.notBefore=new Date(at+offset-60000).toISOString();o.credential.expiresAt=new Date(at+offset+125000).toISOString();
  assert.equal(summaryRotationDecision(policy(),o,{elapsedMs:0}).action,'idle');
  assert.equal(summaryRotationDecision(policy(),o,{elapsedMs:10000}).action,'rotate');
 }
 assert.equal(summaryRotationDecision(policy(),observation(1000),{elapsedMs:1001}).reasonCode,'CREDENTIAL_EXPIRED');
 for(const elapsedMs of [-1,NaN,45001])assert.throws(()=>summaryRotationDecision(policy(),observation(),{elapsedMs}),{code:'SUMMARY_ROTATION_OBSERVATION_INVALID'});
});
test('safe installer observation preserves only exact maintenance metadata and checks binding',()=>{
 const i=installer(),b=summaryMaintenanceBinding(i.target.cluster,i.target.expected),o=observation();
 assert.deepEqual(summaryCredentialInstallerObservation(o,b),o);
 for(const patch of [{token:'private'},{historicalResult:true},{version:NaN},{ready:true,credential:null},{reasonCode:'unknown'}])
  assert.throws(()=>summaryCredentialInstallerObservation({...o,...patch},b),{code:'SUMMARY_INSTALLER_STATUS_INVALID'});
 assert.throws(()=>summaryCredentialInstallerObservation({...o,bindingSha256:'f'.repeat(64)},b),{code:'SUMMARY_INSTALLER_TARGET_CHANGED'});
});
test('two exact known CAS refusals are distinguished from unknown transport outcomes without exposing messages',()=>{
 const command={operation:'issue',key:randomUUID()};
 for(const [message,code]of [['SUMMARY_CREDENTIAL_VERSION_CONFLICT','SUMMARY_INSTALLER_VERSION_CONFLICT'],['SUMMARY_CREDENTIAL_PREDECESSOR_CONFLICT','SUMMARY_INSTALLER_PREDECESSOR_CONFLICT']]){
  assert.equal(summaryCredentialInstallerFailure({code:'P0001',message},command,true).code,code);
  assert.equal(summaryCredentialInstallerFailure({code:'P0001',message:message+' private'},command,true).code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');
  assert.equal(summaryCredentialInstallerFailure({code:'08006',message},command,true).code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');
 }
});
test('lost reply retains durable original command; a new rotator replays before any new check or issue',async()=>{
 const j=journal(),events=[];let calls=0;
 const run=async path=>{calls++;if(path.endsWith('check.json'))return checked(observation());throw Object.assign(new Error('postgresql://private/path'),{code:'SUMMARY_INSTALLER_OUTCOME_UNKNOWN'})};
 const a=new SummaryCredentialRotator({policy:policy(),loadInstaller:async()=>({config:installer()}),runInstaller:run,journal:j,now:()=>at,onEvent:e=>events.push(e)});
 const first=await a.tick();assert.equal(first.sameCommandRequired,true);assert.equal(calls,2);assert.equal(j.created.length,1);assert.equal(j.archived.length,0);
 const original=structuredClone(j.pending.command);let replay=0;
 const b=new SummaryCredentialRotator({policy:policy(),loadInstaller:async()=>({config:installer()}),journal:j,now:()=>at,
  runInstaller:async path=>{assert.ok(path.endsWith('pending.json'));replay++;assert.deepEqual(j.pending.command,original);return published(j.pending)}});
 assert.equal((await b.tick()).action,'rotated');assert.equal(replay,1);assert.equal(j.created.length,1);assert.equal(j.archived.length,1);
 assert.ok(!JSON.stringify(events).includes('postgresql:'));assert.equal(j.archived[0].command.key,original.key);
});
test('CAS loser archives a superseded command without claiming a usable credential',async()=>{
 const j=journal(),r=new SummaryCredentialRotator({policy:policy(),loadInstaller:async()=>({config:installer()}),journal:j,now:()=>at,
  runInstaller:async path=>{if(path.endsWith('check.json'))return checked(observation());throw Object.assign(new Error('safe'),{code:'SUMMARY_INSTALLER_VERSION_CONFLICT'})}});
 const result=await r.tick();assert.equal(result.action,'superseded');assert.equal(r.ready,false);assert.equal(j.archived[0].result.outcome,'superseded');
 assert.equal(j.archived[0].result.credentialId,undefined);
});
test('unready heads and idle heads create no journaled mutation; malformed publication never archives pending',async()=>{
 for(const o of [observation(180000),{...observation(),ready:false,reasonCode:'CREDENTIAL_REVOKED'}]){
  const j=journal(),r=new SummaryCredentialRotator({policy:policy(),loadInstaller:async()=>({config:installer()}),journal:j,now:()=>at,runInstaller:async()=>checked(o)});
  assert.ok(['idle','review'].includes((await r.tick()).action));assert.equal(j.created.length,0);
 }
 const j=journal(),r=new SummaryCredentialRotator({policy:policy(),loadInstaller:async()=>({config:installer()}),journal:j,now:()=>at,
  runInstaller:async path=>path.endsWith('check.json')?checked(observation()):{...published(j.pending),nativeRpcVerified:false}});
 const result=await r.tick();assert.equal(result.action,'review');assert.equal(result.code,'SUMMARY_ROTATION_RESULT_INVALID');assert.ok(j.pending);assert.equal(j.archived.length,0);
});
test('concurrent ticks coalesce and stopping after durable prepare never dispatches the new command',async()=>{
 const j=journal();let release,loaded=0;
 const r=new SummaryCredentialRotator({policy:policy(),journal:j,now:()=>at,loadInstaller:async()=>{loaded++;await new Promise(done=>release=done);return {config:installer()}},
  runInstaller:async()=>checked(observation(180000))});
 const one=r.tick();assert.equal((await r.tick()).action,'busy');release();assert.equal((await one).action,'idle');assert.equal(loaded,1);
 const k=journal();let issues=0;const s=new SummaryCredentialRotator({policy:policy(),journal:k,now:()=>at,loadInstaller:async()=>({config:installer()}),
  runInstaller:async path=>{if(path.endsWith('check.json'))return checked(observation());issues++;return published(k.pending)}});
 const prepare=k.prepare;k.prepare=async(...args)=>{const value=await prepare.apply(k,args);s.stopping=true;return value};
 assert.equal((await s.tick()).action,'stopping');assert.ok(k.pending);assert.equal(issues,0);
});

test('shutdown during loading or pending read prevents a new check and replay dispatch',async()=>{
 for(const barrier of ['load','pending']){
  const j=journal();let release,entered,commands=0;
  const gate=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
  j.pending={context:{},command:{key:randomUUID()},commandFile:join(root,'pending.json')};
  const read=j.readPending;j.readPending=async function(...args){if(barrier==='pending'){entered();await wait}return read.apply(this,args)};
  const r=new SummaryCredentialRotator({policy:policy(),journal:j,loadInstaller:async()=>{if(barrier==='load'){entered();await wait}return {config:installer()}},
   runInstaller:async()=>{commands++;return published(j.pending)}});
  const running=r.tick();await gate;const stopped=r.shutdown();release();await stopped;
  assert.equal((await running).action,'stopping');assert.equal(commands,0);assert.ok(j.pending);assert.equal(r.ready,false);
 }
});

test('shutdown drains an already dispatched request but never reopens readiness or schedules another tick',async()=>{
 const j=journal();let release,entered,calls=0;
 const gate=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 const r=new SummaryCredentialRotator({policy:policy(),journal:j,loadInstaller:async()=>({config:installer()}),
  runInstaller:async p=>{calls++;if(p.endsWith('check.json'))return checked(observation());entered();await wait;return published(j.pending)}});
 const running=r.tick();await gate;let done=false;const stopped=r.shutdown().then(()=>done=true);
 await Promise.resolve();assert.equal(done,false);release();await stopped;
 assert.equal((await running).action,'rotated');assert.equal(r.ready,false);assert.equal(j.archived.length,1);
 assert.equal((await r.tick()).action,'stopping');assert.equal(calls,2);
});
