import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deploymentCompose,buildReleasePlan,executeReleasePlan} from '../server/control/vps-deploy.mjs';
import {inventoryFixture} from '../server/control/vps-onboarding.mjs';
import {releaseRemoteAdapter} from './lib/vps-release-remote.mjs';
import {reconciliationRemoteAdapter} from './lib/vps-reconciliation-remote.mjs';
import {deploymentEnvironment} from '../server/control/deployment-environment.mjs';
import {installDeploymentEnvironment} from './lib/deployment-environment-remote.mjs';

// Explicit opt-in: real Docker in a disposable Linux target. Never contacts SSH,
// a provider, the serving databases or the persistent RoomQC Compose projects.
if(process.argv[2]!=='--run')throw new Error('Use --run for the isolated local Docker drill');
const suffix=randomBytes(6).toString('hex'),label=`roomqc.vps-release-drill=${suffix}`;
const clusterId=`drill-${suffix}`,project=`roomqc-${clusterId}`,runner=`vps-release-runner-${suffix}`,foreign=`vps-release-foreign-${suffix}`;
const result={kind:'roomqc-vps-release-docker-local',startedAt:new Date().toISOString(),observations:[],
  scope:{realDocker:true,linuxShell:true,ssh:false,provider:false,servingDataChanged:false,productionSignup:false}};
const docker=(args,input,timeout=120000)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const record=(name)=>{result.observations.push(name);process.stdout.write(`PASS ${name}\n`)};
const image=JSON.parse(docker(['image','inspect','nginx:1.27-alpine','--format','{{json .RepoDigests}}']))[0];
const cliImage=JSON.parse(docker(['image','inspect','docker:cli','--format','{{json .RepoDigests}}']))[0];
let inputDir;
function plan(releaseId,{broken=false,extra=false,environment=null}={}){
  const service={image,labels:{'roomqc.vps-release-drill':suffix},healthcheck:{test:['CMD-SHELL',broken?'exit 1':'wget -q -O /dev/null http://127.0.0.1/'],
    interval:'1s',timeout:'1s',retries:1,start_period:'1s'},volumes:[{type:'volume',source:'state',target:'/var/lib/roomqc-state'}],
    ...(environment?{env_file:[environment.envFile]}:{})};
  const model={services:{web:service,...(extra?{extra:{...service,healthcheck:{...service.healthcheck,test:['CMD','true']},volumes:[]}}:{})},
    volumes:{state:{labels:{'roomqc.vps-release-drill':suffix}}},networks:{default:{labels:{'roomqc.vps-release-drill':suffix}}}};
  const options={clusterId,releaseId,image},compose=deploymentCompose(model,options);
  const document=inventoryFixture();document.inventory[0].id=clusterId;
  const value=buildReleasePlan({document,options,compose,allowLocal:true});
  return {value,compose};
}
const remoteRun=async(command,input,options)=>({stdout:docker(['exec','-i',runner,'sh','-c',command],input,options?.timeoutMs),stderr:''});
const adapter=compose=>releaseRemoteAdapter(remoteRun,compose);
const ps=()=>docker(['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]).trim().split(/\s+/).filter(Boolean);
const web=()=>ps().map(inspect).find(c=>c.Config.Labels['com.docker.compose.service']==='web');
try{
  docker(['run','-d','--name',runner,'--label',label,'--network','none','--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
    '--entrypoint','sh',cliImage,'-c','sleep 1800']);
  docker(['run','-d','--name',foreign,'--label',label,'--network','none',image]);
  const foreignBefore=inspect(foreign);
  const first=plan('release-one'),success=await executeReleasePlan(first.value,{remote:adapter(first.compose)});
  assert.equal(success.status,'deployed');assert.equal(web().State.Health.Status,'healthy');
  const current=()=>docker(['exec',runner,'readlink',first.value.paths.current]).trim();
  assert.equal(current(),first.value.paths.releaseDir);record('fresh install commits its own healthy release');
  docker(['exec',web().Id,'sh','-c','printf preserved > /var/lib/roomqc-state/sentinel']);
  const oldId=web().Id;
  const second=plan('release-two'),upgrade=await executeReleasePlan(second.value,{remote:adapter(second.compose)});
  assert.equal(upgrade.status,'deployed');assert.notEqual(web().Id,oldId);assert.equal(current(),second.value.paths.releaseDir);
  assert.equal(docker(['exec',web().Id,'cat','/var/lib/roomqc-state/sentinel']),'preserved');record('upgrade preserves named-volume data and switches current atomically');
  const broken=plan('release-broken',{broken:true,extra:true}),rolled=await executeReleasePlan(broken.value,{remote:adapter(broken.compose)});
  assert.equal(rolled.status,'rolled_back');assert.equal(rolled.failedPhase,'start_release');assert.equal(current(),second.value.paths.releaseDir);
  assert.equal(web().Config.Labels['com.roomqc.release'],'release-two');assert.equal(web().State.Health.Status,'healthy');
  assert.equal(ps().length,1);assert.equal(docker(['exec',web().Id,'cat','/var/lib/roomqc-state/sentinel']),'preserved');
  record('unhealthy upgrade restores previous services and removes only newly introduced containers');
  const failedFirstId=`empty-${suffix}`,failedFirst=plan('release-first-fail',{broken:true});
  const emptyOptions={clusterId:failedFirstId,releaseId:'release-first-fail',image};
  const emptyModel=structuredClone(failedFirst.compose.model);const emptyCompose=deploymentCompose(emptyModel,emptyOptions);
  const emptyDoc=inventoryFixture();emptyDoc.inventory[0].id=failedFirstId;
  const emptyPlan=buildReleasePlan({document:emptyDoc,options:emptyOptions,compose:emptyCompose,allowLocal:true});
  emptyPlan.journalRunId=randomUUID();
  const emptyResult=await executeReleasePlan(emptyPlan,{remote:adapter(emptyCompose)});
  assert.equal(emptyResult.status,'rolled_back');assert.equal(docker(['ps','-aq','--filter',`label=com.docker.compose.project=${emptyPlan.project}`]).trim(),'');
  record('failed fresh install removes its own containers without deleting volumes');
  const emptyRecovery=reconciliationRemoteAdapter(remoteRun),emptyProof=await emptyRecovery.observe(emptyPlan);
  assert.equal(emptyProof.outcome,'empty');await emptyRecovery.release(emptyPlan);
  record('reconciliation confirms an empty cluster and fences its delayed original stage');
  await assert.rejects(()=>adapter(emptyCompose).stage(emptyPlan));
  const locked=plan('release-lock'),owner=adapter(locked.compose);locked.value.journalRunId=randomUUID();await owner.stage(locked.value);await owner.validate(locked.value);
  docker(['exec',runner,'mkdir',locked.value.paths.lock+'/operation.lock']);
  await assert.rejects(()=>owner.rollback(locked.value));
  await assert.rejects(()=>reconciliationRemoteAdapter(remoteRun).observe(locked.value));
  assert.equal(web().Config.Labels['com.roomqc.release'],'release-two');
  docker(['exec',runner,'rmdir',locked.value.paths.lock+'/operation.lock']);
  await owner.validate(locked.value);
  record('in-flight or abandoned remote command fences rollback as well as new deployment');
  const lockedBefore=web().Id,competing=plan('release-competing');
  const denied=await executeReleasePlan(competing.value,{remote:adapter(competing.compose)});
  assert.equal(denied.status,'not_started');assert.equal(denied.failedPhase,'stage_release');assert.equal(web().Id,lockedBefore);
  const priorRecovery=reconciliationRemoteAdapter(remoteRun),priorProof=await priorRecovery.observe(locked.value);
  assert.equal(priorProof.outcome,'previous_healthy');assert.equal(priorProof.currentRelease,'release-two');
  await assert.rejects(()=>owner.start(locked.value));await priorRecovery.release(locked.value);
  record('concurrent deployment is rejected before changing any service');
  record('reconciliation preserves the previous healthy release and disables the interrupted executor');
  const partial=plan('release-partial');partial.value.journalRunId=randomUUID();partial.value.phaseIndex=1;
  let stageCalls=0;
  const interrupted=releaseRemoteAdapter(async(...input)=>{
    const result=await remoteRun(...input);if(++stageCalls===1)throw new Error('stage reply lost');return result;
  },partial.compose);
  await assert.rejects(()=>interrupted.stage(partial.value));
  const partialRecovery=reconciliationRemoteAdapter(remoteRun),partialProof=await partialRecovery.observe(partial.value);
  assert.equal(partialProof.outcome,'previous_healthy');assert.equal(partialProof.candidateIncomplete,true);
  await partialRecovery.release(partial.value);
  record('interrupted stage with no candidate manifest can reconcile only the verified previous release');
  const nested=plan('release-nested-path');nested.value.journalRunId=randomUUID();
  const nestedRoot=second.value.paths.root+'/nested/release-two',nestedRecovery=reconciliationRemoteAdapter(remoteRun);
  docker(['exec',runner,'mkdir','-p',nestedRoot]);
  docker(['exec',runner,'ln','-sfn',nestedRoot,second.value.paths.current]);
  await assert.rejects(()=>nestedRecovery.observe(nested.value));
  docker(['exec',runner,'ln','-sfn',second.value.paths.releaseDir,second.value.paths.current]);
  assert.equal((await nestedRecovery.observe(nested.value)).outcome,'previous_healthy');await nestedRecovery.release(nested.value);
  record('nested current paths are rejected before reading an unintended release');
  const duplicate=await executeReleasePlan(second.value,{remote:adapter(second.compose)});
  assert.equal(duplicate.status,'not_started');assert.equal(current(),second.value.paths.releaseDir);assert.equal(web().Id,lockedBefore);
  record('existing release ID cannot overwrite a committed Compose file');
  const lost=plan('release-reply-lost'),transport=adapter(lost.compose),commit=transport.commit;
  lost.value.journalRunId=randomUUID();
  transport.commit=async p=>{await commit(p);throw new Error('simulated lost transport response')};
  const unknown=await executeReleasePlan(lost.value,{remote:transport});
  assert.equal(unknown.status,'outcome_unknown');assert.equal(current(),lost.value.paths.releaseDir);
  assert.equal(web().Config.Labels['com.roomqc.release'],'release-reply-lost');
  assert.equal(docker(['exec',runner,'test','-d',lost.value.paths.lock]),'');
  const blocked=plan('release-after-unknown');assert.equal((await executeReleasePlan(blocked.value,{remote:adapter(blocked.compose)})).status,'not_started');
  record('lost commit reply retains the active release and fences later deployment');
  const recovery=reconciliationRemoteAdapter(remoteRun),proof=await recovery.observe(lost.value);
  assert.equal(proof.outcome,'candidate_healthy');assert.equal(proof.currentRelease,'release-reply-lost');
  for(const operation of ['start','commit','rollback','release'])await assert.rejects(()=>transport[operation](lost.value));
  record('reconciliation proves the committed release and fences all stale executor mutations');
  await recovery.release(lost.value);await recovery.release(lost.value);
  const recovered=plan('release-after-recovery');assert.equal((await executeReleasePlan(recovered.value,{remote:adapter(recovered.compose)})).status,'deployed');
  await assert.rejects(()=>adapter(lost.compose).stage(lost.value));
  assert.equal(current(),recovered.value.paths.releaseDir);
  record('cleanup is retryable, a new release can deploy and the closed run cannot restart');
  const literal='fixture-${RAW} # "quote" $(touch /tmp/roomqc-unwanted)';
  const firstEnvironment=deploymentEnvironment({SAMPLE:literal,ROOMQC_CONTROL_SIGNUP_ENABLED:'false'},clusterId);
  const secondEnvironment=deploymentEnvironment({SAMPLE:'fixture-second-value',ROOMQC_CONTROL_SIGNUP_ENABLED:'false'},clusterId);
  await installDeploymentEnvironment(remoteRun,{clusterId,environment:{SAMPLE:literal,ROOMQC_CONTROL_SIGNUP_ENABLED:'false'}});
  await installDeploymentEnvironment(remoteRun,{clusterId,environment:{SAMPLE:'fixture-second-value',ROOMQC_CONTROL_SIGNUP_ENABLED:'false'}});
  const envFirst=plan('release-env-first',{environment:firstEnvironment});
  assert.equal((await executeReleasePlan(envFirst.value,{remote:adapter(envFirst.compose)})).status,'deployed');
  assert(web().Config.Env.includes('SAMPLE='+literal));assert(!envFirst.compose.source.includes(literal));
  record('private literal environment reaches the container without entering the release manifest');
  const beforePrivate=web().Id;
  docker(['exec',runner,'chmod','640',secondEnvironment.path]);
  const envBlocked=plan('release-env-blocked',{environment:secondEnvironment});
  const envDenied=await executeReleasePlan(envBlocked.value,{remote:adapter(envBlocked.compose)});
  assert.equal(envDenied.status,'not_started');assert.equal(envDenied.failedPhase,'validate_compose');
  assert.equal(web().Id,beforePrivate);assert.equal(current(),envFirst.value.paths.releaseDir);
  docker(['exec',runner,'chmod','600',secondEnvironment.path]);
  record('unsafe private-file permissions stop an upgrade before it touches the running service');
  const envSecond=plan('release-env-second',{environment:secondEnvironment});
  assert.equal((await executeReleasePlan(envSecond.value,{remote:adapter(envSecond.compose)})).status,'deployed');
  assert(web().Config.Env.includes('SAMPLE=fixture-second-value'));
  const envBroken=plan('release-env-broken',{environment:firstEnvironment,broken:true});
  const envRollback=await executeReleasePlan(envBroken.value,{remote:adapter(envBroken.compose)});
  assert.equal(envRollback.status,'rolled_back');assert.equal(current(),envSecond.value.paths.releaseDir);
  assert(web().Config.Env.includes('SAMPLE=fixture-second-value'));assert(!web().Config.Env.includes('SAMPLE='+literal));
  assert.equal(docker(['exec',web().Id,'cat','/var/lib/roomqc-state/sentinel']),'preserved');
  record('failed upgrade restores the previous release with its own verified private configuration and data');
  const foreignAfter=inspect(foreign);assert.equal(foreignAfter.Id,foreignBefore.Id);assert.equal(foreignAfter.State.StartedAt,foreignBefore.State.StartedAt);
  assert.equal(foreignAfter.State.Running,true);record('unrelated application container is unchanged');
  await mkdir(resolve('.local'),{recursive:true});inputDir=await mkdtemp(resolve('.local/vps-deploy-cli-'));
  const inventory=inventoryFixture();inventory.inventory[0].id=clusterId;
  await writeFile(resolve(inputDir,'inventory.json'),JSON.stringify(inventory));
  await writeFile(resolve(inputDir,'compose.json'),JSON.stringify(first.compose.model));
  const args=['scripts/roomqc-vps-deploy.mjs','--inventory-file',resolve(inputDir,'inventory.json'),'--cluster-id',clusterId,
    '--release-id','release-cli','--image',image,'--compose-file',resolve(inputDir,'compose.json'),'--output',resolve(inputDir,'plan.json')];
  const cli=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8',env:{...process.env,ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true'},windowsHide:true}));
  assert.equal(cli.mode,'plan');assert.equal(cli.decision,'ready');
  record('actual operator CLI normalizes Compose and produces a ready plan without SSH');
  result.passed=true;
}catch(error){result.passed=false;result.errorCode=error.code??error.name;process.stderr.write(`FAIL ${error.code??error.message}\n`);process.exitCode=1}
finally{
  // Enumerate by a per-run ownership label, then re-inspect before deletion.
  const ids=docker(['ps','-aq','--filter',`label=${label}`]).trim().split(/\s+/).filter(Boolean);
  for(const id of ids){assert.equal(inspect(id).Config.Labels['roomqc.vps-release-drill'],suffix);docker(['rm','-f',id])}
  for(const kind of ['network','volume']){
    const names=docker([kind,'ls','--filter',`label=${label}`,'--format','{{.Name}}']).trim().split(/\s+/).filter(Boolean);
    for(const name of names){const info=JSON.parse(docker([kind,'inspect',name]))[0];assert.equal(info.Labels['roomqc.vps-release-drill'],suffix);docker([kind,'rm',name])}
  }
  if(inputDir){for(const name of ['inventory.json','compose.json','plan.json'])await unlink(resolve(inputDir,name)).catch(error=>{if(error.code!=='ENOENT')throw error});await rmdir(inputDir)}
  result.cleanup={containers:docker(['ps','-aq','--filter',`label=${label}`]).trim()==='',
    networks:docker(['network','ls','--filter',`label=${label}`,'--format','{{.Name}}']).trim()==='',
    volumes:docker(['volume','ls','--filter',`label=${label}`,'--format','{{.Name}}']).trim()===''};
  result.completedAt=new Date().toISOString();
  await mkdir(resolve('artifacts'),{recursive:true});
  await writeFile(resolve('artifacts/roomqc-vps-release-recovery-docker-local-2026-10-31.json'),JSON.stringify(result,null,2)+'\n');
  assert.ok(Object.values(result.cleanup).every(Boolean));
  process.stdout.write(JSON.stringify({passed:result.passed,observations:result.observations.length,cleanup:result.cleanup})+'\n');
}
