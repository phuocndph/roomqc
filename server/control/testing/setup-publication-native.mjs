// Owned processes exercise the actual internal publisher and native receipt RPC.
// Release/target preflight is deliberately still a fixture, not installer proof.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,lstat,symlink,link} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {publishSetupCredential} from '../setup-credential-publication.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=25000){
  const end=Date.now()+timeout;while(Date.now()<end){const result=await read();if(result)return result;await sleep(20)}
  throw new Error('PUBLICATION_NATIVE_TIMEOUT_'+label);
}
const childSource=`import pg from '/control/node_modules/pg/lib/index.js';
import {readFile} from 'node:fs/promises';
import {publishSetupCredential} from '/control/setup-credential-publication.mjs';
const config=JSON.parse(await readFile(process.argv[1],'utf8'));
const db=new pg.Client(config.options);db.on('error',()=>{});let code=0;
try{await db.connect();
 const receipt=(await db.query('SELECT roomqc_setup_admin.receipt($1) AS value',[config.key])).rows[0].value;
 const result=await publishSetupCredential({client:db,target:config.target,receipt,signer:config.signer,
  publishableKeyFile:config.publishableKeyFile,outputFile:config.outputFile,
  assertAuthority:async()=>{if(config.deniedAuthority)throw new Error('fixture authority withdrawn')},
  onPhase:async phase=>{if(config.hold===phase){process.stdout.write(JSON.stringify({event:'publication_barrier',phase})+'\\n');await new Promise(()=>{})}}});
 process.stdout.write(JSON.stringify({event:'publication_result',result})+'\\n');
}catch(error){code=1;process.stdout.write(JSON.stringify({event:'publication_denied',code:/^SETUP_PUBLICATION_[A-Z_]+$/.test(error.code??'')?error.code:'SANITIZED'})+'\\n')}
finally{await db.end();process.exitCode=code}`;

export async function runSetupPublicationNativeChecks({input,options,target,receipt,issuer,record}){
  const checks=[],kills=[],barriers=[],children=new Set();let root;
  const check=(label,condition=true)=>{assert.ok(condition,'PUBLICATION_NATIVE_'+label);checks.push({label,passed:true});record('publication-'+label)};
  const child=async config=>{
    const path=join(root,'child-'+config.sequence+'.json');await writeFile(path,JSON.stringify(config),{flag:'wx',mode:0o600});
    const proc=spawn(process.execPath,['--input-type=module','-e',childSource,path],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
    const handle={proc,events:[],terminal:null};children.add(handle);let pending='';
    proc.stdout.on('data',chunk=>{
      pending+=chunk.toString();if(pending.length>16384)proc.kill('SIGKILL');
      const lines=pending.split('\n');pending=lines.pop();
      for(const line of lines)try{handle.events.push(JSON.parse(line))}catch{}
    });
    proc.stderr.on('data',()=>{});
    handle.done=new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',(code,signal)=>{
      handle.terminal={code,signal};children.delete(handle);resolve(handle.terminal);
    })});return handle;
  };
  const completed=async(handle,code)=>{
    await until(()=>handle.terminal,'child-terminal');assert.equal(handle.terminal.code,code);
    if(code===0){const result=handle.events.find(e=>e.event==='publication_result')?.result;
      assert.equal(result?.nativeRpcVerified,true);assert.equal(result.directorySynced,true);assert.equal(result.operationalInstallerVerified,false)}
  };
  try{
    root=await mkdtemp('/tmp/roomqc-publication-'+input.run+'-');assert.equal((await lstat(root)).mode&0o777,0o700);
    const keyFile=join(root,'signer'),publishableKeyFile=join(root,'publishable');
    await writeFile(keyFile,input.jwtSecret,{flag:'wx',mode:0o600});await writeFile(publishableKeyFile,input.publishableKey,{flag:'wx',mode:0o600});
    const signer={algorithm:'HS256',fingerprint:createHash('sha256').update(input.jwtSecret).digest('hex'),keyFile,keyId:null};
    const base={options,target,key:receipt.commandId,signer,publishableKeyFile,hold:null};
    const before=(await issuer.query('SELECT roomqc_setup_admin.status() AS value')).rows[0].value;
    // The first process holds the real DB mutex across file publication. A
    // second process must fail fast, then the same immutable receipt recovers.
    for(const [index,phase]of ['intent_synced','stage_synced','before_rename','after_rename'].entries()){
      const outputFile=join(root,'credential-'+index+'.json');
      const blocked=await child({...base,outputFile,hold:phase,sequence:'hold-'+index});
      await until(()=>blocked.events.some(e=>e.event==='publication_barrier'&&e.phase===phase),'barrier-'+phase);
      barriers.push({phase,observed:true});
      if(index===1){
        const competing=await child({...base,outputFile,sequence:'competing'});await completed(competing,1);
        check('second-process-fails-fast-on-live-maintenance-mutex',competing.events.some(e=>e.code==='SETUP_PUBLICATION_BUSY'));
      }
      blocked.proc.kill('SIGKILL');const terminal=await blocked.done;assert.equal(terminal.signal,'SIGKILL');
      kills.push({phase,signal:terminal.signal,observedBarrier:true});
      if(index===0){
        // Exact intent was synced, but a token write can still be truncated.
        const stage=join(root,'.credential-'+index+'.json.'+receipt.commandId+'.stage');
        await writeFile(stage,'{"version":',{flag:'wx',mode:0o600});
      }
      const resumed=await child({...base,outputFile,sequence:'resume-'+index});await completed(resumed,0);
      const file=JSON.parse(await readFile(outputFile,'utf8'));
      const claims=JSON.parse(Buffer.from(file.token.split('.')[1],'base64url'));
      assert.equal(claims.jti,receipt.credentialId);assert.equal(claims.iat,receipt.iat);assert.equal(claims.exp,receipt.exp);
      assert.equal((await lstat(outputFile)).mode&0o777,0o600);
      check('real-sigkill-'+phase+'-resumes-same-claims-and-native-rpc');
      const replay=await child({...base,outputFile,sequence:'replay-'+index});await completed(replay,0);
      assert.equal(JSON.parse(await readFile(outputFile,'utf8')).token,file.token);
      check('published-'+phase+'-replay-preserves-hs256-file-bytes');
    }
    check('truncated-owned-stage-rebuilt-from-durable-intent');
    const outputFile=join(root,'denied.json'),client=await issuer.connect();
    const publish=extra=>publishSetupCredential({client,target,receipt,signer,publishableKeyFile,outputFile,assertAuthority:async()=>{},...extra});
    try{
      await assert.rejects(()=>publish({receipt:{...receipt,credentialId:'00000000-0000-4000-8000-000000000001',affectedIds:['00000000-0000-4000-8000-000000000001']}}),{code:'SETUP_PUBLICATION_NOT_CURRENT'});
      check('forged-receipt-rejected-by-actual-caller-scoped-db-read');
      const denied=await child({...base,outputFile,deniedAuthority:true,sequence:'authority-denied'});await completed(denied,1);
      await assert.rejects(()=>lstat(outputFile),{code:'ENOENT'});check('authority-denial-keeps-output-absent');
      const foreign=join(root,'foreign');await writeFile(foreign,'preserve-owned-marker',{flag:'wx',mode:0o600});
      await symlink(foreign,outputFile);
      await assert.rejects(()=>publish({}),{code:'SETUP_PUBLICATION_FAILED'});
      assert.equal(await readFile(foreign,'utf8'),'preserve-owned-marker');await rm(outputFile);
      check('symlink-output-denied-without-writing-through-it');
      await link(foreign,outputFile);await assert.rejects(()=>publish({}),{code:'SETUP_PUBLICATION_OUTPUT_INVALID'});
      assert.equal(await readFile(foreign,'utf8'),'preserve-owned-marker');await rm(outputFile);
      check('hardlink-output-denied-without-changing-other-inode-name');
      const intentFile=join(root,'.denied.json.'+receipt.commandId+'.intent');
      await writeFile(intentFile,'unrelated private file');
      await assert.rejects(()=>publish({}),{code:'SETUP_PUBLICATION_INTENT_CONFLICT'});
      assert.equal(await readFile(intentFile,'utf8'),'unrelated private file');check('intent-conflict-not-overwritten');
      const observer=await issuer.connect();
      try{
        const unlocked=(await observer.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0].locked;
        assert.equal(unlocked,true);await observer.query('SELECT pg_advisory_unlock(727012)');
      }finally{observer.release()}
      check('denial-releases-session-maintenance-lock');
    }finally{client.release()}
    const after=(await issuer.query('SELECT roomqc_setup_admin.status() AS value')).rows[0].value;
    assert.deepEqual({...after,observedAt:null},{...before,observedAt:null});
    check('publication-kills-and-replay-never-create-db-credentials-or-extend-expiry');
    check('private-output-intent-and-key-remain-linux-owner-only',(await lstat(keyFile)).mode%512===0o600);
    return {verified:true,checks,kills,barriers,actualPublisherProcesses:true,actualPostgres:true,actualRest:true,
      filePublicationVerified:true,fixtureAuthorityOnly:true,operationalInstallerVerified:false,rotationDaemonVerified:false};
  }finally{
    for(const child of children)child.proc.kill('SIGKILL');await Promise.all([...children].map(child=>child.done.catch(()=>{})));
    // mkdtemp-owned exact root only, never a supplied operator path.
    if(root)await rm(root,{recursive:true,force:true});
  }
}
