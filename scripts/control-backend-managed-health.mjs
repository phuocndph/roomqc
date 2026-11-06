// Full-vendor sandbox integration only. Every object inherits the parent's
// exact owner/project labels and is handled by its validated cleanup routine.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod,chown} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {renderMonitoring} from './render-monitoring-config.mjs';
import {prometheusConfiguration} from '../server/control/monitoring-config.mjs';
import {managedMonitoringBinding,assertManagedMonitoringBinding} from './control-backend-source-binding.mjs';
import {validateTelemetryTarget,telemetryTargetFingerprint} from '../server/control/telemetry-source.mjs';
import {releaseExpectation,releaseExpectationFingerprint} from '../server/control/release-manifest.mjs';
import {releaseApprovalEndpointFingerprint,releaseApprovalSigningBytes} from '../server/control/release-approval.mjs';

const ownerLabel='roomqc.control-backend-test';
const nodeImage='node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
const helperImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
export function discoverManagedMount(source,volumePath){
  assert.equal(typeof volumePath,'string');assert.ok(volumePath.startsWith('/'));
  const mounts=source.trim().split('\n').map(line=>{
    const [left,right]=line.split(' - '),a=left.split(' '),b=right?.split(' ');
    return {mountpoint:a[4]?.replace(/\\040/g,' '),fstype:b?.[0],device:b?.[1]};
  }).filter(m=>['ext4','xfs','btrfs'].includes(m.fstype)&&m.device?.startsWith('/dev/')
    &&(volumePath===m.mountpoint||volumePath.startsWith(m.mountpoint==='/'?'/':m.mountpoint+'/')))
    .sort((a,b)=>b.mountpoint.length-a.mountpoint.length);
  assert.ok(mounts.length,'MANAGED_ACTUAL_DATA_MOUNT_REQUIRED');return {id:'database',...mounts[0]};
}
export function managedHealthFixture(target,directoryMaxConnections=100){
  return {schemaVersion:2,instanceId:'managed-full-vendor',targets:[{target,
    prometheus:{url:'http://127.0.0.1:19090',approvedAddresses:['127.0.0.1']}}],
  connectionBudget:{maxConnections:directoryMaxConnections,reservedConnections:10,apiInstances:1,apiPoolMax:2,
    reconcileInstances:1,reconcilePoolMax:1,healthInstances:1,healthPoolMax:2,probeInstances:1,probePoolMax:2,
    exporterConnections:3,migrationConnections:1}};
}
export function managedAlternateTarget(target){
  const clean=validateTelemetryTarget(target);assert.ok(clean.dbConnectionBudget>1,'MANAGED_ALTERNATE_BUDGET_REQUIRED');
  // Genuine approved operating-budget change, not a new physical exporter or
  // fake metric. The same actual host/mount queries remain valid after restart.
  return validateTelemetryTarget({...clean,dbConnectionBudget:clean.dbConnectionBudget-1});
}
export function managedAlternateRelease(input){
  const expected=releaseExpectation(input),hash=value=>createHash('sha256').update(value).digest('hex');
  // Predetermined synthetic deployment identity. This is not issuer approval
  // and does not claim that changing manifest DATA changes schema structure.
  return releaseExpectation({...expected,releaseId:expected.releaseId+'-managed-v2',
    artifactDigest:hash('managed-fixture-release:'+expected.artifactDigest),
    frontendArtifactDigest:hash('managed-fixture-frontend:'+expected.frontendArtifactDigest)});
}
export function managedReleaseApprovals(cluster,target,currentExpected,nextExpected,{now=Date.now()}={}){
  // The exact-owned orchestrator signs two predetermined fixture releases.
  // Private key stays in this invocation and is never returned or mounted.
  const pair=generateKeyPairSync('ed25519'),maximumValidityMs=6*60*60*1000;
  const publicTrust={version:1,keys:[{issuerId:'managed-fixture',keyId:'managed-key',
    publicKey:pair.publicKey.export({format:'jwk'}),environments:[target.environment]}]};
  const context=expected=>({inventoryRef:cluster.inventoryRef,clusterId:cluster.id,hostId:target.hostId,
    environment:target.environment,expected:releaseExpectation(expected),endpointFingerprint:releaseApprovalEndpointFingerprint({
      url:cluster.url,internalUrl:cluster.internalUrl??null,approvedAddresses:cluster.approvedAddresses,credentialRef:cluster.credentialRef})});
  const envelope=(expected,epoch)=>{
    const unsigned={version:1,algorithm:'Ed25519',issuerId:'managed-fixture',keyId:'managed-key',
      payload:{approvalId:randomUUID(),epoch,...context(expected),notBefore:now-1000,expiresAt:now-1000+maximumValidityMs}};
    return {...unsigned,signature:sign(null,releaseApprovalSigningBytes(unsigned),pair.privateKey).toString('base64url')};
  };
  return {publicTrust,maximumValidityMs,current:envelope(currentExpected,1),next:envelope(nextExpected,2)};
}
export function managedFiveServicesReady(snapshot){
  const names=['auth','rest','storage','realtime','functions'],probes=snapshot?.state?.probes;
  return snapshot?.worker?.ready===true&&probes!=null&&Object.keys(probes).length===names.length
    &&names.every(name=>probes[name]===true);
}
export async function deployManagedFunctionsRelease({state,compose,directory,beforeExpected,expected,privateRun,save}){
  const prior=releaseExpectation(beforeExpected),next=releaseExpectation(expected);
  assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
  assert.equal(directory,join(state.root,'managed-health'));
  const original=join(state.root,'runtime.compose.json');
  assert.deepEqual(compose,['compose','--project-name',state.projectId,'--file',original]);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(hash(await readFile(original)),state.bundleHash,'MANAGED_INITIAL_BUNDLE_DRIFT');
  const resolve=async args=>JSON.parse((await privateRun('docker',[...args,'config','--format','json'])).stdout);
  const inspect=async()=>JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-functions'])).stdout)[0];
  const before=await resolve(compose),initial=await inspect();
  assert.equal(before.services.functions.environment.ROOMQC_CONTROL_RELEASE_ID,prior.releaseId);
  assert.equal(before.services.functions.environment.ROOMQC_CONTROL_CLUSTER_ID,next.clusterId);
  assert.notEqual(prior.releaseId,next.releaseId);assert.equal(prior.clusterId,next.clusterId);
  assert.equal(initial.Config.Labels[ownerLabel],state.run);
  assert.equal(initial.Config.Labels['com.docker.compose.project'],state.projectId);
  const override={services:{functions:{environment:{ROOMQC_CONTROL_RELEASE_ID:next.releaseId}}}},
    overrideText=JSON.stringify(override),file=join(directory,'release-functions.compose.json');
  await writeFile(file,overrideText,{mode:0o600,flag:'wx'});
  const effective=[...compose,'--file',file],after=await resolve(effective),approved=structuredClone(before);
  approved.services.functions.environment.ROOMQC_CONTROL_RELEASE_ID=next.releaseId;
  assert.deepEqual(after,approved,'MANAGED_RELEASE_CONFIG_DELTA_INVALID');
  const proof={verified:false,previousReleaseId:prior.releaseId,releaseId:next.releaseId,
    originalBundleSha256:state.bundleHash,overrideSha256:hash(overrideText),
    beforeResolvedSha256:hash(JSON.stringify(before)),afterResolvedSha256:hash(JSON.stringify(after)),
    onlyReleaseEnvironmentChanged:true,originalBundleUnchanged:true};
  state.managedHealth.functionsDeployment=proof;await save();
  await privateRun('docker',[...effective,'up','--detach','--no-deps','--force-recreate','--wait','--wait-timeout','60','functions'],{timeout:90000});
  const actual=await inspect();
  assert.equal(actual.State.Running,true);assert.equal(actual.Image,initial.Image);
  assert.equal(actual.Config.Image,initial.Config.Image);
  assert.equal(actual.Config.Labels[ownerLabel],state.run);
  assert.equal(actual.Config.Labels['com.docker.compose.project'],state.projectId);
  const environment=info=>Object.fromEntries(info.Config.Env.map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)]}));
  assert.deepEqual(environment(actual),{...environment(initial),ROOMQC_CONTROL_RELEASE_ID:next.releaseId});
  assert.deepEqual(Object.keys(actual.NetworkSettings.Networks),[state.projectId+'-internal']);
  assert.ok(!Object.values(actual.NetworkSettings.Ports??{}).some(value=>value?.length));
  assert.equal(hash(await readFile(original)),state.bundleHash,'MANAGED_INITIAL_BUNDLE_DRIFT');
  // Intentionally retain the override in the parent's shared Compose arguments:
  // every later fault/recovery must use the deployed release, never revert v1.
  compose.push('--file',file);
  Object.assign(proof,{verified:true,imageUnchanged:true,publishedPorts:0,effectiveComposeRetained:true});
  await save();return proof;
}
export async function checkManagedClientLinkage({state,repository,privateRun}){
  const source=await readFile(join(repository,'scripts/control-backend-managed-client.mjs'),'utf8');
  const result=await privateRun('docker',['run','--rm','-i','--name',state.projectId+'-managed-link-check',
    '--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId,
    '--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--memory','128m','--cpus','0.5','--pids-limit','64','--env','ROOMQC_MANAGED_MODE=link',
    '--mount','type=bind,source='+join(repository,'server/control')+',target=/control,readonly',
    '--mount','type=bind,source='+join(repository,'node_modules')+',target=/node_modules,readonly',
    nodeImage,'node','--input-type=module'],{input:source,timeout:30000});
  assert.deepEqual(JSON.parse(result.stdout),{linked:true});
  return {linked:true,sourceHash:createHash('sha256').update(source).digest('hex')};
}
export async function prepareManagedExporterRole({state,repository,privateRun}){
  // Pinned self-host postgres is deliberately not a superuser. Only the owned
  // deployment installer may grant a built-in stats role, BEFORE attestation.
  const installer=source=>privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-qAt',
    '-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','supabase_admin','-d','postgres'],{input:source,timeout:30000});
  const authority=JSON.parse((await installer(`SELECT json_build_object('role',current_user,'superuser',rolsuper)
    FROM pg_roles WHERE rolname=current_user;`)).stdout.trim());
  assert.deepEqual(authority,{role:'supabase_admin',superuser:true});
  const source=await readFile(join(repository,'deploy/monitoring/exporter-roles.sql'),'utf8');
  await installer(source);const password=randomBytes(32).toString('hex');
  await installer(`ALTER ROLE roomqc_monitor LOGIN PASSWORD '${password}';`);
  state.managedExporterRole={role:'roomqc_monitor',installerRole:authority.role,beforeSchemaFreeze:true,
    sourceHash:createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex')};
  return {password};
}
export async function runManagedHealthDrill({state,repository,privateRun,runClient,sql,compose,canaries,expectation,
  credential,serviceKey,exporterPassword,businessInstallerDatabaseUrl,save,emit,signal,credentialOnly=false,configurationOnly=false,releaseOnly=false}){
  assert.ok([credentialOnly,configurationOnly,releaseOnly].filter(Boolean).length<=1);
  assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
  state.phase='managed_health_prepare';await save();
  const directory=join(state.root,'managed-health'),secrets=join(directory,'secrets'),tls=join(directory,'tls'),output=join(directory,'bundle');
  await mkdir(directory);await mkdir(secrets);await mkdir(tls);
  const labels=['--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId];
  const docker=(args,options={})=>privateRun('docker',args,options);
  const inspect=async(kind,name)=>JSON.parse((await docker([kind,'inspect',name])).stdout)[0];
  const volume=await inspect('volume',state.projectId+'-db-data');
  const mountinfo=(await docker(['run','--rm','--name',state.projectId+'-managed-host-check',...labels,
    '--read-only','--network','none','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--mount','type=bind,source=/,target=/host,readonly','--entrypoint','/bin/sh',helperImage,'-c','cat /host/proc/1/mountinfo'])).stdout;
  const target={clusterId:'fixture-a',hostId:'managed-'+state.run,environment:'local',
    dbConnectionBudget:Number(await sql(state,'SHOW max_connections;')),
    measurementScope:process.platform==='win32'?'docker-desktop-vm':'linux-host',
    dataMounts:[discoverManagedMount(mountinfo,volume.Mountpoint)]};
  assert.equal(state.managedExporterRole?.beforeSchemaFreeze,true);assert.match(exporterPassword,/^[a-f0-9]{64}$/);
  for(const [name,value]of Object.entries({'postgres-user':'roomqc_monitor','postgres-password':exporterPassword,
    'postgres-uri':'db:5432/postgres?sslmode=disable&connect_timeout=3'})){
    const file=join(secrets,name);await writeFile(file,value,{mode:0o640,flag:'wx'});
    if(process.platform!=='win32'){await chmod(file,0o640);await chown(file,65534,65534)}
  }
  const targetPath=join(directory,'target.json');await writeFile(targetPath,JSON.stringify(target),{mode:0o600,flag:'wx'});
  const health=managedHealthFixture(target);
  await renderMonitoring({target:targetPath,output,secrets,tls,network:state.projectId+'-internal',project:'roomqc-monitor-'+state.run});
  // Renderer exact queries/labels, five-second local scraping, no fake source.
  await writeFile(join(output,'prometheus.yml'),JSON.stringify(prometheusConfiguration(target,{intervalSeconds:5})),{mode:0o644});
  const rendered=JSON.parse((await docker(['compose','--env-file',join(output,'monitor.env'),'-f',
    join(repository,'deploy/monitoring/compose.yml'),'config','--format','json'])).stdout);
  rendered.name=state.projectId;
  rendered.networks={metrics:{name:state.projectId+'-managed-metrics',internal:true,
    labels:{[ownerLabel]:state.run}},backend:{external:true,name:state.projectId+'-internal'}};
  rendered.volumes['prometheus-data']={name:state.projectId+'-managed-prometheus-data',labels:{[ownerLabel]:state.run}};
  for(const [name,service]of Object.entries(rendered.services)){
    service.container_name=state.projectId+'-managed-'+name;service.restart='no';
    service.labels={...service.labels,[ownerLabel]:state.run};delete service.ports;
    service.networks={metrics:{aliases:[name]},...(name!=='node-exporter'?{backend:{aliases:['managed-'+name]}}:{})};
  }
  const monitoringFile=join(directory,'monitoring.compose.json');
  await writeFile(monitoringFile,JSON.stringify(rendered),{mode:0o600,flag:'wx'});
  const renderedBinding=async()=>managedMonitoringBinding({compose:JSON.parse(await readFile(monitoringFile,'utf8')),
    prometheus:JSON.parse(await readFile(join(output,'prometheus.yml'),'utf8')),
    target:JSON.parse(await readFile(targetPath,'utf8')),health,repository,ownedRoot:state.root,run:state.run,projectId:state.projectId});
  state.managedMonitoringBinding=await renderedBinding();await save();
  const monitorCompose=['compose','--project-name',state.projectId,'--file',monitoringFile];
  await docker([...monitorCompose,'up','--detach'],{timeout:180000});
  for(const name of Object.keys(rendered.services)){
    const info=await inspect('container',state.projectId+'-managed-'+name);
    assert.equal(info.Config.User,'65534:65534');assert.equal(info.HostConfig.ReadonlyRootfs,true);
    assert.ok(info.HostConfig.CapDrop.includes('ALL'));assert.deepEqual(info.HostConfig.PortBindings,{});
  }
  // Directory roles live on a different PostgreSQL INSTANCE, never on the
  // attested business server (roles are instance-wide, not database-local).
  const directoryPassword=randomBytes(32).toString('hex'),directoryDb=state.projectId+'-managed-directory';
  const passwordFile=join(directory,'directory-password');await writeFile(passwordFile,directoryPassword,{mode:0o600,flag:'wx'});
  const directoryVolume=state.projectId+'-managed-directory-data';await docker(['volume','create',...labels,directoryVolume]);
  await docker(['run','-d','--name',directoryDb,...labels,'--network',state.projectId+'-internal','--network-alias','managed-directory',
    '--memory','256m','--cpus','0.5','--pids-limit','128','--env','POSTGRES_DB=roomqc_managed_fixture',
    '--env','POSTGRES_PASSWORD_FILE=/run/fixture-directory-password',
    '--mount','type=bind,source='+passwordFile+',target=/run/fixture-directory-password,readonly',
    '--mount','type=volume,source='+directoryVolume+',target=/var/lib/postgresql/data',helperImage]);
  const directoryDeadline=Date.now()+60000;let directoryReady=false;
  while(Date.now()<directoryDeadline){
    signal.throwIfAborted();
    try{await docker(['exec',directoryDb,'pg_isready','-h','127.0.0.1','-U','postgres','-d','roomqc_managed_fixture']);directoryReady=true;break}catch{}
    await delay(1000,undefined,{signal});
  }
  assert.equal(directoryReady,true,'MANAGED_DIRECTORY_NOT_READY');
  assert.deepEqual((await inspect('container',directoryDb)).HostConfig.PortBindings,{});
  const managedVolume=state.projectId+'-managed-runtime';await docker(['volume','create',...labels,managedVolume]);
  const passwords=Object.fromEntries(['metrics','probe','reader','installer','operator','release'].map(name=>[name,randomBytes(32).toString('hex')]));
  const cluster={id:'fixture-a',hostId:target.hostId,url:'http://127.0.0.1:8000',internalUrl:null,
    inventoryRef:'fixture-a',credentialRef:'fixture-a',approvedAddresses:['127.0.0.1'],publishableKey:credential.publishableKey};
  const releaseExpected=managedAlternateRelease(expectation),approvals=managedReleaseApprovals(cluster,target,expectation,releaseExpected);
  const metadata={version:2,targets:[{cluster,expected:expectation,approval:approvals.current,storage:canaries.storage}]};
  const releaseMetadata={version:2,targets:[{cluster,expected:releaseExpected,approval:approvals.next,storage:canaries.storage}]};
  const metadataDigests={initial:createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),
    alternate:createHash('sha256').update(JSON.stringify(releaseMetadata)).digest('hex')};
  const source=await readFile(join(repository,'scripts/control-backend-managed-client.mjs'),'utf8');
  const support=credentialOnly?null:JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'support-install',
    ROOMQC_MANAGED_AUTHORITY_INPUT:JSON.stringify({run:state.run,databaseUrl:businessInstallerDatabaseUrl,
      serviceKey,publishableKey:credential.publishableKey})},45000)).stdout);
  if(support){
    assert.equal(support.verified,true);assert.equal(support.actualAuth,true);assert.equal(support.revokedSessionRemoved,true);
    state.managedSupportAuthority={actualAuth:true,revokedSessionRemoved:true,workerReceivesOperatorTokens:false,
      accounts:support.accounts};await save();
  }
  const alternateTarget=managedAlternateTarget(target),alternateHealth=managedHealthFixture(alternateTarget);
  const healthDigests={initial:createHash('sha256').update(JSON.stringify(health)).digest('hex'),
    alternate:createHash('sha256').update(JSON.stringify(alternateHealth)).digest('hex')};
  const installInput={databaseUrl:`postgresql://postgres:${directoryPassword}@127.0.0.1:15432/roomqc_managed_fixture`,passwords,
    cluster:{...cluster,vapidPublicKey:'fixture-vapid',maxWorkspaces:5},expected:expectation,target,metadata,releaseMetadata,
    health,alternateHealth,publicTrust:approvals.publicTrust,maximumValidityMs:approvals.maximumValidityMs,
    bundle:{credential,auth:canaries.coordinatorAuth},key:randomBytes(32).toString('hex')};
  const installed=JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'install',ROOMQC_MANAGED_INSTALL_INPUT:JSON.stringify(installInput)},60000,
    {managedVolume,writable:true})).stdout);assert.equal(installed.installed,true);
  const workerName=state.projectId+'-managed-worker',gateToken=randomBytes(32).toString('hex');
  const workerEnv={ROOMQC_MANAGED_MODE:'worker',ROOMQC_HEALTH_ALLOW_LOCAL:'true',NODE_ENV:'test',
    ROOMQC_HEALTH_CONFIG_FILE:'/managed/health.json',ROOMQC_HEALTH_DATABASE_URL_FILE:'/managed/metrics-dsn',
    ROOMQC_HEALTH_PROBE_CONFIG_FILE:'/managed/metadata.json',ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:'/managed/probe-dsn',
    ROOMQC_HEALTH_PROBE_KEYRING_FILE:'/managed/keyring.json',ROOMQC_HEALTH_RELEASE_TRUST_FILE:'/managed/release-trust.json',
    ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(approvals.maximumValidityMs),ROOMQC_MANAGED_GATE_TOKEN:gateToken};
  const worker=async()=>docker(['run','-d','--name',workerName,...labels,'--network','container:'+state.projectId+'-api-gw',
    '--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--memory','192m','--cpus','0.5','--pids-limit','64',...Object.entries(workerEnv).flatMap(([k,v])=>['--env',k+'='+v]),
    '--mount','type=volume,source='+managedVolume+',target=/managed,readonly',
    '--mount','type=bind,source='+join(repository,'server/control')+',target=/control,readonly',
    '--mount','type=bind,source='+join(repository,'node_modules')+',target=/node_modules,readonly',
    '--mount','type=bind,source='+join(repository,'scripts/control-backend-managed-client.mjs')+',target=/managed-client.mjs,readonly',
    nodeImage,'node','/managed-client.mjs']);
  const observer={databaseUrl:`postgresql://roomqc_managed_reader:${passwords.reader}@127.0.0.1:15432/roomqc_managed_fixture`,
    metadata,target,publicTrust:approvals.publicTrust,maximumValidityMs:approvals.maximumValidityMs};
  const snapshot=async()=>JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'observe',
    ROOMQC_MANAGED_OBSERVER_INPUT:JSON.stringify(observer)},15000)).stdout);
  const mutationInput={databaseUrl:`postgresql://roomqc_managed_installer:${passwords.installer}@127.0.0.1:15432/roomqc_managed_fixture`,
    readerDatabaseUrl:observer.databaseUrl,metadata,target,publicTrust:approvals.publicTrust,maximumValidityMs:approvals.maximumValidityMs,
    key:installInput.key,credential,login:canaries.installer,gateToken};
  const mutateCredential=async operation=>JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'credential-drill',
    ROOMQC_MANAGED_DRILL_INPUT:JSON.stringify({...mutationInput,operation})},100000)).stdout);
  const configurationInput={databaseUrl:`postgresql://roomqc_managed_operator:${passwords.operator}@127.0.0.1:15432/roomqc_managed_fixture`,
    readerDatabaseUrl:observer.databaseUrl,metadata,target,publicTrust:approvals.publicTrust,maximumValidityMs:approvals.maximumValidityMs,
    approvedTarget:alternateTarget,operator:support?.operator,revoked:support?.revoked,gateToken};
  const mutateConfiguration=async operation=>JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'configuration-drill',
    ROOMQC_MANAGED_CONFIG_INPUT:JSON.stringify({...configurationInput,operation})},100000)).stdout);
  const starts=logs=>logs.split('\n').flatMap(line=>{try{const item=JSON.parse(line);return item.event==='managed_worker_started'?[item]:[]}catch{return []}});
  const timeline=[];let lastReport=0;
  const waitFor=async(phase,predicate,timeout)=>{
    const end=Date.now()+timeout;let last;
    while(Date.now()<end){
      signal.throwIfAborted();
      try{last=await snapshot()}catch{
        // Startup/source observation races are not terminal. Confirm the same
        // worker is still live; never restart it merely because a read expired.
        const info=await inspect('container',workerName);
        assert.equal(info.State.Running,true,'MANAGED_WORKER_EXITED');
        await delay(15000,undefined,{signal});continue;
      }
      if(Date.now()-lastReport>=60000){emit('backend_managed_health_wait',{phase,workerReady:last.worker.ready,
        health:last.health?.status??null,reasons:last.admission.reasonCodes,workerActive:last.worker.active,
        lastStartedAt:last.worker.lastStartedAt,lastFinishedAt:last.worker.lastFinishedAt,lastErrorCode:last.worker.lastErrorCode,
        credentialState:last.guard.credentialState,credentialRevision:last.guard.credentialRevision});lastReport=Date.now()}
      if(await predicate(last)){timeline.push({phase,...last});await save();return last}
      await delay(15000,undefined,{signal});
    }
    const error=new Error('MANAGED_HEALTH_PHASE_TIMEOUT');error.code='MANAGED_HEALTH_PHASE_TIMEOUT';
    state.managedHealthLastSnapshot=last;throw error;
  };
  state.phase='managed_health';state.managedHealth={verified:false,measurementScope:target.measurementScope,
    actualFiveServices:true,actualMetrics:true,realTime:true,syntheticApproval:true,offsiteBackupProved:false,timeline};
  await save();emit('backend_managed_health_start',{scope:target.measurementScope,manualAdmissionClosed:true});await worker();
  if(support){
    const actual=(await inspect('container',workerName)).Config.Env.join('\n');
    for(const secret of [support.operator.token,support.revoked.token,serviceKey,businessInstallerDatabaseUrl]){
      assert.equal(typeof secret,'string');assert.ok(secret.length>20);
      assert.ok(!actual.includes(secret),'MANAGED_WORKER_RECEIVED_OPERATOR_OR_INSTALLER_SECRET');
    }
    state.managedSupportAuthority.workerEnvironmentIsolationVerified=true;await save();
  }
  const first=await waitFor('first_sample',s=>s.worker.ready&&s.state?.probes&&Object.values(s.state.probes).every(Boolean),120000);
  assert.equal(first.state.warming,true);assert.ok(first.admission.reasonCodes.includes('METRICS_WARMING'));
  const warm=credentialOnly||configurationOnly||releaseOnly?first:await waitFor('warmup',s=>s.state&&!s.state.warming,390000);
  if(!credentialOnly&&!configurationOnly&&!releaseOnly){
    assert.ok(warm.state.lastObservedAt-warm.state.firstValidAt>=300000);
    assert.equal(warm.health.status,'healthy','MANAGED_BASELINE_RESOURCES_UNHEALTHY');
  }
  assert.equal(warm.admission.decision,'manual_closed');assert.ok(warm.admission.reasonCodes.includes('BACKUP_UNVERIFIED'));
  // One short-lived instrumentation process uses a restricted installer plus
  // reader pool (max1 each). These two connections fit the fixture's reserved
  // headroom; neither login/key/password is ever mounted in the health worker.
  state.managedHealth.mutationInstrumentation={maxConnections:2,withinReservedHeadroom:true,installerRestricted:true};
  if(!configurationOnly&&!releaseOnly){
  const rotated=await mutateCredential('rotate');timeline.push({phase:'credential_rotate_fenced',...rotated});await save();
  const rotationReady=await waitFor('credential_rotate_recovery',s=>s.worker.ready&&s.state?.warming
    &&s.state.proofCredentialRevision===rotated.afterRevision,150000);
  assert.ok(rotationReady.state.firstValidAt>warm.state.firstValidAt);
  const disabled=await mutateCredential('disable');timeline.push({phase:'credential_disable_fenced',...disabled});await save();
  const disabledCycle=await waitFor('credential_disabled_next_cycle',s=>s.worker.lastErrorCode==='PROBE_CREDENTIAL_DISABLED',150000);
  assert.notEqual(disabledCycle.admission.decision,'open');
  const restoredCredential=await mutateCredential('recover');timeline.push({phase:'credential_new_session',...restoredCredential});await save();
  const credentialReady=await waitFor('credential_new_session_recovery',s=>s.worker.ready&&s.state?.warming
    &&s.state.proofCredentialRevision===restoredCredential.afterRevision,150000);
  assert.ok(credentialReady.state.firstValidAt>rotationReady.state.firstValidAt);
  state.managedHealth.credentialMutation={verified:true,actualMetricsOverlap:true,actualSameUserNewSessions:true,
    fencedAtHealthCommit:true,admissionRemainedClosed:true,remoteAuthRevokeProved:false};await save();
  }
  if(credentialOnly){
    // Explicit diagnostic checkpoint, never a full timed/backend acceptance or
    // an independent rebuild reference. Default run still executes every step.
    await docker(['stop','--time','15',workerName]);
    assert.equal((await inspect('container',workerName)).State.ExitCode,0);
    const logs=(await docker(['logs',workerName])).stdout;
    assert.ok(logs.includes('"poolsClosed":2'));assert.ok(!logs.includes(gateToken)&&!logs.includes(canaries.installer.password));
    assertManagedMonitoringBinding(state.managedMonitoringBinding,await renderedBinding());
    Object.assign(state.managedHealth,{credentialCheckpointVerified:true,workerShutdownExitCode:0,
      renderedConfigurationUnchanged:true,fullTimedDrillExecuted:false,sourceHash:createHash('sha256').update(source).digest('hex')});
    await save();emit('backend_managed_credential_checkpoint',{verified:true,actualMetricsOverlap:true,
      actualHealthCommitFence:true,fullTimedDrillExecuted:false,admissionOpened:false});return state.managedHealth;
  }
  let configurationReady=warm;
  if(!releaseOnly){
  const policyChanged=await mutateConfiguration('policy');timeline.push({phase:'policy_change_fenced',...policyChanged});await save();
  const policyReady=await waitFor('policy_change_recovery',s=>s.worker.ready&&s.state?.warming
    &&s.state.proofPolicyVersion===policyChanged.afterPolicyVersion,150000);
  assert.ok(policyReady.state.firstValidAt>warm.state.firstValidAt);
  const targetChanged=await mutateConfiguration('target');timeline.push({phase:'target_change_fenced',...targetChanged});await save();
  // Old process keeps its immutable startup target; it must fail before the
  // next collection rather than silently accepting the newly approved target.
  const oldCycle=await waitFor('old_target_next_cycle',s=>s.worker.lastStartedAt>targetChanged.rejectedAt
    &&s.worker.lastFinishedAt>s.worker.lastStartedAt&&s.worker.lastErrorCode==='TELEMETRY_TARGET_MISMATCH',150000);
  assert.equal(oldCycle.guard.targetVersion,targetChanged.afterTargetVersion);assert.notEqual(oldCycle.admission.decision,'open');
  const old=await inspect('container',workerName);assert.equal(old.Config.Labels[ownerLabel],state.run);
  assert.equal(old.Config.Labels['com.docker.compose.project'],state.projectId);
  await docker(['stop','--time','15',workerName]);assert.equal((await inspect('container',workerName)).State.ExitCode,0);
  const oldLogs=(await docker(['logs',workerName])).stdout;
  assert.equal(starts(oldLogs).at(-1)?.healthConfigSha256,healthDigests.initial);assert.ok(oldLogs.includes('"poolsClosed":2'));
  // Remove only this stopped, ownership-checked fixture container. Data volume
  // survives, and the replacement mounts a pre-installed readonly config file.
  await docker(['rm',workerName]);workerEnv.ROOMQC_HEALTH_CONFIG_FILE='/managed/health-alternate.json';
  observer.target=alternateTarget;await worker();
  const targetReady=await waitFor('target_restart_recovery',s=>s.worker.ready&&s.state?.warming
    &&s.state.proofTargetVersion===targetChanged.afterTargetVersion,150000);
  assert.ok(targetReady.state.firstValidAt>policyReady.state.firstValidAt);
  assert.equal(targetReady.guard.targetFingerprint,telemetryTargetFingerprint(alternateTarget));
  const newStarts=starts((await docker(['logs',workerName])).stdout);
  assert.equal(newStarts.at(-1)?.healthConfigSha256,healthDigests.alternate);
  assert.equal(newStarts.at(-1)?.targetFingerprint,targetChanged.afterTargetFingerprint);
  configurationReady=targetReady;
  state.managedHealth.policyTargetMutation={verified:true,actualMetricsOverlap:true,actualAdminCommands:true,
    commandReplayVerified:true,oldWorkerNextCycleRejected:true,readonlyConfigRestartVerified:true,
    healthConfigurationDigests:healthDigests,syntheticPlatformActor:false,actualCanonicalAuth:true,
    canonicalAcceptanceConsumed:true,missingAuthorityDenied:true,revokedSessionDenied:true,physicalExporterChanged:false,
    approvalCatalogChanged:false,releaseChangeProved:false,admissionRemainedClosed:true};await save();
  if(configurationOnly){
    await docker(['stop','--time','15',workerName]);assert.equal((await inspect('container',workerName)).State.ExitCode,0);
    const logs=(await docker(['logs',workerName])).stdout;assert.ok(logs.includes('"poolsClosed":2'));
    assert.ok(!logs.includes(gateToken)&&!logs.includes(passwords.operator));
    assertManagedMonitoringBinding(state.managedMonitoringBinding,await renderedBinding());
    Object.assign(state.managedHealth,{policyTargetCheckpointVerified:true,workerShutdownExitCode:0,
      renderedConfigurationUnchanged:true,fullTimedDrillExecuted:false,sourceHash:createHash('sha256').update(source).digest('hex')});
    await save();emit('backend_managed_configuration_checkpoint',{verified:true,actualMetricsOverlap:true,
      actualAdminCommands:true,readonlyRestart:true,fullTimedDrillExecuted:false,admissionOpened:false});return state.managedHealth;
  }
  }
  state.managedHealth.releaseInstrumentation={maxConnections:3,withinReservedHeadroom:true,
    directoryOperatorRestricted:true,businessInstallerIsolatedFromWorker:true};await save();
  const releaseChanged=JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'release-drill',
    ROOMQC_MANAGED_RELEASE_INPUT:JSON.stringify({...configurationInput,target:observer.target,
      approvedExpected:releaseExpected,approvedMetadata:releaseMetadata,credential,businessInstallerDatabaseUrl,
      releaseInstallerDatabaseUrl:`postgresql://roomqc_managed_release:${passwords.release}@127.0.0.1:15432/roomqc_managed_fixture`})},100000)).stdout);
  timeline.push({phase:'release_change_fenced',...releaseChanged});await save();
  observer.metadata=releaseMetadata;
  const oldReleaseCycle=await waitFor('old_release_next_cycle',s=>s.worker.lastStartedAt>releaseChanged.rejectedAt
    &&s.worker.lastFinishedAt>s.worker.lastStartedAt&&s.worker.lastErrorCode==='RELEASE_APPROVAL_NOT_CURRENT',150000);
  assert.equal(oldReleaseCycle.guard.releaseId,releaseExpected.releaseId);
  assert.notEqual(oldReleaseCycle.admission.decision,'open');
  await deployManagedFunctionsRelease({state,compose,directory,beforeExpected:expectation,expected:releaseExpected,privateRun,save});
  timeline.push({phase:'release_functions_deployed',at:Date.now(),releaseId:releaseExpected.releaseId});await save();
  const rebound=JSON.parse((await runClient(source,{ROOMQC_MANAGED_MODE:'credential-drill',
    ROOMQC_MANAGED_DRILL_INPUT:JSON.stringify({...mutationInput,metadata:releaseMetadata,target:observer.target,operation:'rebind'})},100000)).stdout);
  assert.equal(rebound.beforeRevision,releaseChanged.beforeCredentialRevision);
  timeline.push({phase:'release_installer_rebind',...rebound});await save();
  const prior=await inspect('container',workerName);assert.equal(prior.Config.Labels[ownerLabel],state.run);
  assert.equal(prior.Config.Labels['com.docker.compose.project'],state.projectId);
  await docker(['stop','--time','15',workerName]);assert.equal((await inspect('container',workerName)).State.ExitCode,0);
  const priorLogs=(await docker(['logs',workerName])).stdout;
  assert.equal(starts(priorLogs).at(-1)?.probeConfigSha256,metadataDigests.initial);
  assert.equal(starts(priorLogs).at(-1)?.releaseFingerprint,releaseExpectationFingerprint(expectation));
  assert.ok(priorLogs.includes('"poolsClosed":2'));
  await docker(['rm',workerName]);workerEnv.ROOMQC_HEALTH_PROBE_CONFIG_FILE='/managed/metadata-release.json';await worker();
  const releaseReady=await waitFor('release_restart_recovery',s=>managedFiveServicesReady(s)&&s.state.warming
    &&s.guard.releaseId===releaseExpected.releaseId&&s.state.proofCredentialRevision===rebound.afterRevision,150000);
  assert.ok(releaseReady.state.firstValidAt>configurationReady.state.firstValidAt);
  assert.equal(releaseReady.guard.probeBindingHash,rebound.bindingHash);
  const releaseStart=starts((await docker(['logs',workerName])).stdout).at(-1);
  assert.equal(releaseStart?.probeConfigSha256,metadataDigests.alternate);
  assert.equal(releaseStart?.releaseFingerprint,releaseExpectationFingerprint(releaseExpected));
  state.managedHealth.releaseCatalogMutation={verified:true,actualMetricsOverlap:true,actualManifestTransport:true,
    actualAdminCommand:true,commandReplayVerified:true,lateSampleUnchanged:true,oldWorkerNextCycleRejected:true,
    installerRebindVerified:true,readonlyCatalogRestartVerified:true,metadataDigests,syntheticApproval:true,
    functionsDeploymentVerified:true,allFiveServiceRecoveryVerified:true,
    syntheticPlatformActor:false,actualCanonicalAuth:true,canonicalAcceptanceConsumed:true,
    missingAuthorityDenied:true,revokedSessionDenied:true,schemaUnchanged:true,issuerApprovalProved:false,crossReplicaWithdrawalProved:false,
    admissionRemainedClosed:true};state.managedHealth.effectiveExpectation=releaseExpected;await save();
  if(releaseOnly){
    await docker(['stop','--time','15',workerName]);assert.equal((await inspect('container',workerName)).State.ExitCode,0);
    const logs=(await docker(['logs',workerName])).stdout;assert.ok(logs.includes('"poolsClosed":2'));
    assert.ok(!logs.includes(gateToken)&&!logs.includes(passwords.operator)&&!logs.includes(canaries.installer.password));
    assertManagedMonitoringBinding(state.managedMonitoringBinding,await renderedBinding());
    Object.assign(state.managedHealth,{releaseCatalogCheckpointVerified:true,workerShutdownExitCode:0,
      renderedConfigurationUnchanged:true,fullTimedDrillExecuted:false,sourceHash:createHash('sha256').update(source).digest('hex')});
    await save();emit('backend_managed_release_checkpoint',{verified:true,actualMetricsOverlap:true,
      actualManifestTransport:true,readonlyCatalogRestart:true,fullTimedDrillExecuted:false,admissionOpened:false});return state.managedHealth;
  }
  let restarted=false;
  for(const service of ['auth','rest','storage','realtime','functions']){
    const faultAt=Date.now();await docker(['stop','--time','5',state.projectId+'-'+service]);
    const failed=await waitFor('fault_'+service,s=>s.state?.probes?.[service]===false
      &&s.state.probeFailures>=3&&s.state.latchedReasons?.includes('BACKEND_UNREACHABLE'),180000);
    assert.ok(failed.at-faultAt>=60000);assert.equal(failed.worker.ready,true);
    assert.equal(failed.health.status,'unreachable');assert.notEqual(failed.admission.decision,'open');
    if(!restarted){
      const firstValid=failed.state.firstValidAt;await docker(['stop','--time','15',workerName]);
      const stopped=await inspect('container',workerName);assert.equal(stopped.State.ExitCode,0);
      await docker(['start',workerName]);
      const restored=await waitFor('restart_fault',s=>s.worker.ready&&s.state?.probes?.[service]===false,90000);
      assert.equal(restored.state.firstValidAt,firstValid);assert.ok(restored.state.latchedReasons.includes('BACKEND_UNREACHABLE'));restarted=true;
    }
    await docker([...compose,'up','--detach','--wait','--wait-timeout','60',service],{timeout:90000});
    await waitFor('service_recovered_'+service,s=>s.worker.ready&&s.state?.probes&&Object.values(s.state.probes).every(Boolean),90000);
  }
  const recovering=await snapshot();assert.ok(recovering.state.latchedReasons.includes('BACKEND_UNREACHABLE'));
  const recovered=await waitFor('continuous_recovery',s=>s.state?.recoverySince!=null
    &&s.state.lastObservedAt-s.state.recoverySince>=600000&&s.state.latchedReasons.length===0,720000);
  assert.equal(recovered.health.status,'healthy');assert.notEqual(recovered.admission.decision,'open');
  await docker(['stop','--time','5',state.projectId+'-managed-prometheus']);
  const stale=await waitFor('metrics_stale',s=>s.health?.status==='unknown'&&s.admission.reasonCodes.includes('METRICS_STALE'),210000);
  assert.equal(stale.worker.ready,false);assert.notEqual(stale.admission.decision,'open');
  await docker(['start',state.projectId+'-managed-prometheus']);
  const resumed=await waitFor('metrics_resumed',s=>s.worker.ready&&s.state?.warming,120000);
  assert.ok(resumed.state.firstValidAt>recovered.state.firstValidAt);
  const final=await waitFor('final_warmup',s=>s.worker.ready&&s.state&&!s.state.warming,420000);
  assert.equal(final.health.status,'healthy');assert.notEqual(final.admission.decision,'open');
  await docker(['stop','--time','15',workerName]);
  const stopped=await inspect('container',workerName);assert.equal(stopped.State.ExitCode,0);
  const logs=(await docker(['logs',workerName])).stdout;
  assert.ok(logs.includes('"poolsClosed":2'));assert.ok(!logs.includes(directoryPassword)&&!logs.includes(canaries.coordinatorAuth.refreshToken));
  assertManagedMonitoringBinding(state.managedMonitoringBinding,await renderedBinding());
  state.managedHealth.verified=true;state.managedHealth.workerShutdownExitCode=0;
  state.managedHealth.fullTimedDrillExecuted=true;
  state.managedHealth.renderedConfigurationUnchanged=true;
  state.managedHealth.sourceHash=createHash('sha256').update(source).digest('hex');await save();
  emit('backend_managed_health_verified',{steps:timeline.length,scope:target.measurementScope,actualFiveServices:true,
    actualMetrics:true,realTime:true,admissionOpened:false,offsiteBackupProved:false});return state.managedHealth;
}
