// Lifecycle commands retain all demo volumes/data. No cleanup command by design.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const repository=fileURLToPath(new URL('../',import.meta.url));
const action=process.argv[2]??'status';assert.ok(['start','stop','restart','status'].includes(action));
const docker=(args)=>new Promise((resolvePromise,reject)=>{
  const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']}),out=[];
  child.stdout.on('data',chunk=>out.push(chunk));child.stderr.on('data',()=>{});
  child.once('error',reject);child.once('close',code=>code===0?resolvePromise(Buffer.concat(out).toString()):reject(new Error('DEMO_DOCKER_COMMAND_FAILED')));
});
let pointer;
try{pointer=JSON.parse(await readFile(join(repository,'.local','roomqc-signup-demo.json'),'utf8'))}
catch{throw new Error('DEMO_NOT_INSTALLED: npm run demo:signup:install')}
const state=JSON.parse(await readFile(pointer.ownership,'utf8'));
assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
assert.equal(state.persistentLocalDemo,true);assert.equal(state.cleaned,false);
assert.equal(state.phase,'persistent_local_demo_ready');assert.equal(pointer.origin,'http://127.0.0.1:59255');
assert.equal(dirname(state.root),resolve(repository,'.local'));
assert.equal(await realpath(state.root),state.root);assert.equal(pointer.ownership,join(state.root,'ownership.json'));
const names=(await docker(['ps','-a','--filter','label=roomqc.control-backend-test='+state.run,'--format','{{.Names}}'])).trim().split(/\r?\n/).filter(Boolean);
assert.ok(names.length>=9);
const inspected=JSON.parse(await docker(['inspect',...names]));
for(const info of inspected){
  assert.equal(info.Config.Labels['roomqc.control-backend-test'],state.run);
  assert.equal(info.Config.Labels['com.docker.compose.project'],state.projectId);
  assert.ok(info.Name.slice(1).startsWith(state.projectId+'-'));
}
const web=state.browserFixture.frontend,service=state.localDemoService;
assert.ok(names.includes(web)&&names.includes(service));
const stop=async()=>{await docker(['stop','--time','10',web,service]);await docker(['stop','--time','10',...names.filter(name=>![web,service].includes(name))])};
if(action==='stop'||action==='restart')await stop();
if(action==='start'||action==='restart'){
  await docker(['compose','--project-name',state.projectId,'--file',join(state.root,'runtime.compose.json'),
    'up','--detach','--wait','--wait-timeout','180','db','auth','rest','realtime','storage','imgproxy','api-gw','staff-invitation-send-test','create-user-invitation-test']);
  await docker(['start',service]);await docker(['start',web]);
  let ready=false;
  for(let i=0;i<60;i++){
    try{ready=(await fetch(pointer.origin+'/api/control/healthz',{signal:AbortSignal.timeout(1500)})).ok}catch{}
    if(ready)break;await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(ready,true,'DEMO_NOT_READY');
}
let reachable=false;
try{reachable=(await fetch(pointer.origin+'/api/control/healthz',{signal:AbortSignal.timeout(2000)})).ok}catch{}
process.stdout.write(JSON.stringify({action,origin:pointer.origin,reachable,containers:names.length,dataRetained:true})+'\n');
