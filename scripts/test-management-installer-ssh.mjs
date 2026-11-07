// Disposable SSH acceptance of the product management installer. The daemon
// uses a dedicated tmpfs volume; this does not touch the host Docker data.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,unlink} from 'node:fs/promises';
import {managementInstallMain} from './roomqc-management-install.mjs';

const exec=promisify(execFile), runId=randomBytes(5).toString('hex');
const network=`roomqc-installer-${runId}`, dind=`roomqc-installer-dind-${runId}`, target=`roomqc-installer-target-${runId}`,
 client=`roomqc-installer-client-${runId}`, rootVolume=`roomqc-installer-root-${runId}`,
 dataVolume=`roomqc-installer-docker-${runId}`, socketVolume=`roomqc-installer-socket-${runId}`;
let publicNetwork,targetIp,clientIp,dindIp;
const hostControl='roomqc/control@sha256:748553b1f9069b5720e31a9fffd1f136cdbfd5edf510dcf178708626d0f54cdb';
const hostFrontend='roomqc/web@sha256:c75ab95d4ebf7252c2e42986b29f386f4608d45f77fd4c88003d54286eb2e453';
const hostDirectory='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
let control,frontend,directory;
const backendSource='a5af9aae8ebd7d59005d9ee80a4c21d5a683ba90d9336e7e1ac60ddbb8bcb81c';
const controlId='installer-'+runId, installRoot=`/opt/RoomQC/management/${controlId}`;
const d=async(args,{input,allowFailure=false,timeout=120000}={})=>{
 try{const r=await exec('docker',args,{input,timeout,windowsHide:true,maxBuffer:8*1024*1024});return {...r,code:0};}
 catch(error){if(allowFailure)return {stdout:String(error.stdout??''),stderr:String(error.stderr??''),code:error.code??1};throw error;}
};
const put=async(container,path,content)=>await new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',container,'sh','-c',`umask 077; mkdir -p "$(dirname ${path})"; cat > ${path}`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stderr='';p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(`PUT_FAILED:${stderr.slice(0,200)}`)));p.stdin.end(content);
});
const inspect=async(ref)=>JSON.parse((await d(['inspect',ref])).stdout)[0];
async function createTestNetwork(){
 // Do not assume a fixed private range: developer machines often already have
 // Docker networks using it. Try disposable RFC1918 /24s until Docker accepts
 // one, then keep every address derived from the selected range.
 const seed=parseInt(runId.slice(0,2),16)%200;
 for(let offset=0;offset<200;offset++){
  const third=(seed+offset)%200;
  // The product preflight intentionally requires a public IPv4 host. The
  // disposable Docker network therefore uses an otherwise-unused public test
  // range, while Docker's --internal flag keeps it isolated from the Internet.
  const subnet=`11.251.${third}.0/24`;
  const result=await d(['network','create','--internal','--subnet',subnet,network],{allowFailure:true});
  if(result.code===0){
   publicNetwork=subnet;dindIp=`11.251.${third}.2`;targetIp=`11.251.${third}.3`;clientIp=`11.251.${third}.4`;
   return;
  }
 }
 throw Error('INSTALLER_TEST_NETWORK_RANGE_EXHAUSTED');
}
async function loadOne(ref,tag){
 const save=spawn('docker',['save',ref],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const load=spawn('docker',['exec','-i',dind,'docker','load'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let out='',err='';load.stdout.on('data',b=>out+=b);load.stderr.on('data',b=>err+=b);save.stdout.pipe(load.stdin);
 const [a,b]=await Promise.all([new Promise(res=>save.on('close',res)),new Promise(res=>load.on('close',res))]);
 if(a!==0||b!==0)throw Error('INSTALLER_IMAGE_LOAD_FAILED:'+err.slice(0,200));
 const id=out.match(/sha256:[a-f0-9]{64}/)?.[0];if(!id){if(tag!=='registry:2')throw Error('INSTALLER_IMAGE_ID_MISSING');return;}
 await d(['exec',dind,'docker','tag',id,tag]);
}
async function publish(tag){
 for(let i=0;i<20;i++){const r=await d(['exec',dind,'docker','push',tag],{allowFailure:true,timeout:30000});if(r.code===0)break;if(i===19)throw Error('INSTALLER_REGISTRY_PUSH_FAILED');await new Promise(r=>setTimeout(r,500));}
 return (await d(['exec',dind,'docker','image','inspect',tag,'--format','{{index .RepoDigests 0}}'])).stdout.trim();
}
async function cleanup(){
 if(process.env.ROOMQC_KEEP_INSTALLER_TEST==='1')return;
 for(const name of [client,target,dind])await d(['rm','-f',name],{allowFailure:true}).catch(()=>{});
 await d(['network','rm',network],{allowFailure:true}).catch(()=>{});
 for(const name of [rootVolume,dataVolume,socketVolume])await d(['volume','rm',name],{allowFailure:true}).catch(()=>{});
}
try{
 await createTestNetwork();
 await d(['volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size=12g',dataVolume]);
 await d(['volume','create',rootVolume]);await d(['volume','create',socketVolume]);
 await d(['run','-d','--privileged','--name',dind,'--network',network,'--ip',dindIp,
  '--mount',`type=volume,source=${dataVolume},target=/var/lib/docker`,'--mount',`type=volume,source=${socketVolume},target=/var/run`,
  '--mount',`type=volume,source=${rootVolume},target=/opt/RoomQC`,
  'docker:dind','--storage-driver=vfs','--insecure-registry=127.0.0.1:5000']);
 await d(['network','connect','bridge',dind]);
 for(let i=0;i<60;i++){try{await d(['exec',dind,'docker','info'],{timeout:10000});break}catch{if(i===59)throw Error('DIND_NOT_READY');await new Promise(r=>setTimeout(r,500))}}
 await loadOne(hostControl,'127.0.0.1:5000/roomqc/control:installer');
 await loadOne(hostFrontend,'127.0.0.1:5000/roomqc/web:installer');
 directory=hostDirectory;await d(['exec',dind,'docker','pull',hostDirectory],{timeout:300000});
 await d(['pull','registry:2'],{timeout:300000});await loadOne('registry:2','registry:2');
 await d(['exec','-d',dind,'docker','run','-d','--name','roomqc-test-registry','-p','5000:5000','registry:2']);
 control=await publish('127.0.0.1:5000/roomqc/control:installer');frontend=await publish('127.0.0.1:5000/roomqc/web:installer');
 await d(['run','-d','--name',target,'--network',network,'--ip',targetIp,'--mount',`type=volume,source=${socketVolume},target=/var/run`,'--mount',`type=volume,source=${dataVolume},target=/var/lib/docker`,
  '--mount',`type=volume,source=${rootVolume},target=/opt/RoomQC`,'--entrypoint','sh','roomqc/ssh-drill-target:management-installer-20261031',
  '-c','mkdir -p /run/sshd /root/.ssh; ssh-keygen -A >/dev/null 2>&1; exec /usr/sbin/sshd -D -e']);
 await d(['run','-d','--name',client,'--network',network,'--ip',clientIp,'--entrypoint','sh','roomqc/deployment-executor:management-installer-20261031','-c','sleep 1800']);
 await d(['exec',target,'sh','-c','ssh-keygen -A >/dev/null 2>&1']);
 await d(['exec',client,'sh','-c','mkdir -p /home/node/.ssh; chmod 700 /home/node/.ssh']);
 await d(['exec',client,'ssh-keygen','-q','-t','ed25519','-N','','-f','/home/node/.ssh/key']);
 const pub=(await d(['exec',client,'cat','/home/node/.ssh/key.pub'])).stdout;
 await put(target,'/root/.ssh/authorized_keys',pub);await d(['exec',target,'chmod','600','/root/.ssh/authorized_keys']);
 const hostKey=(await d(['exec',target,'cat','/etc/ssh/ssh_host_ed25519_key.pub'])).stdout.trim();
 await put(client,'/home/node/.ssh/known_hosts',`${targetIp} ${hostKey}\n`);await d(['exec',client,'chmod','600','/home/node/.ssh/known_hosts']);
 const budget=JSON.parse(await readFile(new URL('../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
 budget.environment='staging';for(const c of budget.databases[0].consumers)c.replicas=['control-api','migration','backup'].includes(c.id)?1:0;
 const budgetText=JSON.stringify(budget)+'\n';
 const apiEnv=[
  'ROOMQC_PUBLIC_URL=https://management.roomqc.invalid',
  'ROOMQC_CONTROL_EMAIL_HASH_KEY='+randomBytes(32).toString('hex'),
  'ROOMQC_CONTROL_SUPPORT_CLUSTER_ID=cluster-a',
  'ROOMQC_CONTROL_CLUSTERS='+JSON.stringify([{id:'cluster-a',url:'https://cluster-a.roomqc.invalid',publishableKey:'public-key',serviceKey:'service-key',vapidPublicKey:'vapid-key',maxWorkspaces:10}]),
  'ROOMQC_CONTROL_SIGNUP_ENABLED=false','ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED=false','ROOMQC_CONTROL_POOL_MAX=5','ROOMQC_CONTROL_POOL_BUDGET=100'
 ].join('\n')+'\n';
 const descriptor={version:1,deploymentId:controlId,environment:'staging',listenPort:18082,
  images:{directory,control,frontend},resources:{directory:{memoryBytes:512*1024*1024,cpus:1,sharedBuffersBytes:64*1024*1024,shmBytes:64*1024*1024},control:{memoryBytes:256*1024*1024,cpus:.5},frontend:{memoryBytes:128*1024*1024,cpus:.5}},
  networks:{directory:`${controlId}-directory`,egress:`${controlId}-egress`,web:`${controlId}-web`,metrics:`${controlId}-metrics`},
  volumes:{data:`${controlId}-data`,private:`${controlId}-private`,ca:`${controlId}-ca`},
  files:{budget:`${installRoot}/private/budget.json`,apiEnvironment:`${installRoot}/private/api.env`,apiDsn:`${installRoot}/private/runtime/rq_${controlId.replaceAll('-','_')}_api_1.dsn`,postgresConfig:`${installRoot}/metadata/postgresql.conf`,hbaConfig:`${installRoot}/metadata/pg_hba.conf`,webConfig:`${installRoot}/metadata/nginx.conf`},workers:{}};
 const nginx=await readFile(new URL('../deploy/control/management-nginx.conf',import.meta.url),'utf8');
 const pgconf=await readFile(new URL('../deploy/control/directory/postgresql.conf',import.meta.url),'utf8');
 const hba=await readFile(new URL('../deploy/control/directory/pg_hba.conf',import.meta.url),'utf8');
 const privateDir='/tmp/roomqc/private',metadataDir='/tmp/roomqc/metadata';
 const files=[
  {source:'/tmp/roomqc/budget.json',target:descriptor.files.budget,content:budgetText},
  {source:'/tmp/roomqc/api.env',target:descriptor.files.apiEnvironment,content:apiEnv},
  {source:'/tmp/roomqc/postgresql.conf',target:descriptor.files.postgresConfig,content:pgconf},
  {source:'/tmp/roomqc/pg_hba.conf',target:descriptor.files.hbaConfig,content:hba},
  {source:'/tmp/roomqc/nginx.conf',target:descriptor.files.webConfig,content:nginx}
 ];
 for(const x of [{path:'/tmp/roomqc',mode:'700'},{path:privateDir,mode:'700'},{path:metadataDir,mode:'755'}])await d(['exec',client,'mkdir','-p',x.path]);
 await d(['exec',client,'chmod','700','/tmp/roomqc',privateDir]);await d(['exec',client,'chmod','755',metadataDir]);
 await put(client,'/tmp/roomqc/management.json',JSON.stringify(descriptor)+'\n');await put(client,'/tmp/roomqc/registry.json',JSON.stringify([{id:'cluster-a',url:'https://cluster-a.roomqc.invalid',publishableKey:'public-key',vapidPublicKey:'vapid-key',maxWorkspaces:10,credentialRef:'cluster-a'}]));
 for(const x of files)await put(client,x.source,x.content);
 await d(['exec',client,'chown','-R','1000:1000','/tmp/roomqc']);await d(['exec',client,'chmod','600','/tmp/roomqc/management.json','/tmp/roomqc/registry.json','/tmp/roomqc/budget.json','/tmp/roomqc/api.env']);
 const config={version:1,target:{host:targetIp,user:'root',identityFile:'/home/node/.ssh/key'},bundleFile:'/tmp/roomqc/management.json',files:files.map(({source,target})=>({source,target})),registryFile:'/tmp/roomqc/registry.json',requiredDiskBytes:1024**3,backendSourceSha256:backendSource};
 await put(client,'/tmp/roomqc/config.json',JSON.stringify(config)+'\n');await d(['exec',client,'chmod','600','/tmp/roomqc/config.json']);
 const sshProbe=await d(['exec',client,'ssh','-i','/home/node/.ssh/key','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',`root@${targetIp}`,'printf ROOMQC_SSH_OK'],{allowFailure:true});if(sshProbe.code!==0)throw Error('SSH_PROBE_FAILED:'+sshProbe.stderr);
 const pre=await d(['exec',client,'node','scripts/roomqc-vps-preflight.mjs','--host',targetIp,'--user','root','--identity-file','/home/node/.ssh/key'],{allowFailure:true});if(pre.code!==0)throw Error('PREFLIGHT_PROBE_FAILED:'+pre.stdout+pre.stderr);
 const remoteInfo=await d(['exec',client,'ssh','-i','/home/node/.ssh/key','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',`root@${targetIp}`,`docker info --format '{{.DockerRootDir}}'; df -P -B1 /var/lib/docker; docker image inspect ${control} --format '{{index .Config.Labels "roomqc.control.backend"}}'`],{allowFailure:true});if(remoteInfo.code!==0)throw Error('REMOTE_INFO_FAILED:'+remoteInfo.stdout+remoteInfo.stderr);
 const invoke=async(mode)=>{const r=await d(['exec','-e','ROOMQC_MANAGEMENT_DEBUG=1',client,'node','scripts/roomqc-management-install.mjs','--config-file','/tmp/roomqc/config.json','--mode',mode],{allowFailure:true,timeout:700000});const line=r.stdout.trim().split(/\r?\n/).at(-1);return {code:r.code,receipt:JSON.parse(line),stderr:r.stderr};};
 const plan=await invoke('plan');assert.equal(plan.code,0,JSON.stringify({receipt:plan.receipt,stderr:plan.stderr}));assert.equal(plan.receipt.ok,true);
 const initial=await invoke('initialize');assert.equal(initial.code,0,JSON.stringify({receipt:initial.receipt,stderr:initial.stderr}));assert.equal(initial.receipt.signupOpened,false);
 const resume=await invoke('resume');assert.equal(resume.code,0,JSON.stringify({receipt:resume.receipt,stderr:resume.stderr}));
 const verify=await invoke('verify');assert.equal(verify.code,0,JSON.stringify({receipt:verify.receipt,stderr:verify.stderr}));
 const remote=await d(['exec',dind,'docker','ps','--format','{{.Names}}']);assert.match(remote.stdout,/roomqc-management/);
 console.log(JSON.stringify({ok:true,run:runId,installer:'ssh',initialize:true,resume:true,verify:true,signupOpened:false,managedContainers:remote.stdout.trim().split(/\r?\n/).filter(Boolean).length}));
}catch(error){console.log(JSON.stringify({ok:false,code:error.code??'MANAGEMENT_INSTALLER_SSH_FAILED',message:error.message,run:runId,stack:error.stack?.split('\n').slice(0,12)}));process.exitCode=1}
finally{await cleanup();}
