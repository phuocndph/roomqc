// Explicitly owned, offline SSH acceptance of the real backend. The executor
// has no Docker socket; the Linux target uses the local test daemon only.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {deploymentEnvironment} from '../server/control/deployment-environment.mjs';
import {deploymentCompose,shellQuote as q} from '../server/control/vps-deploy.mjs';
import {inventoryFixture} from '../server/control/vps-onboarding.mjs';

const ownerLabel='roomqc.control-backend-test',transportLabel='roomqc.backend-ssh-transport';
const sha=value=>createHash('sha256').update(value).digest('hex');
const literalProbe='fixture-${UNCHANGED} # quote "double" $(touch /tmp/roomqc-unwanted)';
export function backendDeploymentModel({bundle,clusterId,releaseId,assetsRoot,remoteAssets,publishableKey,images}){
  const model=structuredClone(bundle),environments={};delete model.name;
  for(const [name,service]of Object.entries(model.services)){
    delete service.container_name;
    service.image=images[name];
    const values=Object.fromEntries(Object.entries(service.environment??{}).map(([k,v])=>{
      assert.notEqual(v,null,'Fixture environment must be fully resolved');return [k,String(v)];
    }));
    values.ROOMQC_CONTROL_SIGNUP_ENABLED='false';
    if(name==='db')values.ROOMQC_SSH_LITERAL_TEST=literalProbe;
    if(name==='realtime'){
      assert(service.healthcheck.test.some(v=>v.includes(publishableKey)));
      values.ROOMQC_SSH_HEALTH_TOKEN=publishableKey;
      service.healthcheck.test=service.healthcheck.test.map(v=>v.replaceAll(publishableKey,()=> '$$ROOMQC_SSH_HEALTH_TOKEN'));
    }
    delete service.environment;environments[name]=values;
    service.env_file=[deploymentEnvironment(values,clusterId).envFile];
    for(const mount of service.volumes??[])if(mount.type==='bind'){
      const path=relative(assetsRoot,mount.source);
      assert(path&&!isAbsolute(path)&&!path.startsWith('..')&&!/[\r\n\0]/.test(path),'Only exact-owned backend assets');
      mount.source=remoteAssets+'/'+path.replaceAll('\\','/');mount.read_only=true;delete mount.bind;
    }
  }
  for(const values of [model.volumes,model.networks])for(const value of Object.values(values??{}))delete value.name;
  // Use the unchanged product validator. The diagnostic cannot weaken it.
  const image=model.services.db.image;
  const compose=deploymentCompose(model,{clusterId,releaseId,image});
  return {model:compose.model,environments,image,composeSha256:compose.sha256};
}
export function backendContainerArguments(args,state){
  if(!state.sshDeployment)return args;
  const names=new Map(state.sshDeployment.services.map(name=>[state.projectId+'-'+name,state.projectId+'-'+name+'-1']));
  return args.map(value=>names.get(value)??(value.startsWith('container:')&&names.has(value.slice(10))?'container:'+names.get(value.slice(10)):value));
}
async function assetManifest(root){
  const files=[];
  const walk=async(directory)=>{
    for(const entry of await readdir(directory,{withFileTypes:true})){
      assert(!entry.isSymbolicLink(),'No links in the SSH configuration archive');
      const path=join(directory,entry.name);
      if(entry.isDirectory())await walk(path);
      else {assert(entry.isFile());const name=relative(root,path).replaceAll('\\','/');assert(!/[\r\n\0\\]/.test(name));
        files.push({name,sha256:sha(await readFile(path))});}
    }
  };
  await walk(root);assert(files.length>5&&files.length<2048);
  return files.sort((a,b)=>a.name.localeCompare(b.name)).map(f=>f.sha256+'  '+f.name+'\n').join('');
}
export async function prepareBackendSshDeployment({repository,state,bundle,vendor,publishableKey,privateRun,save,emit}){
  assert.equal(state.diagnosticOnly,true);assert.match(state.run,/^[a-f0-9]{12}$/);
  assert.equal(state.projectId,'roomqc-probe-'+state.run);
  const clusterId='probe-'+state.run,releaseId='backend-'+state.run,clusterRoot='/opt/RoomQC/clusters/'+clusterId;
  const network=state.projectId+'_default',target=state.projectId+'-ssh-target',client=state.projectId+'-ssh-client',directory=state.projectId+'-ssh-directory';
  const label=transportLabel+'='+state.run,clientTag='roomqc/deployment-executor:ssh-backend-'+state.run;
  const targetImageRef=process.env.ROOMQC_SSH_TARGET_IMAGE??'roomqc/ssh-drill-target:management-installer-20261031';
  const octet=parseInt(state.run.slice(0,2),16),host=`11.253.${octet}.2`,directoryIp=`11.253.${octet}.3`,subnet=`11.253.${octet}.0/24`;
  const d=async(args,input,timeout=120000)=>privateRun('docker',args,{input,timeout});
  const inspect=async name=>JSON.parse((await d(['inspect',name])).stdout)[0];
  const command=(container,args,input,timeout)=>d(['exec',...(input===undefined?[]:['-i']),container,...args],input,timeout);
  const put=(container,path,input)=>command(container,['sh','-c','umask 077; cat > "$1"','--',path],input);
  const tags=[],baseline=new Map(),managementInstallations=new Map();let installed=false,stopped=false;
  const result={kind:'roomqc-backend-ssh-deployment',actualSsh:true,strictHostKey:true,packagedClient:true,
    localDaemon:true,externalVpsChanged:false,productionSignupOpened:false,services:Object.keys(bundle.services),observations:[]};
  const stop=async()=>{
    if(stopped)return;
    for(const name of [client,target,directory]){
      const exists=(await d(['ps','-aq','--filter','name=^'+name+'$'])).stdout.trim();if(!exists)continue;
      assert.equal((await inspect(name)).Config.Labels[transportLabel],state.run);await d(['rm','-f',name]);
    }
    stopped=true;
  };
  const cleanupAssets=async()=>{
    for(const [root,spec]of managementInstallations){
      const script=`set -eu\nif ! test -e ${q(root)} && ! test -L ${q(root)}; then exit 0; fi
test ! -L ${q(root)}
test "$(readlink -f ${q(root)})" = ${q(root)}
test "$(cat ${q(root+'/.roomqc-install-owner')})" = ${q(spec)}
rm -rf ${q(root)}\ntest ! -e ${q(root)}`;
      await d(['run','--rm','--label',label,'--network','none','-v','/opt/RoomQC/management:/opt/RoomQC/management',
        '--entrypoint','sh',targetImageRef,'-c',script]);
    }
    if(installed){
      const script=`set -eu\ntest "$(readlink -f ${q(clusterRoot)})" = ${q(clusterRoot)}
test "$(cat ${q(clusterRoot+'/.roomqc-ssh-fixture-owner')})" = ${q(state.run)}
rm -rf ${q(clusterRoot)}\ntest ! -e ${q(clusterRoot)}`;
      await d(['run','--rm','--name',state.projectId+'-ssh-cleanup','--label',label,'--network','none',
        '-v','/opt/RoomQC/clusters:/opt/RoomQC/clusters','--entrypoint','sh',targetImageRef,'-c',script]);
      result.assetsRemoved=true;
    }
    for(const {tag,id}of tags){assert.equal(JSON.parse((await d(['image','inspect',tag])).stdout)[0].Id,id);await d(['image','rm',tag]);}
    result.transportRemoved=true;
  };
  try{
    const running=(await d(['ps','-q'])).stdout.trim().split(/\s+/).filter(Boolean);
    result.baselineContainers=[];result.fixtureContainersExcluded=[];
    for(const id of running){
      const info=await inspect(id),entry={id,name:info.Name.replace(/^\//,''),startedAt:info.State.StartedAt};
      // Bundler containers can still be removing themselves after their CLI
      // exits. They belong to this run, not to the unrelated service baseline.
      if(info.Config.Labels?.[ownerLabel]===state.run)result.fixtureContainersExcluded.push(entry);
      else {baseline.set(id,entry);result.baselineContainers.push(entry);}
    }
    state.phase='ssh_executor_build';await save();emit('backend_ssh_executor_build');
    await privateRun('docker',['build','-f','deploy/executor/Dockerfile','-t',clientTag,'.'],{timeout:300000});
    const clientImage=JSON.parse((await d(['image','inspect',clientTag])).stdout)[0].Id;tags.push({tag:clientTag,id:clientImage});
    const targetImage=JSON.parse((await d(['image','inspect',targetImageRef])).stdout)[0].Id;
    result.executorImageId=clientImage;result.targetImageId=targetImage;
    await d(['network','create','--internal','--subnet',subnet,'--label',ownerLabel+'='+state.run,
      '--label','com.docker.compose.project='+state.projectId,'--label','com.docker.compose.network=default',network]);
    await d(['run','-d','--name',target,'--label',label,'--network',network,'--ip',host,
      '--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
      '-v','/opt/RoomQC/clusters:/opt/RoomQC/clusters',
      '-v','/opt/RoomQC/management:/opt/RoomQC/management','-v','/var/lib/docker:/var/lib/docker:ro',targetImage]);
    await command(target,['sh','-c',`set -eu; umask 077; test ! -e ${q(clusterRoot)}; test ! -L ${q(clusterRoot)}; mkdir ${q(clusterRoot)}; printf '%s' ${q(state.run)} > ${q(clusterRoot+'/.roomqc-ssh-fixture-owner')}`]);installed=true;
    await d(['run','-d','--name',client,'--label',label,'--network',network,'--ip',`11.253.${octet}.4`,'--user','1000:1000',
      '--env','NODE_ENV=test','--entrypoint','sh',clientImage,'-c','sleep 1800']);
    assert(!(await inspect(client)).Mounts.some(m=>m.Source==='/var/run/docker.sock'));
    await command(client,['sh','-c','mkdir -p /tmp/roomqc /home/node/.ssh; chmod 700 /tmp/roomqc /home/node/.ssh']);
    await command(client,['ssh-keygen','-q','-t','ed25519','-N','','-f','/tmp/roomqc/key']);
    await put(target,'/root/.ssh/authorized_keys',(await command(client,['cat','/tmp/roomqc/key.pub'])).stdout);
    const hostKey=(await command(target,['cat','/etc/ssh/ssh_host_ed25519_key.pub'])).stdout.trim();
    // Wrong independently supplied key must fail before any remote command.
    await put(client,'/home/node/.ssh/known_hosts',host+' '+(await command(client,['cat','/tmp/roomqc/key.pub'])).stdout.trim()+'\n');
    await assert.rejects(()=>command(client,['ssh','-i','/tmp/roomqc/key','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@'+host,'true']));
    await put(client,'/home/node/.ssh/known_hosts',host+' '+hostKey+'\n');result.observations.push('wrong SSH host key refused');
    const directoryImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
    const queuePassword=randomBytes(32).toString('hex');
    await privateRun('docker',['run','-d','--name',directory,'--label',label,'--network',network,'--ip',directoryIp,
      '--env','POSTGRES_PASSWORD','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m',directoryImage],
      {env:{...process.env,POSTGRES_PASSWORD:queuePassword},timeout:30000});
    let directoryReady=false;
    for(let attempt=0;attempt<60;attempt++){
      try{await command(directory,['pg_isready','-U','postgres']);directoryReady=true;break}catch{await new Promise(resolve=>setTimeout(resolve,250))}
    }
    assert(directoryReady,'Owned queue directory must be ready before preparing the release');
    assert(!Object.values((await inspect(directory)).NetworkSettings.Ports??{}).some(value=>value?.length));
    await command(client,['ssh','-i','/tmp/roomqc/key','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o','ExitOnForwardFailure=yes','-f','-N','-L',`127.0.0.1:5432:${directoryIp}:5432`,'root@'+host]);
    const assetsRoot=join(vendor,'docker','volumes'),remoteAssets=clusterRoot+'/config/assets';
    const manifest=await assetManifest(assetsRoot),archive=join(state.root,'ssh-assets.tar');
    // Windows bsdtar cannot reliably open a Unicode absolute path. The process
    // working directory is Unicode safe; archive arguments remain relative.
    await privateRun('tar',['-cf',relative(assetsRoot,archive),'.'],{cwd:assetsRoot,timeout:120000});
    await d(['cp',archive,client+':/tmp/roomqc/assets.tar']);
    const images={};
    for(const [name,service]of Object.entries(bundle.services)){
      const info=JSON.parse((await d(['image','inspect',service.image])).stdout)[0];
      if(/^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(service.image))images[name]=service.image;
      else {
        const repositoryName='roomqc/ssh-backend-'+name,tag=repositoryName+':owned-'+state.run;
        await d(['image','tag',info.Id,tag]);tags.push({tag,id:info.Id});images[name]=repositoryName+'@'+info.Id;
        assert.equal(JSON.parse((await d(['image','inspect',images[name]])).stdout)[0].Id,info.Id);
      }
    }
    const prepared=backendDeploymentModel({bundle,clusterId,releaseId,assetsRoot,remoteAssets,publishableKey,images});
    const inventory=inventoryFixture();Object.assign(inventory.inventory[0],{id:clusterId,hostId:clusterId,approvedAddresses:[host]});
    const data={clusterId,releaseId,host,inventory,model:prepared.model,environments:prepared.environments,image:prepared.image,literalProbe,
      remoteAssets,manifest,archive:'/tmp/roomqc/assets.tar',queue:{run:state.run,password:queuePassword}};
    await put(client,'/tmp/roomqc/input.json',JSON.stringify(data));
    const program=`import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSsh} from '/app/scripts/roomqc-vps-deploy.mjs';
import {collectVpsPreflight} from '/app/scripts/roomqc-vps-preflight.mjs';
import {shellQuote as q} from '/app/server/control/vps-deploy.mjs';
import {installDeploymentEnvironment,verifyDeploymentEnvironments} from '/app/scripts/lib/deployment-environment-remote.mjs';
${await readFile(join(repository,'scripts/control-backend-ssh-queue.mjs'),'utf8')}
const input=JSON.parse(await readFile('/tmp/roomqc/input.json','utf8'));
const options={clusterId:input.clusterId,releaseId:input.releaseId,image:input.image,mode:'execute',host:input.host,user:'root',identityFile:'/tmp/roomqc/key'};
const remote=(...args)=>runSsh(options,...args);
const preflight=await collectVpsPreflight(options);assert.equal(preflight.deploymentAllowed,true);
const files=[];for(const environment of Object.values(input.environments))files.push(await installDeploymentEnvironment(remote,{clusterId:input.clusterId,environment}));
const dbFile=await installDeploymentEnvironment(remote,{clusterId:input.clusterId,environment:input.environments.db});
assert(files.some(file=>file.path===dbFile.path));
const verify=()=>remote('set -eu\\n'+verifyDeploymentEnvironments([dbFile],input.clusterId));
await verify();
await remote('chmod 640 '+q(dbFile.path));await assert.rejects(verify);await remote('chmod 600 '+q(dbFile.path));
await remote('ln '+q(dbFile.path)+' '+q(dbFile.path+'.link'));await assert.rejects(verify);await remote('rm '+q(dbFile.path+'.link'));
await remote('mv '+q(dbFile.path)+' '+q(dbFile.path+'.saved')+'; ln -s '+q(dbFile.path+'.saved')+' '+q(dbFile.path));
await assert.rejects(verify);await remote('rm '+q(dbFile.path)+'; mv '+q(dbFile.path+'.saved')+' '+q(dbFile.path));
await remote('cp -p '+q(dbFile.path)+' '+q(dbFile.path+'.saved')+'; printf tampered >> '+q(dbFile.path));
await assert.rejects(verify);await remote('mv '+q(dbFile.path+'.saved')+' '+q(dbFile.path));await verify();
await remote('set -eu\\nmkdir '+q(input.remoteAssets)+'\\ntar -xf - -C '+q(input.remoteAssets),await readFile(input.archive));
await remote('set -eu\\ncd '+q(input.remoteAssets)+'\\nsha256sum -c - >/dev/null\\nfind . -type d -exec chmod 755 {} +\\nfind . -type f -exec chmod a-w {} +',input.manifest);
const {compose,plan,receipt:queue}=await executeBackendQueueFixture({input,options});
assert.equal(plan.executeAllowed,true);
const containers=JSON.parse((await remote('docker inspect $(docker ps -q --filter '+q('label=com.docker.compose.project='+plan.project)+')')).stdout);
const db=containers.find(c=>c.Config.Labels['com.docker.compose.service']==='db');
assert(db.Config.Env.includes('ROOMQC_SSH_LITERAL_TEST='+input.literalProbe));
await remote('test ! -e /tmp/roomqc-unwanted');
assert(!compose.source.includes(input.literalProbe));
process.stdout.write(JSON.stringify({status:queue.runState,completedPhases:plan.phases.slice(1),queue,inputComposeSha256:${JSON.stringify(prepared.composeSha256)},composeSha256:compose.sha256,privateConfigurationChecks:7,environmentFiles:compose.environmentFiles.length,services:plan.services.map(s=>s.name),releaseDirectory:plan.paths.releaseDir}));`;
    state.phase='ssh_backend_deployment';await save();emit('backend_ssh_deploy_start',{services:result.services.length});
    const receipt=JSON.parse((await command(client,['node','--input-type=module'],program,420000)).stdout);
    assert.equal(receipt.inputComposeSha256,prepared.composeSha256);assert.equal(receipt.queue.jobState,'succeeded');
    assert.deepEqual([...receipt.services].sort(),Object.keys(bundle.services).sort());
    result.receipt=receipt;result.assetManifestSha256=sha(manifest);
    result.observations.push('private service configuration delivered on SSH stdin','assets transferred over SSH and hashes verified',
      'HTTP queue accepted once and replayed the same receipt','all backend services installed by the packaged product executor over SSH',
      'five directory phase receipts saved and repeat worker found no work');
    state.sshDeployment=result;await save();emit('backend_ssh_deployed',{services:receipt.services.length,phases:receipt.completedPhases});
    return {
      async managementInstall(input,mode){
        assert(['plan','prepare','initialize','resume','verify'].includes(mode));
        assert.equal(input.descriptor.deploymentId,'mi-'+state.run);
        const p='/tmp/roomqc/management-install';
        await command(client,['mkdir','-p',p]);await command(client,['chmod','700',p]);
        const files=[];
        for(const [index,file]of input.files.entries()){
          const source=p+'/input-'+index;await put(client,source,file.content);files.push({source,target:file.path});
        }
        await put(client,p+'/descriptor.json',JSON.stringify(input.descriptor));
        await put(client,p+'/registry.json',input.registryText);
        const config={version:1,target:{host,user:'root',identityFile:'/tmp/roomqc/key'},bundleFile:p+'/descriptor.json',files,
          registryFile:p+'/registry.json',requiredDiskBytes:input.requiredDiskBytes,backendSourceSha256:input.backendSourceSha256};
        await put(client,p+'/config.json',JSON.stringify(config));
        const response=await command(client,['node','scripts/roomqc-management-install.mjs','--config-file',p+'/config.json','--mode',mode],undefined,700000);
        const receipt=JSON.parse(response.stdout.trim().split(/\r?\n/).at(-1));assert.equal(receipt.ok,true);
        if(mode==='plan')managementInstallations.set('/opt/RoomQC/management/'+input.descriptor.deploymentId,receipt.specSha256);
        return receipt;
      },
      // Keep the management installation on this same independently pinned
      // SSH transport. Configuration travels on stdin, never in shell text.
      async docker(args,{input,timeout=120000,allowFailure=false}={}){
        assert(args.every(v=>typeof v==='string'&&!v.includes('\0')));
        // Native test programs passed to node -e contain newlines. Quote each
        // literal argument here; do not relax the product release shell rules.
        const arg=value=>"'"+value.replaceAll("'","'\\''")+"'";
        const marker='ROOMQC_DOCKER_EXIT_'+randomBytes(8).toString('hex')+'_';
        const remoteCommand='docker '+args.map(arg).join(' ')+'\nroomqc_command_status=$?\nprintf \'\\n'+marker+'%s\\n\' "$roomqc_command_status"';
        const source=`import {runSsh} from '/app/scripts/roomqc-vps-deploy.mjs';
let text='';for await(const part of process.stdin)text+=part;const value=JSON.parse(text);
const r=await runSsh(${JSON.stringify({host,user:'root',identityFile:'/tmp/roomqc/key'})},${JSON.stringify(remoteCommand)},value.input===null?undefined:Buffer.from(value.input,'base64'),{timeoutMs:${timeout}});
const marker=${JSON.stringify('\n'+marker)},at=r.stdout.lastIndexOf(marker);if(at<0)throw Error('MANAGEMENT_SSH_RECEIPT_MISSING');
const code=Number(r.stdout.slice(at+marker.length).trim());if(!Number.isInteger(code)||code<0||code>255)throw Error('MANAGEMENT_SSH_RECEIPT_INVALID');
process.stdout.write(JSON.stringify({code,signal:null,timedOut:false,stdout:r.stdout.slice(0,at),stderr:r.stderr??''}));`;
        const path='/tmp/roomqc/management-command.mjs';await put(client,path,source);
        const response=await command(client,['node',path],JSON.stringify({input:input===undefined?null:Buffer.from(input).toString('base64')}),timeout+10000);
        const result=JSON.parse(response.stdout);if(!allowFailure)assert.equal(result.code,0,'MANAGEMENT_SSH_DOCKER_FAILED');return result;
      },
      async compose(args,{timeout=120000}={}){
        assert(args.every(v=>typeof v==='string'&&!/[\r\n\0]/.test(v)));
        const source=`import {runSsh} from '/app/scripts/roomqc-vps-deploy.mjs';
const result=await runSsh(${JSON.stringify({host,user:'root',identityFile:'/tmp/roomqc/key'})},${JSON.stringify('docker compose --project-name '+q(state.projectId)+' -f '+q(receipt.releaseDirectory+'/compose.json')+' '+args.map(q).join(' '))},undefined,{timeoutMs:${timeout}});process.stdout.write(result.stdout);`;
        return command(client,['node','--input-type=module'],source,timeout+10000);
      },
      async stop(){
        try{for(const [id,entry]of baseline)assert.equal((await inspect(id)).State.StartedAt,entry.startedAt,'Unrelated running service changed');
          result.unrelatedContainersUnchanged=true;}finally{await stop();}
      },
      async cleanup(){await cleanupAssets();},
    };
  }catch(error){await stop().catch(()=>{});await cleanupAssets().catch(()=>{});throw error;}
}
