import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,realpath,chmod,readFile,writeFile,link,unlink,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runSupport} from './support-cli.mjs';
import {supportClientIntent} from './support-client-intent.mjs';
async function fixture(t){
 const parent=await realpath(tmpdir()),dir=await mkdtemp(join(parent,'roomqc-support-client-'));
 if(process.platform==='win32'){
  const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid);
  execFileSync('icacls',[dir,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
 }else await chmod(dir,0o700);
 t.after(async()=>{const actual=await realpath(dir);assert.equal(dirname(actual),parent);assert.ok(basename(actual).startsWith('roomqc-support-client-'));
  assert.equal((await lstat(dir)).isSymbolicLink(),false);await rm(actual,{recursive:true,force:true})});
 const actorId=randomUUID(),workspaceId=randomUUID(),actionId=randomUUID(),file=join(dir,'intent.json');
 const token='owned.'+Buffer.from(JSON.stringify({sub:actorId})).toString('base64url')+'.signature';
 const env={ROOMQC_CONTROL_URL:'https://control.invalid',ROOMQC_PUBLIC_URL:'https://roomqc.com',ROOMQC_SUPPORT_ACCESS_TOKEN:token};
 const body={query:'owned-hotel',workspaceId,routingVersion:1,reason:'Owned support intent'};
 const args=['reconcile','--query',body.query,'--workspace-id',workspaceId,'--routing-version','1','--reason',body.reason,'--intent-file',file];
 const context={controlOrigin:env.ROOMQC_CONTROL_URL,publicOrigin:env.ROOMQC_PUBLIC_URL,actorId};
 const result={success:true,actionId,commandId:actionId,workspace:{id:workspaceId,status:'active'}};
 return {file,dir,actorId,body,args,env,context,result};
}
test('support CLI persists the exact request before transport loss and a new invocation reuses it for replay/result',async t=>{
 const f=await fixture(t),calls=[];
 await assert.rejects(()=>runSupport(f.args,f.env,async(url,options)=>{calls.push({url,options});throw Error('private '+f.env.ROOMQC_SUPPORT_ACCESS_TOKEN)}),error=>{
  assert.equal(error.message.includes(f.env.ROOMQC_SUPPORT_ACCESS_TOKEN),false);return error.message.includes('intent-file');
 });
 const saved=await readFile(f.file,'utf8');assert.equal(saved.includes(f.env.ROOMQC_SUPPORT_ACCESS_TOKEN),false);
 await runSupport(f.args,f.env,async(url,options)=>{calls.push({url,options});return Response.json(f.result)});
 assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
 assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(await readFile(f.file,'utf8'),saved);
 await runSupport(['result','--intent-file',f.file],f.env,async(url,options)=>{
  assert.ok(url.endsWith('/support/reconcile-result?workspaceId='+f.body.workspaceId));assert.equal(options.method,'GET');
  assert.equal(options.body,undefined);assert.equal(options.headers['Idempotency-Key'],calls[0].options.headers['Idempotency-Key']);return Response.json(f.result);
 });
});
test('support client intent refuses changed actor/origin/body, hardlinks and truncated input without replacing the original',async t=>{
 const f=await fixture(t),intent=await supportClientIntent(f.file,f.context,f.body),before=await readFile(f.file);
 for(const [context,body]of [[{...f.context,actorId:randomUUID()},f.body],[{...f.context,controlOrigin:'https://elsewhere.invalid'},f.body],
  [f.context,{...f.body,reason:'Different support body'}]])await assert.rejects(()=>supportClientIntent(f.file,context,body),{code:'SUPPORT_CLIENT_INTENT_UNAVAILABLE'});
 assert.deepEqual(await readFile(f.file),before);
 const alias=join(f.dir,'alias');await link(f.file,alias);
 await assert.rejects(()=>supportClientIntent(f.file,f.context),{code:'SUPPORT_CLIENT_INTENT_UNAVAILABLE'});await unlink(alias);
 assert.equal((await supportClientIntent(f.file,f.context)).key,intent.key);
 await writeFile(f.file,'{"version":1');
 await assert.rejects(()=>supportClientIntent(f.file,f.context,f.body),{code:'SUPPORT_CLIENT_INTENT_UNAVAILABLE'});
 assert.equal(await readFile(f.file,'utf8'),'{"version":1');
});
test('support CLI cannot treat a mismatching successful payload as the original command result',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>runSupport(f.args,f.env,async()=>Response.json({...f.result,workspace:{id:randomUUID(),status:'active'}})),/chưa được xác nhận/);
});
