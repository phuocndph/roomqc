import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
  process.stdout.write('Owned offline health-worker process test.\nUsage: node scripts/test-health-process.mjs --image sha256:<local image ID>\nBuild the reviewed control Dockerfile first; no image is built or pulled here.\n');
  process.exit(0);
}
if(args.length!==2||args[0]!=='--image'||!/^sha256:[a-f0-9]{64}$/.test(args[1]))throw new Error('Use --help; an immutable local image ID is required');
const image=args[1],run=randomBytes(8).toString('hex'),name='roomqc-health-process-'+run;
const docker=values=>execFileSync('docker',values,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']});
let created=false;
const tracked=['admin.mjs','telemetry.mjs','health-policy.mjs','workers/health-worker.mjs','workers/health-runtime.mjs',
  'workers/health-config.mjs','migrations/0006-telemetry-target-binding.sql'];
// All credentials below are deliberately unusable fixture values. Network none
// prevents the process from reaching any existing RoomQC, CRM or hotel backend.
const boot=`import {mkdir,writeFile} from 'node:fs/promises';
import {healthMain} from './workers/health-runtime.mjs';
const dir='/tmp/roomqc-health-fixture';await mkdir(dir,{recursive:true});
const target={clusterId:'fixture-a',hostId:'fixture-host',environment:'local',measurementScope:'docker-desktop-vm',dbConnectionBudget:100,
dataMounts:[{id:'database',mountpoint:'/fixture/data',device:'/dev/sda1',fstype:'ext4'}]};
const config={schemaVersion:1,instanceId:'health-process-fixture',targets:[{target,prometheus:{url:'http://127.0.0.1:9',approvedAddresses:['127.0.0.1']}}],
connectionBudget:{maxConnections:30,reservedConnections:5,apiInstances:2,apiPoolMax:5,reconcileInstances:1,reconcilePoolMax:2,healthInstances:2,healthPoolMax:2,exporterConnections:1,migrationConnections:1}};
await writeFile(dir+'/health.json',JSON.stringify(config),{mode:0o600});
await writeFile(dir+'/dsn','postgresql://fixture:unusable-fixture@127.0.0.1:1/fixture',{mode:0o600});
await healthMain({NODE_ENV:'development',ROOMQC_HEALTH_ALLOW_LOCAL:'true',ROOMQC_HEALTH_CONFIG_FILE:dir+'/health.json',ROOMQC_HEALTH_DATABASE_URL_FILE:dir+'/dsn'});`;
async function status(){
  for(let i=0;i<40;i++){
    try{
      const code=`const l=await fetch('http://127.0.0.1:8093/livez'),r=await fetch('http://127.0.0.1:8093/readyz');console.log(JSON.stringify({live:l.status,ready:r.status,body:await r.json()}))`;
      return JSON.parse(docker(['exec',name,'node','--input-type=module','-e',code]));
    }catch{await new Promise(resolve=>setTimeout(resolve,100))}
  }
  throw new Error('Owned offline worker did not expose heartbeat');
}
try{
  // Register ownership before creation, so a partially created container is cleaned.
  created=true;
  docker(['run','-d','--name',name,'--label','roomqc.health-process-test='+run,'--network','none','--read-only',
    '--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--memory','256m',
    '--tmpfs','/tmp:rw,nosuid,noexec,size=8m','--entrypoint','node',image,'--input-type=module','-e',boot]);
  const inspected=JSON.parse(docker(['inspect',name]))[0];
  assert.equal(inspected.Image,image);assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(inspected.HostConfig.ReadonlyRootfs,true);
  assert.equal(inspected.Config.User,'1000:1000');assert.deepEqual(inspected.HostConfig.PortBindings,{});
  const hashCode=`import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';const out={};for(const path of ${JSON.stringify(tracked)})out[path]=createHash('sha256').update((await readFile(path,'utf8')).replace(/\\r\\n/g,'\\n')).digest('hex');console.log(JSON.stringify(out))`;
  const hashes=JSON.parse(docker(['exec',name,'node','--input-type=module','-e',hashCode]));
  for(const path of tracked){
    const source=await readFile(new URL('../server/control/'+path,import.meta.url),'utf8');
    assert.equal(hashes[path],createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),path);
  }
  const first=await status();assert.equal(first.live,200);assert.equal(first.ready,503);assert.equal(first.body.ready,false);
  docker(['kill','--signal','SIGTERM',name]);assert.equal(docker(['wait',name]).trim(),'0');
  docker(['start',name]);const restarted=await status();assert.equal(restarted.ready,503);assert.ok(restarted.body.startedAt>=first.body.startedAt);
  docker(['kill','--signal','SIGTERM',name]);assert.equal(docker(['wait',name]).trim(),'0');
  process.stdout.write(JSON.stringify({event:'health_process_test',image,sourceHashes:hashes,network:'none',liveStatus:200,readyStatus:503,
    sigtermExit:0,restartReadyStatus:503,fullServiceProbeProof:false,admissionOpened:false})+'\n');
}finally{
  if(created){
    let info;try{info=JSON.parse(docker(['inspect',name]))[0]}catch{}
    if(info){assert.equal(info.Config.Labels['roomqc.health-process-test'],run);docker(['rm','-f',name])}
  }
}
