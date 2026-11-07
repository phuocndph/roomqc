import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inventoryFixture} from '../../server/control/vps-onboarding.mjs';
import {fixtureSupportGateway} from '../../server/control/support-authority-fixtures.mjs';
import {startControl} from '../../server/control/server.mjs';
import {ControlError} from '../../server/control/errors.mjs';

// Opt-in test helper. Only an exact-owned test directory is attached to the
// internal test network. Public-shaped addresses never leave that network;
// production address validation and strict host-key verification stay enabled.
export async function deploymentSshLocalDrill(f,{directoryContainer,cluster}){
  const tag=randomBytes(6).toString('hex'),key='roomqc.deployment-ssh-drill',label=key+'='+tag;
  const network='ssh-drill-'+tag,target='ssh-target-'+tag,client='ssh-client-'+tag;
  const octet=parseInt(tag.slice(0,2),16),subnet=`11.254.${octet}.0/29`,host=`11.254.${octet}.2`,directoryIp=`11.254.${octet}.4`;
  const result={kind:'roomqc-deployment-ssh-local',startedAt:new Date().toISOString(),scope:{actualSsh:true,strictHostKey:true,
    http:true,postgres:true,packagedExecutor:true,realDocker:true,fullRoomQCStack:false,provider:false,vpsChanged:false,signupOpened:false},observations:[]};
  const docker=(args,input,timeout=120000)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout,
    maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe']});
  const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
  const put=(container,path,source)=>docker(['exec','-i',container,'sh','-c','umask 077; cat > "$1"','--',path],source);
  const command=(container,args)=>docker(['exec',container,...args]);
  const directory=inspect(directoryContainer);
  assert.ok(directory.Config.Labels['roomqc.control-directory-test']);
  const pinned=name=>{const image=JSON.parse(docker(['image','inspect',name]))[0];assert.match(image.Id,/^sha256:[a-f0-9]{64}$/);return image.Id};
  const targetImage=pinned('roomqc/ssh-drill-target:local-20261031'),executorImage=pinned('roomqc/deployment-executor:private-config-20261031');
  result.executorImageId=executorImage;
  const webImage=JSON.parse(docker(['image','inspect','nginx:1.27-alpine','--format','{{json .RepoDigests}}']))[0];
  const beforeIds=docker(['ps','-q']).trim().split(/\s+/).filter(Boolean);
  const before=new Map((beforeIds.length?JSON.parse(docker(['inspect',...beforeIds])):[]).map(c=>[c.Id,c.State.StartedAt]));
  let attached=false,runtime;
  try{
    docker(['network','create','--internal','--subnet',subnet,'--label',label,network]);
    assert.equal(JSON.parse(docker(['network','inspect',network]))[0].Internal,true);
    docker(['network','connect','--ip',directoryIp,network,directoryContainer]);attached=true;
    // The test target uses the local daemon, scoped by unique project labels.
    // The executor has no Docker socket; every remote effect uses real SSH.
    docker(['run','-d','--name',target,'--label',label,'--network',network,'--ip',host,
      '--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',targetImage]);
    docker(['run','-d','--name',client,'--label',label,'--network',network,'--user','1000:1000',
      '--env','NODE_ENV=test','--env','ROOMQC_HOST_INVENTORY_ALLOW_LOCAL=true',
      '--env','ROOMQC_DEPLOY_DATABASE_URL_FILE=/tmp/roomqc/directory-url','--entrypoint','sh',executorImage,'-c','sleep 600']);
    command(client,['sh','-c','mkdir -p /tmp/roomqc/specs /home/node/.ssh; chmod 700 /tmp/roomqc /tmp/roomqc/specs /home/node/.ssh']);
    command(client,['ssh-keygen','-q','-t','ed25519','-N','','-f','/tmp/roomqc/test-key']);
    put(target,'/root/.ssh/authorized_keys',command(client,['cat','/tmp/roomqc/test-key.pub']));
    // Pin an independently read host key from the exact-owned target, never TOFU.
    const correctHostKey=command(target,['cat','/etc/ssh/ssh_host_ed25519_key.pub']).trim();
    put(client,'/home/node/.ssh/known_hosts',host+' '+command(client,['cat','/tmp/roomqc/test-key.pub']).trim()+'\n');
    const check=`import {runSsh} from './scripts/roomqc-vps-deploy.mjs';
      try {await runSsh({host:${JSON.stringify(host)},user:'root',identityFile:'/tmp/roomqc/test-key'},'touch /tmp/wrong-host-key-ran');process.exitCode=1}
      catch(e){if(e.code!=='VPS_SSH_FAILED')throw e;console.log('HOST_KEY_MISMATCH_BLOCKED')}`;
    assert.equal(command(client,['node','--input-type=module','-e',check]).trim(),'HOST_KEY_MISMATCH_BLOCKED');
    command(target,['test','!','-e','/tmp/wrong-host-key-ran']);result.observations.push('wrong host key blocked before remote command');
    put(client,'/home/node/.ssh/known_hosts',host+' '+correctHostKey+'\n');
    // Local-only PostgreSQL travels through an authenticated SSH tunnel. No
    // relaxation of the runtime's loopback/TLS URL checks is needed.
    command(client,['ssh','-i','/tmp/roomqc/test-key','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o','ExitOnForwardFailure=yes','-f','-N','-L',`127.0.0.1:5432:${directoryIp}:5432`,'root@'+host]);
    const login='ssh_executor_'+tag,loginPassword=randomBytes(32).toString('hex');
    await f.pool.query('CREATE ROLE '+login+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD '"+loginPassword+"'");
    await f.pool.query('GRANT roomqc_control_deployer TO '+login+' WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');
    const dsn=new URL(f.worker.options.connectionString);dsn.username=login;dsn.password=loginPassword;dsn.hostname='127.0.0.1';dsn.port='5432';
    put(client,'/tmp/roomqc/directory-url',dsn.href+'\n');
    const startup=JSON.parse(command(client,['node','scripts/roomqc-vps-executor.mjs','check']));
    assert.equal(startup.ok,true);assert.equal(startup.readiness.connectionLimit,1);
    result.observations.push('packaged executor startup verifies a bounded LOGIN before accepting work');
    const inventory=inventoryFixture();Object.assign(inventory.inventory[0],{id:cluster.id,hostId:cluster.id,approvedAddresses:[host]});
    const model={services:{web:{image:webImage,labels:{[key]:tag},healthcheck:{test:['CMD-SHELL','wget -q -O /dev/null http://127.0.0.1/'],interval:'1s',timeout:'1s',retries:3}}},
      networks:{default:{labels:{[key]:tag}}}};
    put(client,'/tmp/roomqc/inventory.json',JSON.stringify(inventory));put(client,'/tmp/roomqc/compose.json',JSON.stringify(model));
    const release='ssh-'+tag,args=['prepare','--spec-directory','/tmp/roomqc/specs','--inventory-file','/tmp/roomqc/inventory.json',
      '--cluster-id',cluster.id,'--release-id',release,'--image',webImage,'--compose-file','/tmp/roomqc/compose.json',
      '--mode','execute','--host',host,'--user','root','--identity-file','/tmp/roomqc/test-key'];
    const prepared=JSON.parse(command(client,['node','scripts/roomqc-vps-executor.mjs',...args]));assert.equal(prepared.ok,true);
    Object.assign(f.spec,{id:prepared.spec.id,execution_sha256:prepared.spec.executionSha256});
    const gateway=fixtureSupportGateway({supportActor:async token=>{if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login');return f.actor}});
    runtime=await startControl(f.config,{store:f.store,gateway});
    const base=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`,cmd=f.command();
    const response=await fetch(base+`/clusters/${cluster.id}/commands`,{method:'POST',headers:{Authorization:'Bearer fixture',
      Origin:f.config.publicOrigin,'Content-Type':'application/json','Idempotency-Key':cmd.key},
      body:JSON.stringify({operation:cmd.operation,expectedVersion:cmd.expectedVersion,reason:cmd.reason,payload:cmd.payload})});
    assert.equal(response.status,200);
    const execution=JSON.parse(command(client,['node','scripts/roomqc-vps-executor.mjs','run','--spec-directory','/tmp/roomqc/specs','--once']));
    assert.equal(execution.ok,true);assert.ok(execution.runId);
    const history=await (await fetch(base+'/deployments',{headers:{Authorization:'Bearer fixture'}})).json();
    assert.equal(history.items[0].state,'deployed',JSON.stringify(history));assert.equal(history.items[0].lastGate.mode,'local_test');
    assert.equal((await f.pool.query('SELECT state FROM roomqc_control.deployment_jobs')).rows[0].state,'succeeded');
    const ids=docker(['ps','-q','--filter','label='+label]).trim().split(/\s+/).filter(Boolean),web=ids.map(inspect).find(c=>c.Config.Labels['com.docker.compose.service']==='web');
    assert.ok(web);assert.equal(web.State.Health.Status,'healthy');
    assert.equal(command(target,['readlink',`/opt/RoomQC/clusters/${cluster.id}/current`]).trim(),`/opt/RoomQC/clusters/${cluster.id}/releases/${release}`);
    result.observations.push('HTTP command accepted once','packaged executor completed five phases over real SSH','healthy container and committed release confirmed');
    for(const [id,started]of before){assert.equal(inspect(id).State.StartedAt,started)}
    result.unrelatedContainersUnchanged=true;result.passed=true;
  }catch(error){result.passed=false;result.errorCode=/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'SSH_DRILL_FAILED';throw error}
  finally{
    await runtime?.shutdown();
    for(const id of docker(['ps','-aq','--filter','label='+label]).trim().split(/\s+/).filter(Boolean)){
      assert.equal(inspect(id).Config.Labels[key],tag);docker(['rm','-f',id]);
    }
    if(attached)docker(['network','disconnect',network,directoryContainer]);
    for(const name of docker(['network','ls','--filter','label='+label,'--format','{{.Name}}']).trim().split(/\s+/).filter(Boolean)){
      assert.equal(JSON.parse(docker(['network','inspect',name]))[0].Labels[key],tag);docker(['network','rm',name]);
    }
    result.cleanup={containers:docker(['ps','-aq','--filter','label='+label]).trim()==='',
      networks:docker(['network','ls','--filter','label='+label,'--format','{{.Name}}']).trim()===''};
    result.completedAt=new Date().toISOString();await writeFile(resolve('artifacts/roomqc-deployment-ssh-local-2026-10-31.json'),JSON.stringify(result,null,2)+'\n');
  }
}
