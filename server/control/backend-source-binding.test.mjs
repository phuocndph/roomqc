import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,unlink,rename,symlink,realpath,chmod,chown} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {renderMonitoring} from '../../scripts/render-monitoring-config.mjs';
import {managedHealthFixture} from '../../scripts/control-backend-managed-health.mjs';
import {requiredBackendSources,captureBackendSourceBinding,assertBackendSourceBinding,
  managedMonitoringBinding,assertManagedMonitoringBinding,readBackendBuildReference} from '../../scripts/control-backend-source-binding.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){
  const base=await realpath(tmpdir()),root=await mkdtemp(join(base,'roomqc-source-binding-'));
  t.after(async()=>{
    assert.equal(dirname(await realpath(root)),base);assert.match(basename(root),/^roomqc-source-binding-[a-zA-Z0-9]+$/);
    await rm(root,{recursive:true,force:false});
  });
  for(const path of requiredBackendSources){
    await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),'fixture '+path+'\n');
  }
  return root;
}
function renderInput(run='123456789abc',name='a'){
  const repository=resolve(tmpdir(),'roomqc-render-repository-'+name),projectId='roomqc-probe-'+run,
    ownedRoot=join(repository,'.local','roomqc-backend-'+run+'-ABC123');
  return {run,projectId,repository,ownedRoot,
    compose:{name:projectId,services:{prometheus:{image:'pinned@sha256:'+sha('image'),read_only:true,
      cap_drop:['ALL'],ports:[],volumes:[ownedRoot.replaceAll('\\','/')+'/bundle/prometheus.yml:/etc/prometheus/roomqc.yml:ro'],
      labels:{owner:run,project:'roomqc-monitor-'+run}}},networks:{backend:{name:projectId+'-internal'}}},
    prometheus:{global:{scrape_interval:'5s'},scrape_configs:[{job_name:'roomqc-node',
      static_configs:[{targets:['node-exporter:9100'],labels:{cluster_id:'fixture-a',host_id:'managed-'+run}}]}]},
    target:{clusterId:'fixture-a',hostId:'managed-'+run,measurementScope:'docker-desktop-vm',
      dataMounts:[{id:'database',mountpoint:'/',fstype:'ext4',device:'/dev/root'}]},
    health:{schemaVersion:2,connectionBudget:{apiPoolMax:2,healthPoolMax:2,probePoolMax:2},intervalMs:30000}};
}

test('backend source binding covers actual runtime, directory, orchestrator and all monitoring sources, never private runtime files',async()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url)),binding=await captureBackendSourceBinding(root);
  assertBackendSourceBinding(binding,binding);
  assert.ok(requiredBackendSources.every(path=>binding.files.some(file=>file.path===path)));
  for(const path of ['server/control/Dockerfile','server/control/schema.sql','server/control/backend-source-binding.test.mjs','server/control/managed-backend-harness.test.mjs',
    'scripts/build-realtime.mjs','deploy/realtime/Dockerfile','deploy/realtime/bootstrap.exs','deploy/realtime/extensions.ex','deploy/realtime/pool-guard.sql','deploy/realtime/compose.yml',
    'server/control/monitoring-config.mjs','server/control/telemetry-source.mjs','scripts/control-backend-advisors.mjs',
    'scripts/control-summary-credential.mjs','scripts/control-summary-credential-rotation.mjs','deploy/monitoring/summary-rotation.example.json'])
    assert.ok(binding.files.some(file=>file.path===path),path);
  assert.ok(binding.files.every(file=>!/(?:\.env|ownership\.json|keyring|\.local\/|node_modules\/)/.test(file.path)));
});

test('source binding is portable across roots, CRLF/LF and directory enumeration order',async t=>{
  const a=await fixture(t),b=await fixture(t);
  for(const path of [...requiredBackendSources].reverse())await writeFile(join(b,path),'fixture '+path+'\r\n');
  const first=await captureBackendSourceBinding(a),second=await captureBackendSourceBinding(b);
  assert.deepEqual(first,second);assertBackendSourceBinding(first,second);
  await writeFile(join(b,'scripts/.env'),'NOT_A_SOURCE');await mkdir(join(b,'server/control/node_modules'));
  await writeFile(join(b,'server/control/node_modules/private.mjs'),'NOT_A_SOURCE');
  assertBackendSourceBinding(first,await captureBackendSourceBinding(b));
});

test('runtime, package, migration, contract, renderer, compose, query and orchestrator mutations each invalidate the build',async t=>{
  const root=await fixture(t),original=await captureBackendSourceBinding(root);
  for(const path of ['server/control/Dockerfile','server/control/schema.sql','server/control/workers/health-runtime.mjs','server/control/probe-credentials.mjs',
    'scripts/build-realtime.mjs','deploy/realtime/Dockerfile','deploy/realtime/bootstrap.exs','deploy/realtime/extensions.ex','deploy/realtime/pool-guard.sql','deploy/realtime/compose.yml',
    'server/control/package-lock.json','package-lock.json','server/control/migrations/0008-health-proof-fencing.sql',
    'server/control/migrations/0009-probe-credential-disable.sql',
    'server/control/testing/metrics-response-relay.mjs',
    'server/control/contracts/control-v3.openapi.json','scripts/render-monitoring-config.mjs',
    'scripts/control-backend-managed-health.mjs','scripts/control-backend-source-binding.mjs',
    'scripts/test-control-backend-sandbox.mjs','scripts/control-summary-credential.mjs',
    'scripts/control-summary-credential-rotation.mjs','deploy/monitoring/summary-rotation.example.json','deploy/monitoring/compose.yml',
    'deploy/monitoring/health-worker.managed.compose.yml','deploy/monitoring/queries.yml','deploy/monitoring/exporter-roles.sql']){
    const before=await readFile(join(root,path));await writeFile(join(root,path),Buffer.concat([before,Buffer.from('delta\n')]));
    const changed=await captureBackendSourceBinding(root);
    assert.throws(()=>assertBackendSourceBinding(original,changed),{code:'BACKEND_SOURCE_DRIFT'},path);
    await writeFile(join(root,path),before);assertBackendSourceBinding(original,await captureBackendSourceBinding(root));
  }
});

test('missing mandatory files fail capture; adding or omitting another source cannot silently reuse earlier evidence',async t=>{
  const root=await fixture(t),original=await captureBackendSourceBinding(root),path='server/control/extra-runtime.mjs';
  await writeFile(join(root,path),'extra\n');const added=await captureBackendSourceBinding(root);
  assert.throws(()=>assertBackendSourceBinding(original,added),{code:'BACKEND_SOURCE_DRIFT'});
  await unlink(join(root,path));assert.throws(()=>assertBackendSourceBinding(added,original),{code:'BACKEND_SOURCE_DRIFT'});
  await unlink(join(root,'server/control/workers/health-runtime.mjs'));
  await assert.rejects(captureBackendSourceBinding(root),{code:'ENOENT'});
});

test('binding validation rejects omitted mandatory entries, reordered/duplicated manifests, tampering and unknown formats',async t=>{
  const binding=await captureBackendSourceBinding(await fixture(t));
  const changes=[undefined,{...binding,version:2},{...binding,sha256:'0'.repeat(64)},
    {...binding,files:[...binding.files].reverse()},{...binding,files:[binding.files[0],...binding.files]},
    {...binding,unexpected:'not permitted'}];
  const omitted=clone(binding);omitted.files=omitted.files.filter(item=>item.path!=='server/control/workers/health-runtime.mjs');
  omitted.sha256=sha(omitted.files.map(({path,sha256})=>path+'\0'+sha256+'\0').join(''));changes.push(omitted);
  for(const value of changes)assert.throws(()=>assertBackendSourceBinding(value,binding),{code:'BACKEND_SOURCE_BINDING_INVALID'});
});

test('source capture rejects directory junctions instead of following them to different sources',async t=>{
  const root=await fixture(t),workers=join(root,'server/control/workers'),moved=join(root,'owned-workers');
  await rename(workers,moved);await symlink(moved,workers,process.platform==='win32'?'junction':'dir');
  await assert.rejects(captureBackendSourceBinding(root),{code:'BACKEND_SOURCE_LINK_FORBIDDEN'});
});

test('rendered monitoring binding ignores only exact fixture identity/root variations, preserving semantic config',()=>{
  const a=managedMonitoringBinding(renderInput()),b=managedMonitoringBinding(renderInput('abcdef123456','b'));
  assert.deepEqual(a,b);assertManagedMonitoringBinding(a,b);
  const reordered=renderInput();reordered.health={intervalMs:30000,connectionBudget:{probePoolMax:2,healthPoolMax:2,apiPoolMax:2},schemaVersion:2};
  assertManagedMonitoringBinding(a,managedMonitoringBinding(reordered));
});

test('rendered image, permissions, networking, config mounts, metrics, target and total pool changes cannot compare equal',()=>{
  const original=managedMonitoringBinding(renderInput());
  const mutations=[
    i=>{i.compose.services.prometheus.image='other@sha256:'+sha('other')},
    i=>{i.compose.services.prometheus.read_only=false},i=>{i.compose.services.prometheus.cap_drop=[]},
    i=>{i.compose.services.prometheus.ports=['9090:9090']},
    i=>{i.compose.services.prometheus.volumes=['/different/prometheus.yml:/etc/prometheus/roomqc.yml:ro']},
    i=>{i.compose.networks.backend.name='other-network'},i=>{i.prometheus.global.scrape_interval='30s'},
    i=>{i.prometheus.scrape_configs[0].static_configs[0].labels.cluster_id='other-cluster'},
    i=>{i.target.dataMounts[0].device='/dev/other'},i=>{i.target.measurementScope='linux-host'},
    i=>{i.health.connectionBudget.probePoolMax=8},i=>{i.health.intervalMs=5000}
  ];
  for(const mutate of mutations){const input=renderInput();mutate(input);
    assert.throws(()=>assertManagedMonitoringBinding(original,managedMonitoringBinding(input)),{code:'MANAGED_RENDER_DRIFT'});}
});

test('render binding rejects foreign or broad ownership context and incomplete/tampered digests',()=>{
  for(const mutate of [i=>{i.ownedRoot=join(i.repository,'.local')},i=>{i.ownedRoot=join(i.repository,'outside','owned')},
    i=>{i.ownedRoot=join(i.ownedRoot,'nested')},i=>{i.projectId='foreign'},i=>{i.run='not-a-run'},i=>{i.compose=null}]){
    const input=renderInput();mutate(input);assert.throws(()=>managedMonitoringBinding(input));
  }
  const binding=managedMonitoringBinding(renderInput());
  for(const invalid of [undefined,{...binding,version:2},{...binding,healthSha256:undefined},
    {...binding,composeSha256:'0'.repeat(64)},{...binding,unexpected:'not permitted'}])
    assert.throws(()=>assertManagedMonitoringBinding(invalid,binding),{code:'MANAGED_RENDER_BINDING_INVALID'});
});

async function referenceFixture(t){
  const repository=await fixture(t),sourceBinding=await captureBackendSourceBinding(repository),run='123456789abc',
    root=join(repository,'.local','roomqc-backend-'+run+'-ABC123'),file=join(root,'ownership.json');
  await mkdir(root,{recursive:true});
  const previous={run,root,projectId:'roomqc-probe-'+run,cleaned:true,diagnosticOnly:false,fullIntegratedRun:true,
    phase:'permission_controls_verified',sourceBindingVerifiedAtEnd:true,sourceBinding,
    managedHealth:{verified:true,renderedConfigurationUnchanged:true,fullTimedDrillExecuted:true,
      credentialMutation:{verified:true,actualMetricsOverlap:true,fencedAtHealthCommit:true},
      policyTargetMutation:{verified:true,actualMetricsOverlap:true,actualAdminCommands:true,readonlyConfigRestartVerified:true},
      releaseCatalogMutation:{verified:true,actualMetricsOverlap:true,actualManifestTransport:true,actualAdminCommand:true,
        oldWorkerNextCycleRejected:true,installerRebindVerified:true,readonlyCatalogRestartVerified:true,
        functionsDeploymentVerified:true,allFiveServiceRecoveryVerified:true},
      functionsDeployment:{verified:true,onlyReleaseEnvironmentChanged:true,imageUnchanged:true,effectiveComposeRetained:true}},
    managedMonitoringBinding:managedMonitoringBinding(renderInput())};
  await writeFile(file,JSON.stringify(previous));return {repository,file,sourceBinding,previous};
}

test('independent build preflight reads only a complete owned reference and rejects incomplete or diagnostic runs',async t=>{
  const f=await referenceFixture(t);
  assert.deepEqual(await readBackendBuildReference(f),f.previous);
  for(const mutate of [p=>{p.cleaned=false},p=>{p.failed=true},p=>{p.cleanupFailed=true},
    p=>{p.diagnosticOnly=true},p=>{p.fullIntegratedRun=false},p=>{p.phase='managed_health'},
    p=>{p.sourceBindingVerifiedAtEnd=false},p=>{p.managedHealth.verified=false},
    p=>{p.managedHealth.fullTimedDrillExecuted=false},p=>{delete p.managedHealth.credentialMutation},
    p=>{p.managedHealth.credentialMutation.actualMetricsOverlap=false},p=>{p.managedHealth.credentialMutation.fencedAtHealthCommit=false},
    p=>{delete p.managedHealth.policyTargetMutation},p=>{p.managedHealth.policyTargetMutation.verified=false},
    p=>{p.managedHealth.policyTargetMutation.actualMetricsOverlap=false},p=>{p.managedHealth.policyTargetMutation.actualAdminCommands=false},
    p=>{p.managedHealth.policyTargetMutation.readonlyConfigRestartVerified=false},
    p=>{delete p.managedHealth.releaseCatalogMutation},p=>{p.managedHealth.releaseCatalogMutation.verified=false},
    p=>{p.managedHealth.releaseCatalogMutation.actualMetricsOverlap=false},p=>{p.managedHealth.releaseCatalogMutation.actualManifestTransport=false},
    p=>{p.managedHealth.releaseCatalogMutation.actualAdminCommand=false},p=>{p.managedHealth.releaseCatalogMutation.oldWorkerNextCycleRejected=false},
    p=>{p.managedHealth.releaseCatalogMutation.installerRebindVerified=false},p=>{p.managedHealth.releaseCatalogMutation.readonlyCatalogRestartVerified=false},
    p=>{p.managedHealth.releaseCatalogMutation.functionsDeploymentVerified=false},p=>{p.managedHealth.releaseCatalogMutation.allFiveServiceRecoveryVerified=false},
    p=>{delete p.managedHealth.functionsDeployment},p=>{p.managedHealth.functionsDeployment.verified=false},
    p=>{p.managedHealth.functionsDeployment.onlyReleaseEnvironmentChanged=false},p=>{p.managedHealth.functionsDeployment.imageUnchanged=false},
    p=>{p.managedHealth.functionsDeployment.effectiveComposeRetained=false},
    p=>{p.managedHealth.renderedConfigurationUnchanged=false},p=>{p.projectId='foreign'},p=>{p.root=dirname(p.root)}]){
    const previous=clone(f.previous);mutate(previous);await writeFile(f.file,JSON.stringify(previous));
    await assert.rejects(readBackendBuildReference(f),{code:'BACKEND_BUILD_REFERENCE_INVALID'});
  }
});

test('independent build preflight rejects source drift and missing rendered evidence before running a backend',async t=>{
  const f=await referenceFixture(t);
  await writeFile(join(f.repository,'scripts/control-backend-managed-health.mjs'),'different orchestrator\n');
  await assert.rejects(readBackendBuildReference({...f,sourceBinding:await captureBackendSourceBinding(f.repository)}),{code:'BACKEND_SOURCE_DRIFT'});
  const previous=clone(f.previous);delete previous.managedMonitoringBinding;await writeFile(f.file,JSON.stringify(previous));
  await assert.rejects(readBackendBuildReference(f),{code:'MANAGED_RENDER_BINDING_INVALID'});
});

test('independent build preflight refuses foreign paths and junctions even if the receipt contents appear valid',async t=>{
  const f=await referenceFixture(t),outside=join(f.repository,'outside');await mkdir(outside);
  await writeFile(join(outside,'ownership.json'),JSON.stringify(f.previous));
  await assert.rejects(readBackendBuildReference({...f,file:join(outside,'ownership.json')}),{code:'BACKEND_BUILD_REFERENCE_INVALID'});
  await assert.rejects(readBackendBuildReference({...f,file:join(dirname(f.file),'other.json')}),{code:'BACKEND_BUILD_REFERENCE_INVALID'});
  const oldRoot=dirname(f.file),moved=join(f.repository,'moved-owned-reference');await rename(oldRoot,moved);
  await symlink(moved,oldRoot,process.platform==='win32'?'junction':'dir');
  await assert.rejects(readBackendBuildReference(f),{code:'BACKEND_BUILD_REFERENCE_INVALID'});
});

test('actual monitoring renderer and Docker Compose bind independent owned configurations without creating resources',
  {skip:process.env.ROOMQC_CONTROL_DB_TEST!=='true',timeout:60000},async t=>{
    const repository=await fixture(t),actual=fileURLToPath(new URL('../../',import.meta.url));
    for(const path of ['deploy/monitoring/compose.yml','deploy/monitoring/queries.yml'])
      await writeFile(join(repository,path),await readFile(join(actual,path)));
    const render=async()=>{
      const run=randomBytes(6).toString('hex'),projectId='roomqc-probe-'+run,
        ownedRoot=join(repository,'.local','roomqc-backend-'+run+'-ABC123'),output=join(ownedRoot,'bundle'),
        secrets=join(ownedRoot,'secrets'),tls=join(ownedRoot,'tls');
      await mkdir(secrets,{recursive:true});await mkdir(tls);
      for(const [name,value]of Object.entries({'postgres-user':'roomqc_monitor','postgres-password':randomBytes(32).toString('hex'),
        'postgres-uri':'fixture-db:5432/fixture?sslmode=disable&connect_timeout=3'})){
        const path=join(secrets,name);await writeFile(path,value,{mode:0o640});
        if(process.platform!=='win32'){await chmod(path,0o640);await chown(path,65534,65534)}
      }
      const target={clusterId:'fixture-a',hostId:'managed-'+run,environment:'local',dbConnectionBudget:100,
        measurementScope:process.platform==='win32'?'docker-desktop-vm':'linux-host',
        dataMounts:[{id:'database',mountpoint:'/',fstype:'ext4',device:'/dev/root'}]},targetFile=join(ownedRoot,'target.json');
      await writeFile(targetFile,JSON.stringify(target));
      const rendered=await renderMonitoring({target:targetFile,output,secrets,tls,network:projectId+'-internal',project:'roomqc-monitor-'+run});
      assert.equal(rendered.deployPerformed,false);
      const compose=JSON.parse(execFileSync('docker',['compose','--env-file',join(output,'monitor.env'),
        '-f',join(repository,'deploy/monitoring/compose.yml'),'config','--format','json'],
      {encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,windowsHide:true,stdio:['ignore','pipe','pipe']}));
      const input={repository,ownedRoot,run,projectId,compose,prometheus:JSON.parse(await readFile(join(output,'prometheus.yml'),'utf8')),
        target:JSON.parse(await readFile(targetFile,'utf8')),health:managedHealthFixture(target)};
      assert.equal(compose.services.prometheus.read_only,true);assert.equal(compose.services.prometheus.ports,undefined);
      assert.equal(compose.services['postgres-exporter'].environment.DATA_SOURCE_PASS_FILE,'/run/secrets/postgres-password');
      return {input,binding:managedMonitoringBinding(input),output};
    };
    const a=await render(),b=await render();assert.notEqual(a.input.run,b.input.run);
    assertManagedMonitoringBinding(a.binding,b.binding);
    b.input.compose.services.prometheus.read_only=false;
    assert.throws(()=>assertManagedMonitoringBinding(a.binding,managedMonitoringBinding(b.input)),{code:'MANAGED_RENDER_DRIFT'});
    b.input.compose.services.prometheus.read_only=true;
    b.input.prometheus.global.scrape_interval='30s';
    await writeFile(join(b.output,'prometheus.yml'),JSON.stringify(b.input.prometheus));
    b.input.prometheus=JSON.parse(await readFile(join(b.output,'prometheus.yml'),'utf8'));
    assert.throws(()=>assertManagedMonitoringBinding(a.binding,managedMonitoringBinding(b.input)),{code:'MANAGED_RENDER_DRIFT'});
    t.diagnostic('Two real renders/Compose config resolutions matched; permission and actual rendered-file drift rejected. No containers, database or admission opened.');
  });
