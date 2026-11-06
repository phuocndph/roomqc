// Networkless readiness of a nonroot CLI fixture, not IF14 business acceptance.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url))),image='node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 console.log('Explicit --run: exact-owned networkless public-source volume, UID10001/capabilities0, CLI help and private-file component probes. No DB, credentials or product acceptance.');process.exit(0);
}
assert.deepEqual(args,['--run']);
const run=randomBytes(6).toString('hex'),project='roomqc-nonroot-'+run,label='roomqc.installer-nonroot-topology',volume=project+'-source';
const state={run,project,phase:'source',cleaned:false};let staging,source,result;
const sha=b=>createHash('sha256').update(b).digest('hex');
function docker(arguments_,input){
 const r=spawnSync('docker',arguments_,{input,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:2*1024*1024});
 if(r.status!==0){if(staging)writeFileSync(join(staging,'private-synthetic-failure.log'),String(r.stdout??'')+'\n'+String(r.stderr??''),{mode:0o600});throw Object.assign(new Error('NONROOT_TOPOLOGY_COMMAND_FAILED'),{code:'NONROOT_TOPOLOGY_COMMAND_FAILED'})}return r.stdout.trim();
}
async function cleanup(){
 const owned=[];
 for(const kind of ['container','volume']){
  const names=docker([kind,'ls',...(kind==='container'?['-a']:[]),'--filter','label='+label+'='+run,'--format',kind==='container'?'{{.Names}}':'{{.Name}}']).split(/\r?\n/).filter(Boolean);
  for(const name of names){
   const v=JSON.parse(docker([kind,'inspect',name]))[0],labels=kind==='container'?v.Config.Labels:v.Labels;
   assert.equal(labels[label],run);assert.equal(labels['com.docker.compose.project'],project);assert.ok(name.startsWith(project+'-'));
   owned.push({kind,name});
  }
 }
 for(const v of owned)docker(v.kind==='container'?['rm','-f',v.name]:['volume','rm',v.name]);
 for(const kind of ['container','volume'])assert.equal(docker([kind,'ls',...(kind==='container'?['-a']:[]),'-q','--filter','label='+label+'='+run]),'');
 state.cleaned=true;return {containers:0,volumes:0,networks:0};
}
try{
 source=await captureBackendSourceBinding(root);
 staging=await mkdtemp(join(root,'.local','roomqc-nonroot-'+run+'-'));
 const input=join(staging,'public-source');await mkdir(input,{mode:0o700});
 for(const file of source.files){const path=join(input,...file.path.split('/'));await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(join(root,...file.path.split('/'))),{flag:'wx',mode:0o600})}
 await mkdir(join(input,'node_modules'));await mkdir(join(input,'server','control','node_modules'));
 assertBackendSourceBinding(source,await captureBackendSourceBinding(input));
 docker(['volume','create','--label',label+'='+run,'--label','com.docker.compose.project='+project,volume]);
 const common=['run','--rm','-i','--label',label+'='+run,'--label','com.docker.compose.project='+project,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','128m','--cpus','0.5','--pids-limit','32'];
 const copy=String.raw`import {cp,readdir,chmod,lstat} from 'node:fs/promises';import {dirname} from 'node:path';import assert from 'node:assert/strict';
import {captureBackendSourceBinding} from '/input/scripts/control-backend-source-binding.mjs';
assert.deepEqual(await readdir('/source'),[]);for(const n of await readdir('/input'))await cp('/input/'+n,'/source/'+n,{recursive:true,force:false,errorOnExist:true});
const s=await captureBackendSourceBinding('/source');assert.equal(s.sha256,EXPECTED_SOURCE);
const dirs=new Set(['/source','/source/node_modules','/source/server/control/node_modules']);
for(const f of s.files){const p='/source/'+f.path;assert.equal((await lstat(p)).isSymbolicLink(),false);await chmod(p,0o444);for(let d=dirname(p);d!=='/';d=dirname(d))dirs.add(d)}
for(const d of [...dirs].sort((a,b)=>b.length-a.length))await chmod(d,0o555);
assert.equal((await captureBackendSourceBinding('/source')).sha256,EXPECTED_SOURCE);console.log(JSON.stringify({copied:s.files.length,publicSourceOnly:true}));`.replaceAll('EXPECTED_SOURCE',JSON.stringify(source.sha256));
 state.phase='copy';const copied=JSON.parse(docker([...common,'--name',project+'-copy','--mount','type=bind,src='+input+',dst=/input,readonly','--mount','type=volume,src='+volume+',dst=/source',image,'node','--input-type=module'],copy));
 assert.equal(copied.copied,source.files.length);
 const probe=String.raw`import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,lstat,chmod,symlink,link,unlink,open,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {captureBackendSourceBinding} from '/repository/scripts/control-backend-source-binding.mjs';
import {readSetupBackfillFile} from '/repository/server/control/setup-backfill-files.mjs';
assert.equal(process.getuid(),10001);assert.equal(process.getgid(),10001);
const status=await readFile('/proc/self/status','utf8'),caps=status.match(/^CapEff:\s+([a-f0-9]+)$/m)?.[1];assert.equal(BigInt('0x'+caps),0n);
const mount=(await readFile('/proc/self/mountinfo','utf8')).split('\n').map(l=>l.split(' - ')[0].split(' ')).find(p=>p[4]==='/repository');assert.ok(mount?.[5].split(',').includes('ro'));
assert.equal((await captureBackendSourceBinding('/repository')).sha256,EXPECTED_SOURCE);
const p=spawn(process.execPath,['/repository/scripts/control-setup-credential.mjs','--help'],{cwd:'/repository',env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
let help='';p.stdout.on('data',b=>help+=b);p.stderr.on('data',b=>help+=b);const exit=await new Promise(r=>p.once('close',(code,signal)=>r({code,signal})));assert.deepEqual(exit,{code:0,signal:null});assert.ok(help.includes('--config-file')&&help.includes('--command-file'));
const tests=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','/repository/server/control/private-input-hardlinks.test.mjs'],{cwd:'/repository',env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
let testOutput='';tests.stdout.on('data',b=>testOutput+=b);tests.stderr.on('data',b=>testOutput+=b);
const testExit=await new Promise(r=>tests.once('close',(code,signal)=>r({code,signal})));assert.deepEqual(testExit,{code:0,signal:null});
const privateInputCounts=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(testOutput.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??NaN)]));
assert.deepEqual(privateInputCounts,{tests:3,pass:3,fail:0,skipped:0});
const own=await mkdtemp('/tmp/roomqc-installer-nonroot-');await mkdir(own+'/output',{mode:0o700});
const secret=own+'/private-fixture',canary=own+'/canary';await writeFile(secret,'public-synthetic-input',{flag:'wx',mode:0o600});await writeFile(canary,'outside-output',{flag:'wx',mode:0o600});
assert.equal(await readSetupBackfillFile(secret,100),'public-synthetic-input');
const info=await lstat(secret);assert.equal(info.uid,10001);assert.equal(info.mode&0o777,0o600);assert.equal(info.nlink,1);
await chmod(secret,0o644);await assert.rejects(()=>readSetupBackfillFile(secret,100),{code:'SETUP_BACKFILL_FILE_ACCESS'});await chmod(secret,0o600);
await symlink(secret,own+'/input-symlink');await assert.rejects(()=>readSetupBackfillFile(own+'/input-symlink',100),{code:'SETUP_BACKFILL_FILE_ACCESS'});await unlink(own+'/input-symlink');
await link(secret,own+'/input-hardlink');let hardlinkDenied=false;try{await readSetupBackfillFile(own+'/input-hardlink',100)}catch{hardlinkDenied=true}await unlink(own+'/input-hardlink');
assert.equal(hardlinkDenied,true);
const before=createHash('sha256').update(await readFile(canary)).digest('hex'),stage=own+'/output/.stage',output=own+'/output/credential';
const h=await open(stage,'wx',0o600);await h.writeFile('public-synthetic-output');await h.sync();await h.close();const stageInfo=await lstat(stage);await rename(stage,output);
const d=await open(own+'/output','r');await d.sync();await d.close();const after=await lstat(output);assert.equal(after.ino,stageInfo.ino);assert.equal(after.uid,10001);assert.equal(after.mode&0o777,0o600);
assert.equal(createHash('sha256').update(await readFile(canary)).digest('hex'),before);
let sourceWriteDenied=false;try{await writeFile('/repository/nonroot-must-not-create','x',{flag:'wx'})}catch(e){assert.ok(['EROFS','EACCES'].includes(e.code));sourceWriteDenied=true}assert.equal(sourceWriteDenied,true);
console.log(JSON.stringify({uid:10001,gid:10001,effectiveCapabilitiesZero:true,readOnlySourceMount:true,sourceHashVerified:true,actualCliHelpVerified:true,
 privateOwnedFileVerified:true,actualBadModeDenied:true,actualSymlinkDenied:true,componentHardlinkDenied:hardlinkDenied,privateInputCounts,actualSyncRenameDirectorySync:true,outsideCanaryUnchanged:true,sourceWriteDenied:true,
 businessCliFlowVerified:false,IF14Verified:false,realVolumeFaultsVerified:false}));`.replaceAll('EXPECTED_SOURCE',JSON.stringify(source.sha256));
 state.phase='probe';result=JSON.parse(docker([...common,'--name',project+'-probe','--user','10001:10001',
  '--mount','type=volume,src='+volume+',dst=/repository,readonly',
  '--mount','type=bind,src='+join(root,'node_modules')+',dst=/repository/node_modules,readonly',
  '--mount','type=bind,src='+join(root,'server/control/node_modules')+',dst=/repository/server/control/node_modules,readonly',
  '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=10001,gid=10001',image,'node','--input-type=module'],probe));
 assertBackendSourceBinding(source,await captureBackendSourceBinding(root));
 const cleanupResult=await cleanup(),harnessPath=fileURLToPath(import.meta.url);
 const path='artifacts/roomqc-installer-nonroot-topology-'+run+'-local-2026-10-28.json';
 await writeFile(resolve(root,path),JSON.stringify({version:1,type:'installer_nonroot_topology_local',run,recordedAtUtc:new Date().toISOString(),topologyVerified:true,
  source:{backend:source,sourceUnchanged:true,harnessSha256:sha(await readFile(harnessPath))},image,fixture:result,cleanup:cleanupResult,
  limits:['Networkless public-source fixture; no database, DSN, signing material or operational flags.',
   'Actual CLI --help, POSIX private-file component checks and real fsync/rename only; does not close IF14/IF15 or runtime mount reload.',
   'Exact-owned public-source staging is retained locally; only this labelled Docker fixture is removed.'],
  acceptance:{productAccepted:false,gatesChanged:false,reviewer:null,signoff:null}},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({path,topologyVerified:true,fixture:result,cleanup:cleanupResult}));
}catch(error){
 let cleanupResult=null;try{cleanupResult=await cleanup()}catch{}
 console.error(JSON.stringify({topologyVerified:false,phase:state.phase,code:error.code??'NONROOT_TOPOLOGY_FAILED',cleanup:cleanupResult}));process.exitCode=1;
}
