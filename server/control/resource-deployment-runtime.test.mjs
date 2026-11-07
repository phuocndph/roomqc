import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {loadRuntimeResourceContext,runtimeResourceView} from './resource-runtime.mjs';
import {inspectResourceDeployment,nativeResourceProbe,runtimeMountSource} from './resource-deployment-runtime.mjs';
import {resourceRuntimeMain} from '../../scripts/control-backend-resource-runtime-check.mjs';

const example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const imageId='sha256:'+('a'.repeat(64)),registry='registry.invalid/roomqc/native@sha256:'+('b'.repeat(64));
async function fixture(t,{environment='local'}={}){
  const root=await mkdtemp(join(tmpdir(),'roomqc-runtime-inventory-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const raw={...structuredClone(example),environment};for(const db of raw.databases)for(const c of db.consumers)c.replicas=c.id==='control-api'?2:0;
  const budgetFile=join(root,'budget.json'),production=environment!=='local';
  const env={NODE_ENV:production?'production':'development',ROOMQC_RESOURCE_ENVIRONMENT:environment,ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json',
    ROOMQC_CONTROL_API_INSTANCES:'2'};
  const reference=production?registry:imageId,service={image:reference,working_dir:'/app',command:['node','server.mjs'],scale:2,
    user:'1000:1000',read_only:true,init:true,network_mode:'none',cap_drop:['ALL'],security_opt:['no-new-privileges:true'],environment:env,
    volumes:[{type:'bind',source:budgetFile,target:'/etc/roomqc/resource-budget.json',read_only:true,bind:{create_host_path:false}}]};
  const manifest={schemaVersion:1,environment,budgetFile,budgetSha256:'',projects:[{id:'native-runtime',files:[join(root,'compose.json')],envFiles:[],profiles:[],
    services:[{name:'api',adapter:'control-api',databaseId:'directory-example',image:reference}]}]};
  let view;const rewrite=async()=>{const bytes=JSON.stringify(raw);await writeFile(budgetFile,bytes);manifest.budgetSha256=createHash('sha256').update(bytes).digest('hex');
    const context=loadRuntimeResourceContext({...env,ROOMQC_RESOURCE_BUDGET_FILE:budgetFile},{kind:'directory'});
    return runtimeResourceView({production,resourceContext:context,resourceBudget:context.budget,poolMax:5,poolBudget:20,apiInstances:2},'control-api')};
  view=await rewrite();const image={Id:imageId,RepoDigests:[registry],Config:{Env:['PATH=/usr/local/bin','NODE_ENV=production'],Entrypoint:['docker-entrypoint.sh'],User:'node'}};
  const container=n=>({Id:String(n).repeat(64),Image:imageId,Path:'docker-entrypoint.sh',Args:['node','server.mjs'],
    Config:{Image:reference,Cmd:['node','server.mjs'],Entrypoint:['docker-entrypoint.sh'],WorkingDir:'/app',User:'1000:1000',Tty:false,OpenStdin:false,
      Env:Object.entries({PATH:'/usr/local/bin',...env}).map(([k,v])=>k+'='+v),Labels:{'com.docker.compose.project':'native-runtime',
        'com.docker.compose.service':'api','com.docker.compose.oneoff':'False','com.docker.compose.container-number':String(n)}},
    HostConfig:{Privileged:false,ReadonlyRootfs:true,Init:true,Devices:[],DeviceRequests:[],VolumesFrom:[],CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Tmpfs:{},NetworkMode:'none'},
    Mounts:[{Type:'bind',Source:budgetFile,Destination:'/etc/roomqc/resource-budget.json',RW:false,Propagation:'rprivate'}],
    NetworkSettings:{Networks:{none:{}}},State:{Status:'running',Running:true,Paused:false,Restarting:false,Dead:false,Pid:100+n,StartedAt:'2026-10-28T00:00:00Z'}});
  const containers=[container(1),container(2)],resolved={name:'native-runtime',services:{api:service}};
  const calls={probe:0,inventory:0,image:0},dependencies={resolveProject:async()=>resolved,inventoryProject:async()=>{calls.inventory++;return structuredClone(containers)},
    inspectImage:async()=>{calls.image++;return image},probeContainer:async()=>{calls.probe++;return view}};
  return {root,raw,env,service,manifest,image,containers,resolved,calls,dependencies,rewrite,setView:v=>{view=v},view,run:()=>inspectResourceDeployment(manifest,dependencies)};
}
test('native runtime inventories every replica twice, binds exact image/env/mounts and probes only the cached safe projection',async t=>{
  const f=await fixture(t),report=await f.run();assert.equal(report.nativeRuntimeVerified,true);assert.equal(report.fullyCovered,true);
  assert.equal(report.bindings.length,2);assert.equal(f.calls.inventory,2);assert.equal(f.calls.image,1);assert.equal(f.calls.probe,2);
  for(const key of ['runtimeVerified','databaseIdentityVerified','capacityProven','deploymentReady'])assert.equal(report[key],false);
  assert.doesNotMatch(JSON.stringify(report),/PATH|HostConfig|Env|budgetFile|private|postgresql/);assert.equal(report.acceptance.productAccepted,false);
});
test('public CA runtime binds exact external volume name and read-only flag, retaining inherited TLS guards',async t=>{
  const f=await fixture(t);
  f.service.volumes.push({type:'volume',source:'directory-ca',target:'/run/roomqc-directory-ca',read_only:true});
  f.env.NODE_EXTRA_CA_CERTS='/run/roomqc-directory-ca/ca.crt';
  f.resolved.volumes={'directory-ca':{external:true,name:'owned-public-directory-ca'}};
  for(const c of f.containers){
    c.Config.Env.push('NODE_EXTRA_CA_CERTS='+f.env.NODE_EXTRA_CA_CERTS);
    c.Mounts.push({Type:'volume',Name:'owned-public-directory-ca',Source:'/var/lib/docker/volumes/owned-public-directory-ca/_data',
      Destination:'/run/roomqc-directory-ca',RW:false,Propagation:''});
  }
  assert.equal((await f.run()).nativeRuntimeVerified,true);
  for(const mutate of [c=>c.Mounts.at(-1).Name='private-ca',c=>c.Mounts.at(-1).RW=true,c=>c.Mounts.at(-1).Type='bind']){
    const original=structuredClone(f.containers[0]);mutate(f.containers[0]);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MOUNT_MISMATCH'});f.containers[0]=original;
  }
  f.resolved.volumes['directory-ca'].external=false;await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MOUNT_MISMATCH'});
  f.resolved.volumes['directory-ca'].external=true;
  f.image.Config.Env.push('NODE_TLS_REJECT_UNAUTHORIZED=0');await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH'});
});

test('production requires a registry digest with matching image metadata; local content IDs cannot downgrade it',async t=>{
  const f=await fixture(t,{environment:'production'});assert.equal((await f.run()).nativeRuntimeVerified,true);
  f.image.RepoDigests=[];await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_IMAGE_MISMATCH'});
  f.manifest.projects[0].services[0].image=imageId;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MANIFEST_INVALID'});
});
test('missing or extra replicas fail before any probe, then corrected inventory recovers',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers);
  f.containers.pop();await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_REPLICA_MISMATCH'});assert.equal(f.calls.probe,0);
  f.containers.push(original[1],{...original[0],Id:'3'.repeat(64)});await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_REPLICA_MISMATCH'});assert.equal(f.calls.probe,0);
  f.containers.splice(0,f.containers.length,...original);assert.equal((await f.run()).nativeRuntimeVerified,true);
});
test('orphans, one-offs, wrong project and duplicate/invalid ordinals are rejected',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers);
  for(const [key,value,code]of [['com.docker.compose.service','orphan','RESOURCE_RUNTIME_UNEXPECTED_CONTAINER'],
    ['com.docker.compose.project','another','RESOURCE_RUNTIME_UNEXPECTED_CONTAINER'],['com.docker.compose.oneoff','True','RESOURCE_RUNTIME_UNEXPECTED_CONTAINER'],
    ['com.docker.compose.container-number','1','RESOURCE_RUNTIME_REPLICA_MISMATCH'],['com.docker.compose.container-number','0','RESOURCE_RUNTIME_UNEXPECTED_CONTAINER']]){
    f.containers.splice(0,2,...structuredClone(original));f.containers[1].Config.Labels[key]=value;await assert.rejects(f.run,{code});
  }
});
test('stopped, paused, restarting and dead replicas cannot count as running capacity',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers[0]);
  for(const patch of [{Status:'exited',Running:false},{Paused:true},{Restarting:true},{Dead:true},{Pid:0},{StartedAt:'invalid'}]){
    f.containers[0]=structuredClone(original);Object.assign(f.containers[0].State,patch);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_CONTAINER_UNAVAILABLE'});
  }
});
test('image, process, privilege, user and inherited healthcheck drift are rejected before probing',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers[0]);
  for(const mutate of [c=>c.Image='sha256:'+('c'.repeat(64)),c=>c.Config.Image='mutable:latest']){
    f.containers[0]=structuredClone(original);mutate(f.containers[0]);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_IMAGE_MISMATCH'});
  }
  for(const mutate of [c=>c.Config.Cmd=['node','other.mjs'],c=>c.Args=['node','other.mjs'],c=>c.Config.User='root',c=>c.Config.WorkingDir='/tmp',
    c=>c.Config.Entrypoint=['sh'],c=>c.HostConfig.Privileged=true,c=>c.HostConfig.ReadonlyRootfs=false,c=>c.HostConfig.CapAdd=['SYS_ADMIN'],
    c=>c.Config.Healthcheck={Test:['CMD','node','-e','private']},c=>c.HostConfig.Devices=[{}]]){
    f.containers[0]=structuredClone(original);mutate(f.containers[0]);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_PROCESS_MISMATCH'});
  }
});
test('secret env drift, duplicate keys and loader injection inherited from the image fail without value disclosure',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers[0]);
  for(const entry of ['PRIVATE_SENTINEL=private-secret-value','NODE_ENV=other','NODE_OPTIONS=--import=private-secret-value']){
    f.containers[0]=structuredClone(original);f.containers[0].Config.Env.push(entry);
    await assert.rejects(f.run,e=>e.code==='RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH'&&!e.message.includes('private-secret-value'));
  }
  f.containers[0]=original;f.image.Config.Env.push('NODE_OPTIONS=--import=private-secret-value');await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH'});
});
test('unexpected mounts, writable metadata, namespace sharing and manual network attachments fail',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers[0]);
  for(const mutate of [c=>c.Mounts[0].RW=true,c=>c.Mounts[0].Source+='-other',c=>c.Mounts.push({Type:'bind',Source:f.root,Destination:'/app',RW:false,Propagation:'rprivate'}),
    c=>c.HostConfig.Tmpfs={'/app':''}]){
    f.containers[0]=structuredClone(original);mutate(f.containers[0]);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MOUNT_MISMATCH'});
  }
  f.containers[0]=structuredClone(original);f.containers[0].NetworkSettings.Networks.extra={};await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_NETWORK_MISMATCH'});
  f.containers[0]=original;f.service.network_mode='host';await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_NETWORK_MISMATCH'});
});
test('changing a valid mounted budget and manifest does not make the old process fingerprint current',async t=>{
  const f=await fixture(t);f.raw.databases[0].reservedConnections++;
  const fresh=await f.rewrite();await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH'});
  f.setView(fresh);assert.equal((await f.run()).nativeRuntimeVerified,true);
});
test('container replacement/restart or a newly created replica during the check invalidates the snapshot',async t=>{
  const f=await fixture(t),original=structuredClone(f.containers);
  for(const mutate of [cs=>cs[0].State.StartedAt='2026-10-28T00:01:00Z',cs=>cs[0].Id='c'.repeat(64),cs=>cs.push({...cs[0],Id:'d'.repeat(64)})]){
    let reads=0;f.dependencies.inventoryProject=async()=>{const cs=structuredClone(original);if(++reads===2)mutate(cs);return cs};
    await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_CHANGED_DURING_CHECK'});
  }
});
test('missing image/probe/inventory and invalid snapshots fail closed with bounded safe codes',async t=>{
  const f=await fixture(t);
  for(const [name,code]of [['inspectImage','RESOURCE_RUNTIME_IMAGE_UNAVAILABLE'],['probeContainer','RESOURCE_RUNTIME_PROBE_FAILED'],['inventoryProject','RESOURCE_RUNTIME_INVENTORY_FAILED']]){
    await assert.rejects(()=>inspectResourceDeployment(f.manifest,{...f.dependencies,[name]:async()=>{throw new Error('private-secret-value')}}),e=>e.code===code&&!e.message.includes('private-secret-value'));
  }
  await assert.rejects(()=>inspectResourceDeployment(f.manifest,{}),{code:'RESOURCE_RUNTIME_DEPENDENCY_REQUIRED'});
  await assert.rejects(()=>inspectResourceDeployment(f.manifest,{...f.dependencies,inventoryProject:async()=>Array(257).fill(f.containers[0])}),{code:'RESOURCE_RUNTIME_INVENTORY_FAILED'});
});
test('Windows mount path aliases are limited to explicit Docker Desktop drive translations',()=>{
  assert.equal(runtimeMountSource('C:\\Owned\\budget.json','win32'),runtimeMountSource('/run/desktop/mnt/host/c/Owned/budget.json','win32'));
  assert.notEqual(runtimeMountSource('C:\\Owned\\budget.json','win32'),runtimeMountSource('/unreviewed/c/Owned/budget.json','win32'));
  assert.equal(runtimeMountSource('/etc/roomqc/budget.json','linux'),'/etc/roomqc/budget.json');
});
test('runtime CLI never prints raw inspection or dependency error data and has a non-mutating help path',async t=>{
  const f=await fixture(t),file=join(f.root,'manifest.json');await writeFile(file,JSON.stringify(f.manifest));const lines=[],output={write:v=>lines.push(v)};
  assert.equal(await resourceRuntimeMain(['--manifest',file],{output,dependencies:f.dependencies}),0);assert.equal(JSON.parse(lines[0]).nativeRuntimeVerified,true);
  lines.length=0;f.dependencies.inventoryProject=async()=>{throw new Error('private-secret-value')};
  assert.equal(await resourceRuntimeMain(['--manifest',file],{output,dependencies:f.dependencies}),1);assert.doesNotMatch(lines.join(''),/private-secret-value|Config|Env/);
  lines.length=0;assert.equal(await resourceRuntimeMain(['--help'],{output,dependencies:{}}),0);assert.match(lines[0],/loopback-only/);
});
test('closed native probe strips unrelated payloads and rejects redirect, oversize, malformed and secret-bearing resource objects',async t=>{
  const f=await fixture(t);let mode='ok';
  const server=createServer((_req,res)=>{
    if(mode==='redirect'){res.writeHead(302,{location:'https://must-not-follow.invalid'});res.end();return}
    if(mode==='oversize'){res.end('x'.repeat(17000));return}
    if(mode==='invalid'){res.end('invalid private-secret-value');return}
    const resources=structuredClone(f.view);if(mode==='extra')resources.token='private-secret-value';
    res.end(JSON.stringify({status:'alive',resources,token:'private-secret-value'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function probe(){const child=spawn(process.execPath,['-e',nativeResourceProbe,'control-api',String(server.address().port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
    const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(stderr,'');assert.doesNotMatch(stdout,/private-secret-value/);return {exitCode,data:JSON.parse(stdout)};
  }
  assert.deepEqual((await probe()).data,{resources:f.view});
  for(const value of ['redirect','oversize','invalid','extra']){mode=value;const r=await probe();assert.equal(r.exitCode,1);assert.equal(r.data.code,'RESOURCE_RUNTIME_PROBE_FAILED')}
});
