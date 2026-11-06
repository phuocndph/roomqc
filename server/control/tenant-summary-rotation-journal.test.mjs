import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath,lstat,readFile,writeFile,readdir,link,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {SummaryRotationJournal} from './tenant-summary-rotation-journal.mjs';
const context={version:1,instanceId:'rotator-a',configurationSha256:'1'.repeat(64),policySha256:'2'.repeat(64),
 clusterId:'owned-rotation',bindingSha256:'3'.repeat(64),releaseSha256:'4'.repeat(64)};
const command=()=>({version:1,operation:'issue',key:randomUUID(),requestId:randomUUID(),reason:'Owned journal rotation',
 expectedVersion:2,clusterId:context.clusterId,bindingSha256:context.bindingSha256,releaseSha256:context.releaseSha256,
 predecessorId:randomUUID(),ttlSeconds:300,overlapSeconds:10,signerAlgorithm:'HS256',signerFingerprint:'5'.repeat(64)});
const result=p=>({version:1,outcome:'published',commandId:p.command.key,credentialId:randomUUID(),expiresAt:Date.now()+300000});
async function fixture(run){
 const parent=await realpath(tmpdir()),root=await mkdtemp(join(parent,'roomqc-rotation-journal-'));
 try{
  if(process.platform==='win32'){
   const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid);
   execFileSync('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
  }
  const create=options=>new SummaryRotationJournal({directory:root,instanceId:'rotator-a',allowWindowsLocal:true,...options});
  await run({root,create});
 }finally{
  const actual=await realpath(root);assert.equal(dirname(actual),parent);assert.ok(basename(actual).startsWith('roomqc-rotation-journal-'));
  assert.equal((await lstat(root)).isSymbolicLink(),false);await rm(root,{recursive:true,force:true});
 }
}
test('durable spool survives a new journal instance and archives the immutable command atomically',async()=>fixture(async({create})=>{
 const j=create(),original=command();assert.equal(await j.readPending(context),null);
 const p=await j.prepare(context,original);assert.deepEqual(p.command,original);
 const resumed=await create().readPending(context);assert.deepEqual(resumed.command,original);
 assert.deepEqual(JSON.parse(await readFile(await j.checkCommand(),'utf8')),{version:1,operation:'check'});
 await j.archive(p,result(p));assert.equal(await create().readPending(context),null);
 assert.deepEqual(JSON.parse(await readFile(join(j.historyRoot,'published',original.key,'command.json'),'utf8')),original);
 await j.archive(p,result(p));assert.equal(await j.readPending(context),null);
}));
test('stop after durable pending publication preserves the original key and caller context for restart',async()=>fixture(async({create})=>{
 const original=command(),j=create({onPhase:async phase=>{if(phase==='pending_synced')throw Error('owned simulated interruption')}});
 await assert.rejects(()=>j.prepare(context,original));
 const pending=await create().readPending(context);assert.deepEqual(pending.command,original);
 await assert.rejects(()=>create().readPending({...context,configurationSha256:'f'.repeat(64)}),{code:'SUMMARY_ROTATION_JOURNAL_INVALID'});
 assert.deepEqual((await create().readPending(context)).command,original);
}));
test('a preparation killed before publication exposes no partial command as pending',async()=>fixture(async({create})=>{
 const j=create({onPhase:async phase=>{if(phase==='command_synced')throw Error('owned simulated interruption')}});
 await assert.rejects(()=>j.prepare(context,command()));assert.equal(await create().readPending(context),null);
 const n=await readdir(j.root);assert.equal(n.filter(v=>v.startsWith('prepare-')).length,1);
 const next=await create().prepare(context,command());assert.ok(next.command.key);
}));
test('command hardlinks and mutated bytes fail closed without deleting the original spool',async()=>fixture(async({create})=>{
 const j=create(),p=await j.prepare(context,command()),alias=join(p.directory,'outside-alias');
 await link(p.commandFile,alias);await assert.rejects(()=>create().readPending(context));await unlink(alias);
 assert.equal((await create().readPending(context)).command.key,p.command.key);
 const original=await readFile(p.commandFile);await writeFile(p.commandFile,JSON.stringify({...p.command,ttlSeconds:3600}));
 await assert.rejects(()=>create().readPending(context),{code:'SUMMARY_ROTATION_JOURNAL_INVALID'});
 await writeFile(p.commandFile,original);assert.deepEqual((await create().readPending(context)).command,p.command);
}));
test('concurrent preparations retain each key and archive only the completed exact command',async()=>fixture(async({create})=>{
 const a=create(),b=create(),ca=command(),cb=command();await Promise.all([a.initialize(),b.initialize()]);
 await Promise.all([a.prepare(context,ca),b.prepare(context,cb)]);
 const pending=(await readdir(a.pendingRoot)).sort();assert.ok(pending.length>=1&&pending.length<=2);
 const first=await a.readPending(context);assert.ok(pending.includes(first.command.key));
 await a.archive(first,{version:1,outcome:'superseded',commandId:first.command.key,code:'SUMMARY_INSTALLER_VERSION_CONFLICT'});
 const remaining=await b.readPending(context);if(pending.length===2)assert.notEqual(remaining.command.key,first.command.key);else assert.equal(remaining,null);
 assert.deepEqual(JSON.parse(await readFile(join(a.historyRoot,'superseded',first.command.key,'command.json'),'utf8')),first.command);
}));
