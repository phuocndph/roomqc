import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {SetupBackfillScanner,setupBackfillGroups} from './setup-backfill.mjs';
import {setupBackfillBatchSigningBytes,verifySetupBackfillBatch,validateSetupBackfillBatchReport} from './setup-backfill-batch.mjs';
import {assertBackfillApplyResources} from './resource-runtime.mjs';
import {resourceBudget} from './resource-budget.mjs';
import {resourceDatabaseConnection} from './resource-database.mjs';
import {setupBackfillApplyArguments} from '../../scripts/control-setup-backfill-apply.mjs';
import {assertSetupBackfillAccess,readSetupBackfillFile,createSetupBackfillOutput} from './setup-backfill-files.mjs';

function fixture(){
  const now=Date.now(),pair=generateKeyPairSync('ed25519'),target={systemIdentifier:'1',databaseOid:'2',databaseName:'owned',readerRole:'reader',writerRole:'writer'};
  const binding={clusterId:'cluster-a',approvalId:randomUUID(),epoch:1,envelopeDigest:'b'.repeat(64),credentialRef:'recovery-a'};
  const item={workspaceId:randomUUID(),clusterId:'cluster-a',routingVersion:1,snapshotSha256:'c'.repeat(64),group:'closed'};
  const expected={systemIdentifier:'1',databaseOid:'2',databaseName:'owned',role:'reader'};
  const scope=new SetupBackfillScanner({connect(){}},{expected,bindings:[binding],gateways:[]}).scopeSha256;
  const source={sha256:'a'.repeat(64),files:[{path:'one'}]},sourceValue={backendSha256:source.sha256,backendFiles:1},budget='d'.repeat(64);
  const report={schemaVersion:1,mode:'dry_run',readOnly:true,directorySchemaVersion:'0017-setup-backfill-apply.sql',scopeSha256:scope,
    observedAt:new Date(now).toISOString(),pageCount:1,items:[{...item,reason:'SETUP_CLOSED_VERIFIED',action:'review'}],
    counts:Object.fromEntries(setupBackfillGroups.map(g=>[g,Number(g===item.group)])),source:sourceValue,resourceBudgetSha256:budget};
  const reportText=JSON.stringify(report);
  const payload={batchId:randomUUID(),environment:'local',notBefore:now-1000,expiresAt:now+60000,reviewerRef:'review-test',changeRef:'change-test',
    source:sourceValue,target,bindings:[binding],reportSha256:createHash('sha256').update(reportText).digest('hex'),scopeSha256:scope,resourceBudgetSha256:budget,items:[item]};
  const signBatch=p=>{const unsigned={version:1,algorithm:'Ed25519',keyId:'test-batch-key',payload:p};
    return {...unsigned,signature:sign(null,setupBackfillBatchSigningBytes(unsigned),pair.privateKey).toString('base64url')}};
  const trust={version:1,keys:[{keyId:'test-batch-key',publicKey:pair.publicKey.export({format:'jwk'}),environment:'local',target}]};
  const config={environment:'local',directory:{expected:{...expected,role:'writer'}},targets:[{identity:binding}],resourceContext:{budgetSha256:budget}};
  return {now,payload,trust,signBatch,report,reportText,config,source,options:{now,schemaVersion:report.directorySchemaVersion}};
}
test('setup backfill batch signature scopes authority to environment, DB, writer, exact rows and validity',()=>{
  const f=fixture(),envelope=f.signBatch(f.payload);assert.deepEqual(verifySetupBackfillBatch(envelope,f.trust,{now:f.now}),f.payload);
  for(const mutate of [e=>e.payload.items[0].group='active_valid',e=>e.payload.target.databaseOid='3',e=>e.payload.environment='staging',
    e=>e.signature='A'.repeat(86),e=>e.payload.reviewerRef='forged-review',e=>e.payload.source.backendSha256='e'.repeat(64)]){
    const changed=structuredClone(envelope);mutate(changed);assert.throws(()=>verifySetupBackfillBatch(changed,f.trust,{now:f.now}),{code:'SETUP_BACKFILL_BATCH_INVALID'});
  }
  assert.throws(()=>verifySetupBackfillBatch(envelope,{version:1,keys:[]},{now:f.now}),{code:'SETUP_BACKFILL_BATCH_INVALID'});
  for(const now of [f.payload.notBefore-1,f.payload.expiresAt])assert.throws(()=>verifySetupBackfillBatch(envelope,f.trust,{now}),{code:'SETUP_BACKFILL_BATCH_INVALID'});
  for(const mutate of [p=>p.items.push(p.items[0]),p=>p.items=Array.from({length:101},()=>({...p.items[0],workspaceId:randomUUID()})),
    p=>p.target.writerRole=p.target.readerRole,p=>p.ownerEmail='private@example.invalid',p=>p.expiresAt=p.notBefore+86400001]){
    const changed=structuredClone(f.payload);mutate(changed);assert.throws(()=>f.signBatch(changed),{code:'SETUP_BACKFILL_BATCH_INVALID'});
  }
});
test('setup backfill batch report denies forged bytes, cross-target, scope, source, budget and selected fingerprint drift',()=>{
  const f=fixture();assert.equal(validateSetupBackfillBatchReport(f.payload,f.reportText,f.config,f.source,f.options),f.payload);
  const invalid=fn=>assert.throws(fn,{code:'SETUP_BACKFILL_BATCH_INVALID'});
  invalid(()=>validateSetupBackfillBatchReport(f.payload,f.reportText+' ',f.config,f.source,f.options));
  for(const mutate of [c=>c.directory.expected.databaseOid='3',c=>c.directory.expected.role='other',c=>c.targets[0].identity.epoch=2,
    c=>c.resourceContext.budgetSha256='e'.repeat(64),c=>c.environment='staging']){
    const c=structuredClone(f.config);mutate(c);invalid(()=>validateSetupBackfillBatchReport(f.payload,f.reportText,c,f.source,f.options));
  }
  for(const mutate of [p=>p.items[0].snapshotSha256='f'.repeat(64),p=>p.items[0].group='conflict',p=>p.items[0].workspaceId=randomUUID(),
    p=>p.target.readerRole='other',p=>p.scopeSha256='f'.repeat(64)]){
    const p=structuredClone(f.payload);mutate(p);invalid(()=>validateSetupBackfillBatchReport(p,f.reportText,f.config,f.source,f.options));
  }
  invalid(()=>validateSetupBackfillBatchReport(f.payload,f.reportText,f.config,{...f.source,sha256:'e'.repeat(64)},f.options));
  invalid(()=>validateSetupBackfillBatchReport(f.payload,f.reportText,f.config,f.source,{...f.options,now:f.now+86400001}));
});
test('setup backfill writer budget is explicit and independent from reader and migration consumers',async()=>{
  const raw=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  const config=()=>({production:false,resourceContext:{budget:resourceBudget(raw),budgetSha256:'a'.repeat(64),environment:'local',production:false,databaseId:raw.databases[0].id}});
  assert.throws(()=>assertBackfillApplyResources({production:false}),{code:'RESOURCE_BUDGET_REQUIRED'});
  raw.databases[0].consumers.push({id:'setup-backfill-reader',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  assert.throws(()=>assertBackfillApplyResources(config()),{code:'RESOURCE_RUNTIME_MISMATCH'});
  raw.databases[0].consumers.push({id:'setup-backfill-writer',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  assertBackfillApplyResources(config());raw.databases[0].consumers.at(-1).replicas=2;
  assert.throws(()=>assertBackfillApplyResources(config()),{code:'RESOURCE_RUNTIME_MISMATCH'});
  const c=resourceDatabaseConnection('postgresql://writer:private@127.0.0.1:5432/owned?sslmode=disable',{expected:{role:'writer',databaseName:'owned'}},'local');
  assert.match(c.options,/default_transaction_read_only=on/); // Shared attestor and reader stay read-only.
});
test('setup backfill apply CLI requires four distinct absolute files and rejects inline secrets or dry-run flags',()=>{
  assert.deepEqual(setupBackfillApplyArguments(['--help']),{help:true});
  const args=['--config',resolve('writer.json'),'--report',resolve('report.json'),'--manifest',resolve('batch.json'),'--output',resolve('result.jsonl')];
  assert.equal(setupBackfillApplyArguments(args).allowLocal,false);
  for(const extra of [['--apply'],['--cursor','abc'],['--dsn','secret'],['--allow-local','--allow-local'],['--output',resolve('other')]])
    assert.throws(()=>setupBackfillApplyArguments([...args,...extra]),{code:'INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS'});
  const alias=[...args];alias[7]=alias[1];assert.throws(()=>setupBackfillApplyArguments(alias),{code:'INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS'});
});
test('setup backfill private files and synced exclusive output enforce real OS access',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'roomqc-backfill-access-'));
  try{
    if(process.platform==='win32'){
      const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
      execFileSync('icacls',[dir,'/inheritance:r','/grant:r',account+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
    }else await chmod(dir,0o700);
    const path=join(dir,'secret');await writeFile(path,'private',{mode:0o600});
    assert.equal(await readSetupBackfillFile(path,20),'private');
    const output=await createSetupBackfillOutput(join(dir,'results.jsonl'));await output.append({type:'begin'});await output.close();
    await assert.rejects(()=>createSetupBackfillOutput(join(dir,'results.jsonl')),{code:'SETUP_BACKFILL_OUTPUT_EXISTS'});
    if(process.platform==='win32'){
      execFileSync('icacls',[path,'/grant','*S-1-1-0:R'],{windowsHide:true,stdio:'ignore'});
    }else await chmod(path,0o644);
    await assert.rejects(()=>assertSetupBackfillAccess(path),{code:'SETUP_BACKFILL_FILE_ACCESS'});
    assert.equal(await readFile(join(dir,'results.jsonl'),'utf8'),'{"type":"begin"}\n');
  }finally{await rm(dir,{recursive:true,force:true})}
});
