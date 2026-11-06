// Repeatability evidence only: source/config digests, never credentials or logs.
import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute,resolve,dirname,basename} from 'node:path';

const sha=value=>createHash('sha256').update(value).digest('hex');
const invalid=code=>Object.assign(new Error(code),{code});
const hashPattern=/^[a-f0-9]{64}$/;
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export const requiredBackendSources=Object.freeze([
  'package.json','package-lock.json','server/control/package.json','server/control/package-lock.json','server/control/Dockerfile','server/control/schema.sql',
  'scripts/build-realtime.mjs','deploy/realtime/Dockerfile','deploy/realtime/bootstrap.exs','deploy/realtime/pool-guard.sql','deploy/realtime/extensions.ex','deploy/realtime/database.ex','deploy/realtime/runtime.exs','deploy/realtime/tenant-migrations.ex','deploy/realtime/compose.yml',
  'server/control/app.mjs','server/control/admin.mjs','server/control/config.mjs','server/control/migrate.mjs',
  'server/control/health-policy.mjs','server/control/health-evidence.mjs','server/control/probe-credentials.mjs',
  'server/control/probe-secrets.mjs','server/control/probe-session.mjs','server/control/service-probes.mjs',
  'server/control/release-validation.mjs','server/control/release-manifest.mjs','server/control/telemetry.mjs',
  'server/control/telemetry-source.mjs','server/control/safe-http.mjs','server/control/safe-websocket.mjs',
  'server/control/workers/health-config.mjs','server/control/workers/health-probes.mjs',
  'server/control/workers/health-runtime.mjs','server/control/workers/health-worker.mjs',
  'server/control/migrations/0007-probe-credentials.sql','server/control/migrations/0008-health-proof-fencing.sql',
  'server/control/migrations/0009-probe-credential-disable.sql',
  'server/control/contracts/control-v3.openapi.json',
  'scripts/test-control-backend-sandbox.mjs','scripts/control-backend-source-binding.mjs',
  'scripts/control-backend-ssh-deployment.mjs','scripts/control-backend-ssh-queue.mjs',
  'scripts/test-management-bundle-local.mjs','scripts/roomqc-management-bundle.mjs','scripts/roomqc-management-bootstrap.mjs','deploy/control/management-nginx.conf',
  'scripts/roomqc-management-install.mjs','scripts/lib/management-install-remote.mjs',
  'server/control/management-registry.mjs','server/control/management-install-plan.mjs','server/control/management-install-assets.mjs',
  'deploy/control/management.example.json','deploy/control/management-install.example.json','deploy/control/management-bootstrap.example.json',
  'scripts/control-setup-backfill.mjs','deploy/monitoring/setup-backfill.example.json',
  'deploy/control-resource-budget.example.json',
  'scripts/control-setup-backfill-apply.mjs','deploy/monitoring/setup-backfill-apply.example.json',
  'scripts/control-setup-credential.mjs',
  'scripts/control-setup-credential-rotation.mjs','deploy/monitoring/setup-rotation.example.json',
  'scripts/control-summary-credential.mjs','scripts/control-summary-credential-rotation.mjs',
  'deploy/monitoring/summary-rotation.example.json',
  'deploy/monitoring/summary-installer.template.json',
  'server/control/testing/setup-installer-faultfs.c','deploy/testing/installer-faultfs.Dockerfile',
  'scripts/control-backend-managed-client.mjs','scripts/control-backend-managed-health.mjs',
  'server/control/testing/metrics-response-relay.mjs',
  'scripts/control-backend-service-setup.mjs','scripts/render-monitoring-config.mjs',
  'deploy/monitoring/compose.yml','deploy/monitoring/health-worker.compose.yml',
  'deploy/monitoring/health-worker.managed.compose.yml','deploy/monitoring/queries.yml',
  'deploy/monitoring/host-observer.Dockerfile','deploy/monitoring/host-observer.compose.yml',
  'scripts/roomqc-host-observer.mjs','scripts/roomqc-vps-preflight.mjs',
  'scripts/roomqc-vps-deploy.mjs','scripts/roomqc-vps-executor.mjs','scripts/roomqc-vps-config.mjs',
  'scripts/lib/vps-release-remote.mjs','scripts/lib/deployment-environment-remote.mjs',
  'deploy/executor/Dockerfile','deploy/executor/Dockerfile.ssh-test',
  'scripts/test-host-observer-service-local.mjs',
  'deploy/monitoring/exporter-roles.sql',
  'deploy/booking-notifications/compose.yml','deploy/booking-notifications/push.compose.yml',
  'deploy/booking-notifications/telegram.compose.yml'
]);
const sourceSetHash=files=>sha(files.map(({path,sha256})=>path+'\0'+sha256+'\0').join(''));
const sourcePath=path=>requiredBackendSources.includes(path)
  ||/^server\/control\/(?!.*(?:^|\/)(?:node_modules|\.git|\.local)(?:\/|$)).+\.mjs$/.test(path)
  ||/^server\/control\/migrations\/[^/]+\.sql$/.test(path)
  ||/^scripts\/control-backend-[a-z0-9-]+\.mjs$/.test(path)
  ||path==='scripts/control-api-login-retire.mjs'||path==='scripts/control-directory-runtime-logins.mjs'||path==='scripts/control-directory-runtime-wiring.mjs'
  ||/^deploy\/monitoring\/[a-z0-9][a-z0-9.-]*\.(?:yml|yaml|sql)$/.test(path);

export async function captureBackendSourceBinding(repository){
  const root=await realpath(repository),paths=new Set(requiredBackendSources);
  const walk=async(directory,recursive)=>{
    for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
      if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
      const path=directory+'/'+entry.name;
      if(entry.isSymbolicLink())throw invalid('BACKEND_SOURCE_LINK_FORBIDDEN');
      if(entry.isDirectory()){if(recursive)await walk(path,true)}
      else if(sourcePath(path))paths.add(path);
    }
  };
  await walk('server/control',true);await walk('scripts',false);await walk('deploy/monitoring',false);
  if(paths.size>2048)throw invalid('BACKEND_SOURCE_LIMIT');
  const files=[];
  for(const path of [...paths].sort()){
    // Check every segment, not only the leaf: a directory junction must not
    // redirect an apparently approved file into a private/external location.
    let current=root;
    for(const segment of path.split('/')){
      current=join(current,segment);
      if((await lstat(current)).isSymbolicLink())throw invalid('BACKEND_SOURCE_LINK_FORBIDDEN');
    }
    const actual=await realpath(current),inside=relative(root,actual),info=await lstat(actual);
    if(!inside||inside.startsWith('..')||isAbsolute(inside)||!info.isFile()||info.size>4*1024*1024)
      throw invalid('BACKEND_SOURCE_INVALID');
    const bytes=await readFile(actual);
    if(bytes.length>4*1024*1024)throw invalid('BACKEND_SOURCE_LIMIT');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n');
    files.push({path,sha256:sha(text)});
  }
  return {version:1,algorithm:'sha256-path-lf-v1',files,sha256:sourceSetHash(files)};
}
function validSourceBinding(value){
  if(value?.version!==1||value.algorithm!=='sha256-path-lf-v1'||!Array.isArray(value.files)
    ||Object.keys(value).sort().join(',')!=='algorithm,files,sha256,version'
    ||value.files.length<requiredBackendSources.length||value.files.length>2048||!hashPattern.test(value.sha256))return false;
  let previous='';
  for(const item of value.files){
    if(!item||Object.keys(item).sort().join(',')!=='path,sha256'||typeof item.path!=='string'
      ||item.path<=previous||!sourcePath(item.path)||item.path.split('/').some(part=>part==='..'||part==='.')
      ||!hashPattern.test(item.sha256))return false;
    previous=item.path;
  }
  return requiredBackendSources.every(path=>value.files.some(item=>item.path===path))
    &&sourceSetHash(value.files)===value.sha256;
}
export function assertBackendSourceBinding(expected,actual){
  if(!validSourceBinding(expected)||!validSourceBinding(actual))throw invalid('BACKEND_SOURCE_BINDING_INVALID');
  if(canonical(expected)!==canonical(actual))throw invalid('BACKEND_SOURCE_DRIFT');
}

export function managedMonitoringBinding({compose,prometheus,target,health,repository,ownedRoot,run,projectId}){
  if(!/^[a-f0-9]{12}$/.test(run??'')||projectId!=='roomqc-probe-'+run||!isAbsolute(repository)||!isAbsolute(ownedRoot)
    ||dirname(resolve(ownedRoot))!==resolve(repository,'.local')
    ||!new RegExp('^roomqc-backend-'+run+'-[a-zA-Z0-9]+$').test(basename(ownedRoot)))
    throw invalid('MANAGED_RENDER_CONTEXT_INVALID');
  const replacements=[
    [ownedRoot,'$OWNED_ROOT'],[ownedRoot.replaceAll('\\','/'),'$OWNED_ROOT'],
    [repository,'$REPOSITORY'],[repository.replaceAll('\\','/'),'$REPOSITORY'],
    [projectId,'$PROJECT'],['roomqc-monitor-'+run,'$MONITOR_PROJECT'],['managed-'+run,'$HOST']
  ];
  const normalize=value=>{
    if(typeof value==='string'){
      if(value===run)return '$RUN';
      for(const [from,to]of replacements)value=value.split(from).join(to);
      return value;
    }
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]));
    return value;
  };
  const hashes={};
  for(const [name,value]of Object.entries({compose,prometheus,target,health})){
    if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('MANAGED_RENDER_INPUT_INVALID');
    hashes[name+'Sha256']=sha(canonical(normalize(value)));
  }
  return {version:1,algorithm:'sha256-owned-render-v1',...hashes,sha256:sha(canonical(hashes))};
}
export function assertManagedMonitoringBinding(expected,actual){
  const validate=value=>{
    if(value?.version!==1||value.algorithm!=='sha256-owned-render-v1'
      ||Object.keys(value).sort().join(',')!=='algorithm,composeSha256,healthSha256,prometheusSha256,sha256,targetSha256,version')return false;
    const keys=['composeSha256','prometheusSha256','targetSha256','healthSha256'];
    return keys.every(key=>hashPattern.test(value[key]))
      &&sha(canonical(Object.fromEntries(keys.map(key=>[key,value[key]]))))===value.sha256;
  };
  if(!validate(expected)||!validate(actual))throw invalid('MANAGED_RENDER_BINDING_INVALID');
  if(canonical(expected)!==canonical(actual))throw invalid('MANAGED_RENDER_DRIFT');
}

export async function readBackendBuildReference({repository,file,sourceBinding}){
  const root=await realpath(repository),resolved=resolve(file),ownedRoot=dirname(resolved),run=basename(ownedRoot).match(/^roomqc-backend-([a-f0-9]{12})-[a-zA-Z0-9]+$/)?.[1];
  if(!run||basename(resolved)!=='ownership.json'||dirname(ownedRoot)!==join(root,'.local'))
    throw invalid('BACKEND_BUILD_REFERENCE_INVALID');
  for(const path of [join(root,'.local'),ownedRoot,resolved]){
    if((await lstat(path)).isSymbolicLink())throw invalid('BACKEND_BUILD_REFERENCE_INVALID');
  }
  const info=await lstat(resolved);
  if(!info.isFile()||info.size>8*1024*1024)throw invalid('BACKEND_BUILD_REFERENCE_INVALID');
  const bytes=await readFile(resolved);
  if(bytes.length>8*1024*1024)throw invalid('BACKEND_BUILD_REFERENCE_INVALID');
  let previous;try{previous=JSON.parse(bytes)}catch{throw invalid('BACKEND_BUILD_REFERENCE_INVALID')}
  if(previous?.run!==run||previous.projectId!=='roomqc-probe-'+run||previous.root!==ownedRoot
    ||previous.cleaned!==true||previous.failed===true||previous.cleanupFailed===true
    ||previous.diagnosticOnly!==false||previous.fullIntegratedRun!==true||previous.phase!=='permission_controls_verified'
    ||previous.sourceBindingVerifiedAtEnd!==true||previous.managedHealth?.verified!==true
    ||previous.managedHealth?.fullTimedDrillExecuted!==true||previous.managedHealth?.credentialMutation?.verified!==true
    ||previous.managedHealth?.credentialMutation?.actualMetricsOverlap!==true
    ||previous.managedHealth?.credentialMutation?.fencedAtHealthCommit!==true
    ||previous.managedHealth?.policyTargetMutation?.verified!==true
    ||previous.managedHealth?.policyTargetMutation?.actualMetricsOverlap!==true
    ||previous.managedHealth?.policyTargetMutation?.actualAdminCommands!==true
    ||previous.managedHealth?.policyTargetMutation?.readonlyConfigRestartVerified!==true
    ||previous.managedHealth?.releaseCatalogMutation?.verified!==true
    ||previous.managedHealth?.releaseCatalogMutation?.actualMetricsOverlap!==true
    ||previous.managedHealth?.releaseCatalogMutation?.actualManifestTransport!==true
    ||previous.managedHealth?.releaseCatalogMutation?.actualAdminCommand!==true
    ||previous.managedHealth?.releaseCatalogMutation?.oldWorkerNextCycleRejected!==true
    ||previous.managedHealth?.releaseCatalogMutation?.installerRebindVerified!==true
    ||previous.managedHealth?.releaseCatalogMutation?.readonlyCatalogRestartVerified!==true
    ||previous.managedHealth?.releaseCatalogMutation?.functionsDeploymentVerified!==true
    ||previous.managedHealth?.releaseCatalogMutation?.allFiveServiceRecoveryVerified!==true
    ||previous.managedHealth?.functionsDeployment?.verified!==true
    ||previous.managedHealth?.functionsDeployment?.onlyReleaseEnvironmentChanged!==true
    ||previous.managedHealth?.functionsDeployment?.imageUnchanged!==true
    ||previous.managedHealth?.functionsDeployment?.effectiveComposeRetained!==true
    ||previous.managedHealth?.renderedConfigurationUnchanged!==true)throw invalid('BACKEND_BUILD_REFERENCE_INVALID');
  assertBackendSourceBinding(previous.sourceBinding,sourceBinding);
  assertManagedMonitoringBinding(previous.managedMonitoringBinding,previous.managedMonitoringBinding);
  return previous;
}
