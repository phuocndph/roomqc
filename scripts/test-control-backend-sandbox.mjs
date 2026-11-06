// Owned official self-hosted bundle. No published ports, provider keys, business
// project or CLI start. All application SQL runs on an internal Docker network.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,readdir,realpath} from 'node:fs/promises';
import {dirname,join,resolve,basename,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configureStorageResourceFixture,storageResourceFixturePlan} from './control-backend-storage-resource.mjs';
import {configureRealtimeResourceFixture,runRealtimeResourceDiagnostic} from './control-backend-realtime-resource.mjs';
import {prepareRealtimeImage} from './build-realtime.mjs';
import {runRealtimeBootstrapDiagnostic} from './control-backend-realtime-bootstrap.mjs';
import {configureRealtimeTlsFixture,runRealtimeTlsDiagnostic} from './control-backend-realtime-tls.mjs';
import {configureCustomerJourneyFixture,runCustomerJourneyDiagnostic} from './control-backend-customer-journey.mjs';
import {runManagementInstallerJourneyLocal} from './control-backend-management-installer.mjs';
import {runBackendBusinessMigration} from './control-backend-business-migration.mjs';
import {preparePackagedJourneyFunctions} from './control-backend-functions-image.mjs';
import {prepareBackendSshDeployment,backendContainerArguments} from './control-backend-ssh-deployment.mjs';
import {browserFixtureOrigin,runBrowserJourneyDiagnostic} from './control-backend-browser-journey.mjs';
import {runBackendAdvisors} from './control-backend-advisors.mjs';
import {setupNetBoundaryCatalogSql,rehearseSetupNetBoundary} from './control-backend-setup-net-boundary.mjs';
import {captureAccessCatalog} from './control-backend-access-audit.mjs';
import {buildActorSessionChecks} from './control-backend-actor-session-checks.mjs';
import {buildRegistrationSessionChecks} from './control-backend-registration-sessions.mjs';
import {buildEmailReadyChecks} from './control-backend-email-ready-checks.mjs';
import {buildNoPolicyChecks,noPolicyFailureCodes} from './control-backend-no-policy-checks.mjs';
import {buildParentBoundaryChecks,parentBoundaryFailureCodes} from './control-backend-parent-boundary-checks.mjs';
import {preparePasswordAuth} from './control-backend-password-auth.mjs';
import {prepareInstallerFaultFilesystemImage} from './control-backend-installer-faultfs-image.mjs';
import {prepareSetupRuntimeMount} from './control-backend-setup-mount.mjs';
import {prepareSummaryRuntimeMount} from './control-backend-summary-mount.mjs';
import {runAdviceInterruption} from './control-backend-advice-interruption-runner.mjs';
import {checkManagedClientLinkage,prepareManagedExporterRole,runManagedHealthDrill} from './control-backend-managed-health.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding,assertManagedMonitoringBinding,readBackendBuildReference} from './control-backend-source-binding.mjs';
import {readLegacyBackendReference} from './control-backend-legacy-reference.mjs';
import {transform,build,version as esbuildVersion} from 'esbuild';

const repository=fileURLToPath(new URL('../',import.meta.url));
const releaseTag='self-hosted/v0.8.3',releaseCommit='bc27d2661edd09a5d0b8d76ce33da6d4071a756e';
const ownerLabel='roomqc.control-backend-test',core=['db','auth','rest','realtime','storage','imgproxy','api-gw'];
const joseVersion='6.2.12';
const emit=(event,data={})=>process.stdout.write(JSON.stringify({event,...data})+'\n');
function run(command,args,{cwd=repository,input,env=process.env,timeout=30000,signal,onStdout}={}){
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{cwd,env,signal,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const out=[],err=[];let bytes=0,overflow=false,callbackFailure=false,timedOut=false;const started=Date.now();
    const timer=setTimeout(()=>{timedOut=true;child.kill()},timeout);timer.unref();
    const capture=(list,chunk)=>{bytes+=chunk.length;if(bytes>16*1024*1024){overflow=true;child.kill()}else list.push(chunk)};
    child.stdout.on('data',chunk=>{capture(out,chunk);try{onStdout?.(chunk)}catch{callbackFailure=true;child.kill()}});child.stderr.on('data',chunk=>capture(err,chunk));
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('close',(code,signal)=>{clearTimeout(timer);const result={code,signal,timedOut,elapsedMs:Date.now()-started,
      stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()};
      if(code!==0||timedOut||overflow||callbackFailure){const error=new Error('Owned backend command failed; output retained privately');error.result=result;reject(error)}else resolvePromise(result)});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
const docker=(args,options)=>run('docker',args,options);
async function secureDirectory(root){
  if(process.platform!=='win32')return;
  const sid=(await run('whoami',['/user','/fo','csv','/nh'])).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid);
  await run('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
}
async function objects(state){
  const result=[];
  for(const kind of ['container','volume','network']){
    const names=(await docker([kind,'ls',...(kind==='container'?['-a']:[]),'--filter','label='+ownerLabel+'='+state.run,
      '--format',kind==='container'?'{{.Names}}':'{{.Name}}'])).stdout.trim().split(/\r?\n/).filter(Boolean);
    for(const name of names){
      const info=JSON.parse((await docker([kind,'inspect',name])).stdout)[0];const labels=kind==='container'?info.Config.Labels:info.Labels;
      assert.equal(labels?.[ownerLabel],state.run);assert.equal(labels?.['com.docker.compose.project'],state.projectId);
      assert.ok(name.startsWith(state.projectId+'-')||name.startsWith(state.projectId+'_'));
      result.push({kind,name,info});
    }
  }
  return result;
}
async function cleanup(state){
  assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
  assert.equal(dirname(state.root),resolve(repository,'.local'));assert.ok(basename(state.root).startsWith('roomqc-backend-'+state.run+'-'));
  assert.equal(await realpath(state.root),state.root);const owned=await objects(state); // All checks precede deletion.
  for(const kind of ['container','volume','network'])for(const value of owned.filter(o=>o.kind===kind)){
    await docker(kind==='container'?['rm','-f',value.name]:[kind,'rm',value.name]);
  }
  assert.equal((await objects(state)).length,0);state.cleaned=true;emit('backend_sandbox_cleaned',{projectId:state.projectId,objects:owned.length});
}
async function sql(state,source,{privateDiagnostics=false,timeout=60000,databaseRole='postgres'}={}){
  assert.ok([60000,150000].includes(timeout),'Owned SQL timeout must use a bounded fixture allowance');
  assert.ok(['postgres','supabase_admin'].includes(databaseRole),'Only the owned maintenance role is allowed');
  return (await docker(backendContainerArguments(['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY='+(privateDiagnostics?'verbose':'sqlstate'),
    '-U',databaseRole,'-d','postgres'],state),{input:source,timeout})).stdout.trim();
}
async function capturePartitionCatalog(state){
  // Catalog only: no auth identities, business rows, credentials or object data.
  // Keep physical attnums alongside normalized shapes to explain vendor upgrade
  // history rather than weakening ACL/structural validation after a mismatch.
  const catalog=await sql(state,`WITH parent AS (SELECT to_regclass('realtime.messages') AS oid),
    relations AS (SELECT oid FROM parent UNION ALL SELECT inhrelid FROM pg_inherits JOIN parent ON inhparent=parent.oid)
    SELECT json_build_object('relations',(SELECT json_agg(json_build_object(
      'relation',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
      'acl',private.roomqc_sorted_acl(c.relacl),'columns',private.roomqc_partition_column_shape(c.oid),
      'physicalColumns',(SELECT json_agg(json_build_object('name',a.attname,'position',a.attnum,
        'local',a.attislocal,'inherited',a.attinhcount) ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'indexes',(SELECT json_agg(json_build_object('physicalKeys',x.indkey::text,
        'shape',private.roomqc_partition_index_shape(x.indexrelid)) ORDER BY x.indisprimary DESC,x.indexrelid)
        FROM pg_index x WHERE x.indrelid=c.oid)) ORDER BY c.relname)
      FROM relations r JOIN pg_class c ON c.oid=r.oid),
      'creatorDefaultAcl',(SELECT json_agg(json_build_object('creator',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'global'),
        'type',d.defaclobjtype,'acl',private.roomqc_sorted_acl(d.defaclacl)))
        FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
        WHERE d.defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN ('supabase_admin','supabase_realtime_admin'))));`);
  assert.ok(Array.isArray(JSON.parse(catalog).relations));
  await writeFile(join(state.root,'partition-catalog-private.json'),catalog,{mode:0o600});
  state.partitionCatalogHash=createHash('sha256').update(catalog).digest('hex');
}
async function prepareFunctions(state,vendor,bundle,privateRun){
  const directory=join(vendor,'docker','volumes','functions');
  const mainPath=join(directory,'main','index.ts'),original=await readFile(mainPath,'utf8');
  assert.equal(original.split("'jsr:@panva/jose@6'").length,2,'Expected official main import before pinning');
  const main=original.replace("'jsr:@panva/jose@6'","'jsr:@panva/jose@"+joseVersion+"'");
  await writeFile(mainPath,main);await mkdir(join(directory,'control-probe'));
  const code=[];
  for(const file of ['index.ts','handler.mjs']){
    const source=await readFile(join(repository,'supabase','functions','control-probe',file));
    await writeFile(join(directory,'control-probe',file),source,{flag:'wx'});code.push([file,createHash('sha256').update(source).digest('hex')]);
  }
  // Build has Internet access but no fixture env, keys, DB mounts or other networks.
  // Runtime starts from the eszip on the internal-only network with no egress.
  await privateRun('docker',['run','--rm','--name',state.projectId+'-functions-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/main/index.ts','--output','/functions/main.eszip','--timeout','120'],{timeout:150000});
  const eszip=await readFile(join(directory,'main.eszip'));assert.ok(eszip.length>1000);
  // Exercise the actual email-admin handler on the same pinned Edge runtime.
  // Build has no secrets; execution is internal-only with the provider disabled.
  const emailSources=[];
  for(const name of ['email-admin/index.ts','_shared/cors.ts','_shared/internalAuth.ts',
    '_shared/email/admin.ts','_shared/email/authorization.ts','_shared/email/config.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});await writeFile(target,source,{flag:'wx'});
    emailSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-email-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/email-admin/index.ts','--output','/functions/email-admin.eszip','--timeout','120'],{timeout:150000});
  const emailEszip=await readFile(join(directory,'email-admin.eszip'));assert.ok(emailEszip.length>1000);
  state.emailBuild={eszipHash:createHash('sha256').update(emailEszip).digest('hex'),sources:emailSources};
  bundle.services['email-admin-test']={...structuredClone(bundle.services.functions),container_name:state.projectId+'-email-admin-test',
    networks:{default:{aliases:['email-admin-test']}},
    environment:{...bundle.services.functions.environment,ROOMQC_EMAIL_PROVIDER:'disabled',ROOMQC_EMAIL_ENVIRONMENT:'local'},
    command:['start','--main-service','/home/deno/functions/email-admin.eszip']};
  // A second real Edge instance uses a bounded fixed-origin relay in the
  // installer client's gateway namespace. Synthetic provider configuration is
  // only for allowlist/enqueue tests: no consumer, delivery or Internet egress.
  bundle.services['email-admin-race-test']={...structuredClone(bundle.services['email-admin-test']),
    container_name:state.projectId+'-email-admin-race-test',networks:{default:{aliases:['email-admin-race-test']}},
    environment:{...bundle.services['email-admin-test'].environment,SUPABASE_URL:'http://api-gw:9080',
      ROOMQC_EMAIL_PROVIDER:'resend',RESEND_API_KEY:'fixture-only-not-a-provider-key',
      ROOMQC_EMAIL_TEST_RECIPIENTS:'email-admin@roomqc.invalid',ROOMQC_MAILPIT_URL:'http://api-gw:9'}};
  const lifecycleSources=[];
  for(const name of ['check-subscription-status/index.ts','_shared/subscription-atomic-worker.ts','_shared/cronAuth.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});await writeFile(target,source,{flag:'wx'});
    lifecycleSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-lifecycle-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/check-subscription-status/index.ts','--output','/functions/lifecycle.eszip','--timeout','120'],{timeout:150000});
  const lifecycleEszip=await readFile(join(directory,'lifecycle.eszip'));assert.ok(lifecycleEszip.length>1000);
  state.lifecycleBuild={eszipHash:createHash('sha256').update(lifecycleEszip).digest('hex'),sources:lifecycleSources};
  bundle.services['lifecycle-test']={...structuredClone(bundle.services.functions),container_name:state.projectId+'-lifecycle-test',
    networks:{default:{aliases:['lifecycle-test']}},environment:{...bundle.services.functions.environment,
      SUPABASE_URL:'http://api-gw:9081',CRON_SECRET:state.run+'-owned-cron-only',ROOMQC_EMAIL_PROVIDER:'disabled',
      ROOMQC_MAILPIT_URL:'http://api-gw:9'},command:['start','--main-service','/home/deno/functions/lifecycle.eszip']};
  const providerSources=[];
  for(const name of ['email-provider-webhook/index.ts','process-email-queue/index.ts',
    '_shared/email/webhook.ts','_shared/email/provider.ts','_shared/email/templates.ts',
    '_shared/email/admin.ts','_shared/email/authorization.ts','_shared/email/config.ts','_shared/internalAuth.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});
    try{await writeFile(target,source,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(target),source)}
    providerSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  const builds=[];
  for(const [name,entry]of [['provider-webhook','email-provider-webhook'],['provider-queue','process-email-queue']]){
    await privateRun('docker',['run','--rm','--name',state.projectId+'-'+name+'-build','--label',ownerLabel+'='+state.run,
      '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
      '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
      'bundle','--entrypoint','/functions/'+entry+'/index.ts','--output','/functions/'+name+'.eszip','--timeout','120'],{timeout:150000});
    const compiled=await readFile(join(directory,name+'.eszip'));assert.ok(compiled.length>1000);
    builds.push([name,createHash('sha256').update(compiled).digest('hex')]);
    bundle.services[name+'-test']={...structuredClone(bundle.services.functions),container_name:state.projectId+'-'+name+'-test',
      networks:{default:{aliases:[name+'-test']}},environment:{...bundle.services.functions.environment,
        SUPABASE_URL:'http://api-gw:9082',ROOMQC_EMAIL_PROVIDER:'mailpit',ROOMQC_EMAIL_ENVIRONMENT:'local',
        ROOMQC_MAILPIT_URL:'http://api-gw:9082',ROOMQC_EMAIL_WEBHOOK_SECRET:'whsec_'+Buffer.from('owned-provider-webhook-'+state.run).toString('base64'),
        ROOMQC_INTERNAL_FUNCTION_SECRET:'owned-provider-worker-'+state.run},
      command:['start','--main-service','/home/deno/functions/'+name+'.eszip']};
  }
  state.providerBuild={sources:providerSources,builds};
  const invitationSources=[];
  for(const name of ['staff-invitations/index.ts','create-user/index.ts','_shared/email/staff-invitations.ts','_shared/email/staff-invitation-context.ts',
    '_shared/email/staff-invitation-management.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});await writeFile(target,source,{flag:'wx'});
    invitationSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-invitation-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/staff-invitations/index.ts','--output','/functions/staff-invitation.eszip','--timeout','120'],{timeout:150000});
  const invitationEszip=await readFile(join(directory,'staff-invitation.eszip'));assert.ok(invitationEszip.length>1000);
  state.staffInvitationBuild={sources:[...emailSources,...invitationSources],eszipHash:createHash('sha256').update(invitationEszip).digest('hex')};
  bundle.services['staff-invitation-test']={...structuredClone(bundle.services.functions),container_name:state.projectId+'-staff-invitation-test',
    networks:{default:{aliases:['staff-invitation-test']}},
    environment:{...bundle.services.functions.environment,ROOMQC_EMAIL_PROVIDER:'disabled',ROOMQC_EMAIL_ENVIRONMENT:'local'},
    command:['start','--main-service','/home/deno/functions/staff-invitation.eszip']};
  // Both actual invitation entrypoints send only to a process-local SMTP sink
  // in the installer client's internal gateway namespace. No provider or ports.
  bundle.services['staff-invitation-send-test']={...structuredClone(bundle.services['staff-invitation-test']),
    container_name:state.projectId+'-staff-invitation-send-test',networks:{default:{aliases:['staff-invitation-send-test']}},
    environment:{...bundle.services['staff-invitation-test'].environment,ROOMQC_EMAIL_PROVIDER:'mailpit',
      ROOMQC_MAILPIT_URL:'http://api-gw:2525',ROOMQC_PUBLIC_URL:'http://127.0.0.1:8082'}};
  await privateRun('docker',['run','--rm','--name',state.projectId+'-create-user-invitation-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/create-user/index.ts','--output','/functions/create-user-invitation.eszip','--timeout','120'],{timeout:150000});
  const createUserEszip=await readFile(join(directory,'create-user-invitation.eszip'));assert.ok(createUserEszip.length>1000);
  state.staffInvitationDeliveryBuild={createUserEszipHash:createHash('sha256').update(createUserEszip).digest('hex'),
    smtpHost:'api-gw',smtpPort:2525,internalOnly:true,externalProvider:false};
  bundle.services['create-user-invitation-test']={...structuredClone(bundle.services['staff-invitation-send-test']),
    container_name:state.projectId+'-create-user-invitation-test',networks:{default:{aliases:['create-user-invitation-test']}},
    command:['start','--main-service','/home/deno/functions/create-user-invitation.eszip']};
  const employeeUpdateSources=[];
  for(const name of ['update-user/index.ts','update-user/handler.mjs']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});await writeFile(target,source,{flag:'wx'});
    employeeUpdateSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-employee-update-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/update-user/index.ts','--output','/functions/employee-update.eszip','--timeout','120'],{timeout:150000});
  const employeeUpdateEszip=await readFile(join(directory,'employee-update.eszip'));assert.ok(employeeUpdateEszip.length>1000);
  bundle.services['employee-update-test']={...structuredClone(bundle.services.functions),
    container_name:state.projectId+'-employee-update-test',networks:{default:{aliases:['employee-update-test']}},
    environment:Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY'].map(key=>[key,bundle.services.functions.environment[key]])),
    command:['start','--main-service','/home/deno/functions/employee-update.eszip']};
  assert.ok(Object.values(bundle.services['employee-update-test'].environment).every(value=>typeof value==='string'&&value));
  state.employeeUpdateBuild={sources:employeeUpdateSources,eszipHash:createHash('sha256').update(employeeUpdateEszip).digest('hex'),
    runtimeEnvironmentKeys:Object.keys(bundle.services['employee-update-test'].environment),noElevatedRuntimeCredential:true};
  const workflowSources=[];
  for(const name of ['execute-workflow/index.ts','_shared/cors.ts','_shared/cronAuth.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});
    try{await writeFile(target,source,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(target),source)}
    workflowSources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-workflow-delivery-build','--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+state.projectId,'--network','bridge','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/execute-workflow/index.ts','--output','/functions/workflow-delivery.eszip','--timeout','120'],{timeout:150000});
  const workflowEszip=await readFile(join(directory,'workflow-delivery.eszip'));assert.ok(workflowEszip.length>1000);
  bundle.services['workflow-delivery-test']={...structuredClone(bundle.services.functions),
    container_name:state.projectId+'-workflow-delivery-test',networks:{default:{aliases:['workflow-delivery-test']}},
    environment:Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY'].map(key=>[key,bundle.services.functions.environment[key]])),
    command:['start','--main-service','/home/deno/functions/workflow-delivery.eszip']};
  assert.ok(Object.values(bundle.services['workflow-delivery-test'].environment).every(value=>typeof value==='string'&&value));
  state.workflowDeliveryBuild={sources:workflowSources,eszipHash:createHash('sha256').update(workflowEszip).digest('hex'),
    runtimeEnvironmentKeys:Object.keys(bundle.services['workflow-delivery-test'].environment),noElevatedRuntimeCredential:true};
  state.functionsBuild={joseVersion,mainSourceHash:createHash('sha256').update(main).digest('hex'),
    eszipHash:createHash('sha256').update(eszip).digest('hex'),canarySources:code};
  bundle.services.functions.command=bundle.services.functions.command.map(v=>v==='/home/deno/functions/main'?'/home/deno/functions/main.eszip':v);
  Object.assign(bundle.services.functions.environment,{VERIFY_JWT:'true',ROOMQC_CONTROL_CLUSTER_ID:'fixture-a',ROOMQC_CONTROL_RELEASE_ID:'sandbox-v1'});
}
async function prepareOperationsAdviceFunctions(state,vendor,bundle,privateRun){
  const directory=join(vendor,'docker','volumes','functions'),sources=[];
  for(const name of ['operations-advisor/index.ts','_shared/cors.ts','_shared/advice/contracts.ts',
    '_shared/advice/handler.ts','_shared/advice/runtime.ts','_shared/advice/provider.ts']){
    const target=join(directory,name),source=await readFile(join(repository,'supabase','functions',name));
    await mkdir(dirname(target),{recursive:true});
    try{await writeFile(target,source,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(target),source)}
    sources.push([name,createHash('sha256').update(source).digest('hex')]);
  }
  await privateRun('docker',['run','--rm','--name',state.projectId+'-operations-advice-build',
    '--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId,
    '--network','bridge','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128',
    '--mount','type=bind,src='+directory+',dst=/functions',bundle.services.functions.image,
    'bundle','--entrypoint','/functions/operations-advisor/index.ts','--output','/functions/operations-advice.eszip','--timeout','120'],{timeout:150000});
  const eszip=await readFile(join(directory,'operations-advice.eszip'));assert.ok(eszip.length>1000);
  const keys=['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  for(const name of ['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test']){
    const environment={...Object.fromEntries(keys.map(key=>[key,bundle.services.functions.environment[key]])),
      SUPABASE_URL:'http://api-gw:9083',ROOMQC_ADVICE_ENVIRONMENT:'fixture',
      ROOMQC_ADVICE_PROVIDER:name.endsWith('disabled-test')?'disabled':'fixture',ROOMQC_ADVICE_FIXTURE_OWNER:state.run};
    assert.ok(Object.values(environment).every(value=>typeof value==='string'&&value));
    bundle.services[name]={...structuredClone(bundle.services.functions),container_name:state.projectId+'-'+name,
      networks:{default:{aliases:[name]}},environment,
      command:['start','--main-service','/home/deno/functions/operations-advice.eszip']};
  }
  state.operationsAdviceBuild={sources,eszipHash:createHash('sha256').update(eszip).digest('hex'),
    image:bundle.services.functions.image,runtimeEnvironmentKeys:[...keys,'SUPABASE_URL','ROOMQC_ADVICE_ENVIRONMENT',
      'ROOMQC_ADVICE_PROVIDER','ROOMQC_ADVICE_FIXTURE_OWNER'],internalOnly:true,externalProvider:false};
}
function fixtureEnv(example){
  const values=Object.fromEntries(example.split(/\r?\n/).filter(line=>/^[A-Z][A-Z0-9_]*=/.test(line)).map(line=>{
    const i=line.indexOf('=');let value=line.slice(i+1);
    // The pinned vendor example quotes mailer URL paths. Parse the surrounding
    // dotenv quotes once; preserving them produces encoded quotes in Auth links.
    if(value.length>=2&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);
    return [line.slice(0,i),value];
  }));
  const secret=randomBytes(32).toString('hex');
  const jwt=role=>{const body=[{alg:'HS256',typ:'JWT'},{role,iss:'roomqc-sandbox',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200}]
    .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url')};
  Object.assign(values,{POSTGRES_PASSWORD:randomBytes(32).toString('hex'),JWT_SECRET:secret,ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role'),
    DASHBOARD_PASSWORD:randomBytes(32).toString('hex'),SECRET_KEY_BASE:randomBytes(64).toString('hex'),REALTIME_DB_ENC_KEY:randomBytes(8).toString('hex'),
    ROOMQC_FIXTURE_PROBE_TOKEN:jwt('roomqc_control_probe'),
    VAULT_ENC_KEY:randomBytes(16).toString('hex'),PG_META_CRYPTO_KEY:randomBytes(16).toString('hex'),S3_PROTOCOL_ACCESS_KEY_ID:randomBytes(16).toString('hex'),
    S3_PROTOCOL_ACCESS_KEY_SECRET:randomBytes(32).toString('hex'),SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:'',JWT_KEYS:'',JWT_JWKS:'',
    ANON_KEY_ASYMMETRIC:'',SERVICE_ROLE_KEY_ASYMMETRIC:'',POSTGRES_HOST:'db',POSTGRES_PORT:'5432',POSTGRES_DB:'postgres',
    SITE_URL:'http://fixture.invalid',SUPABASE_PUBLIC_URL:'http://api-gw:8000',API_EXTERNAL_URL:'http://api-gw:8000/auth/v1',
    ADDITIONAL_REDIRECT_URLS:'',DISABLE_SIGNUP:'true',ENABLE_EMAIL_SIGNUP:'true',ENABLE_PHONE_SIGNUP:'false',ENABLE_ANONYMOUS_USERS:'false',FUNCTIONS_VERIFY_JWT:'true',
    SMTP_HOST:'127.0.0.1',SMTP_PORT:'1',SMTP_USER:'',SMTP_PASS:'',SMTP_ADMIN_EMAIL:'probe@roomqc.invalid',OPENAI_API_KEY:'',
    LOGFLARE_PUBLIC_ACCESS_TOKEN:'',LOGFLARE_PRIVATE_ACCESS_TOKEN:'',JWT_EXPIRY:'3600'});
  delete values.COMPOSE_FILE;return values;
}
async function passwordCallerSource(){
  const source=await readFile(join(repository,'src/lib/password-change.ts'),'utf8');
  const harness=await readFile(join(repository,'scripts/control-backend-password-caller-checks.mjs'),'utf8');
  const compiled=await transform(source,{loader:'ts',format:'iife',globalName:'RoomQCPasswordCaller',target:'es2022'});
  const emailSource=await readFile(join(repository,'src/lib/email-auth-flow.ts'),'utf8');
  const emailHarness=await readFile(join(repository,'scripts/control-backend-email-caller-checks.mjs'),'utf8');
  const emailCompiled=await build({entryPoints:[join(repository,'src/lib/email-auth-flow.ts')],bundle:true,
    format:'iife',globalName:'RoomQCEmailCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const emailCode=emailCompiled.outputFiles[0].text;
  return {source:compiled.code+'\n'+harness+'\n'+emailCode+'\n'+emailHarness,build:{
    sourceHash:createHash('sha256').update(source).digest('hex'),
    harnessHash:createHash('sha256').update(harness).digest('hex'),
    compiledHash:createHash('sha256').update(compiled.code).digest('hex'),esbuildVersion,
    emailSourceHash:createHash('sha256').update(emailSource).digest('hex'),
    emailHarnessHash:createHash('sha256').update(emailHarness).digest('hex'),
    emailCompiledHash:createHash('sha256').update(emailCode).digest('hex')}};
}
async function invitationCallerSource(){
  const sources=[];
  for(const file of ['src/lib/staff-invitation.ts','src/lib/email-auth-flow.ts','src/lib/password-change.ts','src/lib/staff-invitation-admin.ts']){
    sources.push([file,createHash('sha256').update(await readFile(join(repository,file))).digest('hex')]);
  }
  const compiled=await transform(await readFile(join(repository,'src/lib/staff-invitation.ts'),'utf8'),
    {loader:'ts',format:'iife',globalName:'RoomQCStaffInvitationCaller',target:'es2022'});
  const email=await build({entryPoints:[join(repository,'src/lib/email-auth-flow.ts')],bundle:true,
    format:'iife',globalName:'RoomQCEmailCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const emailCode=email.outputFiles[0].text;
  const admin=await build({entryPoints:[join(repository,'src/lib/staff-invitation-admin.ts')],bundle:true,
    format:'iife',globalName:'RoomQCInvitationAdmin',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const adminCode=admin.outputFiles[0].text;
  return {source:compiled.code+'\n'+emailCode+'\n'+adminCode,build:{sources,esbuildVersion,
    compiledHash:createHash('sha256').update(compiled.code).digest('hex'),
    emailCompiledHash:createHash('sha256').update(emailCode).digest('hex'),
    adminCompiledHash:createHash('sha256').update(adminCode).digest('hex')}};
}
async function roomCallerSource(){
  const sources=[];
  for(const file of ['src/lib/room-transition-command.ts','src/lib/staff-invitation.ts'])sources.push([file,
    createHash('sha256').update(await readFile(join(repository,file))).digest('hex')]);
  const compiled=await build({entryPoints:[join(repository,'src/lib/room-transition-command.ts')],bundle:true,
    format:'iife',globalName:'RoomQCRoomCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const source=compiled.outputFiles[0].text;
  return {source,build:{sources,esbuildVersion,compiledHash:createHash('sha256').update(source).digest('hex')}};
}
async function roomOperationCallerSource(){
  const sources=[];
  for(const file of ['src/lib/room-operation-command.ts','src/lib/room-transition-command.ts','src/lib/staff-invitation.ts'])sources.push([file,
    createHash('sha256').update(await readFile(join(repository,file))).digest('hex')]);
  const compiled=await build({entryPoints:[join(repository,'src/lib/room-operation-command.ts')],bundle:true,
    format:'iife',globalName:'RoomQCOperationCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const source=compiled.outputFiles[0].text;
  return {source,build:{sources,esbuildVersion,compiledHash:createHash('sha256').update(source).digest('hex')}};
}
async function reportTargetCallerSource(){
  const sources=[];
  for(const file of ['src/lib/report-targets.ts','src/lib/staff-invitation.ts'])sources.push([file,
    createHash('sha256').update(await readFile(join(repository,file))).digest('hex')]);
  const compiled=await build({entryPoints:[join(repository,'src/lib/report-targets.ts')],bundle:true,
    format:'iife',globalName:'RoomQCReportTargetCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const source=compiled.outputFiles[0].text;
  return{source,build:{sources,esbuildVersion,compiledHash:createHash('sha256').update(source).digest('hex')}};
}
async function operationsAdviceCallerSource(){
  const sources=[];
  for(const file of ['src/lib/operations-advice-client.ts','src/lib/staff-invitation.ts','supabase/functions/_shared/advice/contracts.ts']){
    sources.push([file,createHash('sha256').update(await readFile(join(repository,file))).digest('hex')]);
  }
  const compiled=await build({entryPoints:[join(repository,'src/lib/operations-advice-client.ts')],bundle:true,
    format:'iife',globalName:'RoomQCAdviceCaller',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  const source=compiled.outputFiles[0].text;
  return{source,build:{sources,esbuildVersion,compiledHash:createHash('sha256').update(source).digest('hex')}};
}
async function main(args){
  if(args.length===0||args.join(' ')==='--help'){
    process.stdout.write('Owned official Supabase sandbox (internal network, no ports/providers/business DB).\n'+
      'Usage: node scripts/test-control-backend-sandbox.mjs --run [--advisors-cli <absolute native CLI>] [--expected-build-state <absolute ownership.json>] [--legacy-build-state <absolute historical ownership.json>; support-cutover only] [--diagnostic realtime-bootstrap|realtime-bootstrap-fresh|realtime-resource|realtime-tenant|storage-resource|tenant-summary|setup-dispatch|setup-worker|support-authority|support-cutover|support-upgrade|setup-rotation|setup-rotation-faults|setup-rotation-durability|setup-rotation-storage|setup-rotation-contention|setup-runtime-mount|setup-installer|setup-installer-nonroot|setup-installer-filesystem|setup-installer-volume|parent-boundary|employee-profile|self-profile|password|password-policy|password-guard|staff-invitation|workflow-delivery|room-source|room-writers|booking-upgrade|booking-finance-upgrade|report-upgrade|operations-advice-upgrade|advice-clock-upgrade|advice-closure-upgrade|advice-authority|advice-utc|advice-utc-upgrade|advice-edge-authority|advice-policy-baseline|advice-policy|advice-policy-upgrade|operations-advice|revenue-report|managed-health|managed-credential|managed-configuration|managed-release|directory-integration|customer-journey|ssh-customer-journey|management-customer-journey|browser-journey|browser-customer-journey|permission-session]\n'+
      'Diagnostic mode uses full schema but scoped synthetic fixtures; it cannot be a passing full-build reference.\n'+
      'Pinned upstream '+releaseTag+' / '+releaseCommit+'.\n'+
      'Replays all source SQL on an empty backend, retaining private logs under .local/.\n'+
      'Persistent demo: --run --diagnostic browser-journey --persistent-local-demo (fixed loopback 59255, explicit lifecycle).\n'+
      'Recovery: --cleanup-state <absolute ownership.json> validates exact ownership first.\n');return;
  }
  if(args.length===2&&args[0]==='--cleanup-state'){
    assert.ok(isAbsolute(args[1]));const state=JSON.parse(await readFile(args[1],'utf8'));
    assert.equal(resolve(args[1]),join(state.root,'ownership.json'));await cleanup(state);
    await writeFile(args[1],JSON.stringify(state,null,2),{mode:0o600});return;
  }
  const persistentLocalDemo=args.includes('--persistent-local-demo');
  args=args.filter(value=>value!=='--persistent-local-demo');
  assert.equal(args[0],'--run');const options=new Map();
  for(let i=1;i<args.length;i+=2){assert.ok(['--advisors-cli','--expected-build-state','--legacy-build-state','--diagnostic'].includes(args[i])
    &&!options.has(args[i])&&(args[i]==='--diagnostic'?['realtime-tls','realtime-bootstrap','realtime-bootstrap-fresh','realtime-resource','realtime-tenant','storage-resource','tenant-summary','setup-dispatch','setup-worker','support-authority','support-cutover','support-upgrade','setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume','parent-boundary','employee-profile','self-profile','password','password-policy','password-guard','staff-invitation','workflow-delivery','room-source','room-writers','booking-upgrade','booking-finance-upgrade','report-upgrade','operations-advice-upgrade','advice-clock-upgrade','advice-closure-upgrade','advice-authority','advice-utc','advice-utc-upgrade','advice-edge-authority','advice-policy-baseline','advice-policy','advice-policy-upgrade','operations-advice','revenue-report','managed-health','managed-credential','managed-configuration','managed-release','directory-integration','customer-journey','ssh-customer-journey','management-customer-journey','browser-journey','browser-customer-journey','permission-session'].includes(args[i+1]):typeof args[i+1]==='string'&&isAbsolute(args[i+1])));options.set(args[i],args[i+1])}
  const advisorsCli=options.get('--advisors-cli'),expectedBuildState=options.get('--expected-build-state'),diagnostic=options.get('--diagnostic');
  assert.ok(!persistentLocalDemo||diagnostic==='browser-journey','Persistent demo requires browser-journey preparation');
  const legacyBuildState=options.get('--legacy-build-state');
  assert.equal(Boolean(legacyBuildState),diagnostic==='support-cutover','Historical source is required only by support-cutover');
  const legacyReference=legacyBuildState?await readLegacyBackendReference({repository,file:legacyBuildState}):null;
  const nonrootDiagnostic=['tenant-summary','setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic),
    filesystemDiagnostic=['setup-rotation-storage','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic);
  const managedDiagnostic=['managed-health','managed-credential','managed-configuration','managed-release'].includes(diagnostic);
  assert.ok(!diagnostic||!expectedBuildState,'A diagnostic run cannot compare or supply full-build acceptance');
  const sourceBinding=await captureBackendSourceBinding(repository);
  // Reject incomplete, diagnostic or source-drifted references BEFORE creating
  // the new owned root or any Docker resource. This is not issuer approval.
  const referenceBuild=expectedBuildState?await readBackendBuildReference({repository,file:expectedBuildState,sourceBinding}):null;
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(SUPABASE_|GOTRUE_|SMTP_|RESEND_|ROOMQC_|OPENAI_|COMPOSE_)/i.test(key)));
  env.GIT_TERMINAL_PROMPT='0';await mkdir(resolve(repository,'.local'),{recursive:true});const id=randomBytes(6).toString('hex');
  const root=await mkdtemp(resolve(repository,'.local','roomqc-backend-'+id+'-'));await secureDirectory(root);
  const state={run:id,projectId:'roomqc-probe-'+id,root,cleaned:false,phase:'vendor',applied:0,releaseTag,releaseCommit,
    persistentLocalDemo,diagnosticOnly:Boolean(diagnostic),fullIntegratedRun:!diagnostic,sourceBinding,sourceBindingVerifiedAtEnd:false};
  if(legacyReference)state.legacySourceBinding=legacyReference.source;
  state.setupDispatchSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-setup-dispatch-checks.mjs'))).digest('hex');
  state.parentBoundarySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-parent-boundary-checks.mjs'))).digest('hex');
  state.noPolicySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-no-policy-checks.mjs'))).digest('hex');
  state.hotelScopeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-hotel-scope-checks.mjs'))).digest('hex');
  state.employeeProfileSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-employee-profile-checks.mjs'))).digest('hex');
  state.selfProfileSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-self-profile-checks.mjs'))).digest('hex');
  state.passwordSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-password-checks.mjs'))).digest('hex');
  state.passwordAdversarialSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-password-adversarial-checks.mjs'))).digest('hex');
  state.passwordConfigSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-password-config-checks.mjs'))).digest('hex');
  state.staffInvitationSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-staff-invitation-checks.mjs'))).digest('hex');
  state.staffInvitationDeliverySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-invitation-delivery.mjs'))).digest('hex');
  state.staffInvitationAuthoritySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-invitation-authority.mjs'))).digest('hex');
  state.workflowDeliverySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-workflow-delivery-checks.mjs'))).digest('hex');
  state.roomSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-room-source-checks.mjs'))).digest('hex');
  state.roomWriterSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-room-writer-checks.mjs'))).digest('hex');
  state.revenueReportSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-revenue-report-checks.mjs'))).digest('hex');
  state.reportTargetTransportSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-report-target-transport-checks.mjs'))).digest('hex');
  state.reportUpgradeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-report-upgrade-checks.mjs'))).digest('hex');
  state.operationsAdviceSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-operations-advice-checks.mjs'))).digest('hex');
  state.operationsAdviceEdgeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'))).digest('hex');
  state.adviceUpgradeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-upgrade-checks.mjs'))).digest('hex');
  state.adviceClockUpgradeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-clock-upgrade-checks.mjs'))).digest('hex');
  state.adviceAuthoritySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-authority-checks.mjs'))).digest('hex');
  state.adviceClosureUpgradeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-closure-upgrade-checks.mjs'))).digest('hex');
  state.adviceUtcSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-utc-checks.mjs'))).digest('hex');
  state.adviceUtcUpgradeSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-utc-upgrade-checks.mjs'))).digest('hex');
  state.adviceEdgeAuthoritySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-edge-authority-checks.mjs'))).digest('hex');
  state.advicePolicyBaselineSourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-policy-baseline-checks.mjs'))).digest('hex');
  state.advicePolicySourceHash=createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-advice-policy-checks.mjs'))).digest('hex');
  if(['operations-advice','operations-advice-upgrade','advice-clock-upgrade','advice-closure-upgrade','advice-utc-upgrade','advice-edge-authority'].includes(diagnostic))state.operationsAdviceCallerBuild=(await operationsAdviceCallerSource()).build;
  if(!diagnostic||managedDiagnostic||['staff-invitation','parent-boundary'].includes(diagnostic))state.staffInvitationCallerBuild=(await invitationCallerSource()).build;
  if(!diagnostic||diagnostic==='password-guard')state.passwordCallerBuild=(await passwordCallerSource()).build;
  if(!diagnostic||managedDiagnostic||['room-source','parent-boundary'].includes(diagnostic))state.roomCallerBuild=(await roomCallerSource()).build;
  if(!diagnostic||managedDiagnostic||['room-writers','parent-boundary'].includes(diagnostic))state.roomOperationCallerBuild=(await roomOperationCallerSource()).build;
  if(!diagnostic||managedDiagnostic||['parent-boundary','revenue-report','report-upgrade','operations-advice-upgrade'].includes(diagnostic))state.reportTargetCallerBuild=(await reportTargetCallerSource()).build;
  const save=()=>writeFile(join(root,'ownership.json'),JSON.stringify(state,null,2),{mode:0o600});
  const verifySource=async()=>{
    assertBackendSourceBinding(state.sourceBinding,await captureBackendSourceBinding(repository));
    if(state.roomCallerBuild)assert.deepEqual((await roomCallerSource()).build,state.roomCallerBuild,'Application room caller changed during run');
    if(state.roomOperationCallerBuild)assert.deepEqual((await roomOperationCallerSource()).build,state.roomOperationCallerBuild,'Application room operation caller changed during run');
    if(state.reportTargetCallerBuild)assert.deepEqual((await reportTargetCallerSource()).build,state.reportTargetCallerBuild,'Application report target caller changed during run');
    if(legacyReference){assertBackendSourceBinding(legacyReference.source,await captureBackendSourceBinding(legacyReference.location));
      assertBackendSourceBinding(legacyReference.source,await captureBackendSourceBinding(join(state.root,'legacy-source')));}
    state.sourceBindingVerifiedAtEnd=true;
  };
  const cancel=new AbortController(),abort=()=>cancel.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
  let sshDeployment;
  const privateRun=async(command,arguments_,options={})=>{try{
    if(command==='docker'&&sshDeployment&&arguments_[0]==='compose'&&arguments_[2]===state.projectId)
      return await sshDeployment.compose(arguments_.slice(5),options);
    return await run(command,command==='docker'?backendContainerArguments(arguments_,state):arguments_,{env,signal:cancel.signal,...options})}
    catch(error){await writeFile(join(root,'command-private.log'),(error.result?.stdout??'')+'\n'+(error.result?.stderr??''),{mode:0o600});throw error}};
    const runClient=async(source,values,timeout=45000,{managedVolume,writable=false,memory='128m',onStdout,cliSnapshot=false}={})=>{
      assert.ok(['128m','256m'].includes(memory),'Owned client memory must use an explicit fixture limit');
      if(managedVolume!==undefined)assert.equal(managedVolume,state.projectId+'-managed-runtime');
      assert.ok(!writable||managedVolume);
      if(writable)assert.equal(values.ROOMQC_MANAGED_MODE,'install','Only the exact-owned installer may chown runtime files');
      let cliRoot,cliVolume;
      if(cliSnapshot){
        assert.ok(['tenant-summary','setup-dispatch','setup-worker','support-authority','support-cutover','support-upgrade','setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic),'Only exact-owned credential/setup diagnostics can mount a CLI source snapshot');
        assert.equal(managedVolume,undefined);
        cliRoot=join(state.root,'cli-source');await mkdir(cliRoot,{mode:0o700});
        // Copy only the bound public source files. Never mount the repository's
        // .local, env, git, operational data or private configuration in a CLI.
        for(const file of state.sourceBinding.files){
          const target=join(cliRoot,...file.path.split('/'));await mkdir(dirname(target),{recursive:true});
          await writeFile(target,await readFile(join(repository,...file.path.split('/'))),{flag:'wx',mode:0o600});
        }
        // Nested bind mount targets must exist before the parent bind becomes
        // readonly; Docker must not create paths inside that readonly source.
        await mkdir(join(cliRoot,'node_modules'));
        await mkdir(join(cliRoot,'server','control','node_modules'));
        assertBackendSourceBinding(state.sourceBinding,await captureBackendSourceBinding(cliRoot));
        // Keep repeated CLI source hashing on a native Linux filesystem. The
        // copy process is networkless and can write only this exact-owned public
        // source volume; the actual test mounts it readonly after the copy ends.
        cliVolume=state.projectId+'-cli-source';
        await privateRun('docker',['volume','create','--label',ownerLabel+'='+state.run,
          '--label','com.docker.compose.project='+state.projectId,cliVolume]);
        await privateRun('docker',['run','--rm','-i','--name',state.projectId+'-cli-source-copy',
          '--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId,
          '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
          '--memory','128m','--cpus','0.5','--pids-limit','32',
          '--mount','type=bind,src='+cliRoot+',dst=/input,readonly',
          '--mount','type=volume,src='+cliVolume+',dst=/source',
          'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85','node','--input-type=module'],
          {input:"import {cp,readdir,chmod} from 'node:fs/promises';import {dirname} from 'node:path';import assert from 'node:assert/strict';"
            +"import {captureBackendSourceBinding} from '/input/scripts/control-backend-source-binding.mjs';"
            +"assert.deepEqual(await readdir('/source'),[]);"
            +"for(const name of await readdir('/input'))await cp('/input/'+name,'/source/'+name,{recursive:true,force:false,errorOnExist:true});"
            +"const binding=await captureBackendSourceBinding('/source');assert.equal(binding.sha256,"
            +JSON.stringify(state.sourceBinding.sha256)+");assert.equal(binding.files.length,"+state.sourceBinding.files.length+");"
            +(nonrootDiagnostic?"const dirs=new Set(['/source','/source/node_modules','/source/server/control/node_modules']);for(const f of binding.files){const p='/source/'+f.path;await chmod(p,0o444);for(let d=dirname(p);d!=='/';d=dirname(d))dirs.add(d)}for(const d of [...dirs].sort((a,b)=>b.length-a.length))await chmod(d,0o555);":""),timeout:120000});
        state.cliSnapshotBinding={sha256:state.sourceBinding.sha256,files:state.sourceBinding.files.length,readOnly:true};await save();
      }
      const runtimeMount=diagnostic==='setup-runtime-mount'
        ?await prepareSetupRuntimeMount({state,repository,cliVolume,ownerLabel,privateRun})
        :diagnostic==='tenant-summary'?await prepareSummaryRuntimeMount({state,repository,cliVolume,ownerLabel,privateRun}):null;
      if(legacyReference&&cliSnapshot){
        const legacyRoot=join(state.root,'legacy-source');await mkdir(legacyRoot,{mode:0o700});
        for(const file of legacyReference.source.files){const target=join(legacyRoot,...file.path.split('/'));
          await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(join(legacyReference.location,...file.path.split('/'))),{flag:'wx',mode:0o600});}
        await mkdir(join(legacyRoot,'node_modules'));await mkdir(join(legacyRoot,'server','control','node_modules'));
        assertBackendSourceBinding(legacyReference.source,await captureBackendSourceBinding(legacyRoot));
        await writeFile(join(legacyRoot,'source-binding.json'),JSON.stringify(legacyReference.source),{flag:'wx',mode:0o600});
      }
      let producerSucceeded=false;
      try{
      const producerResult=await privateRun('docker',['run','--rm','-i','--name',state.projectId+'-probe-client',
      '--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId,
      '--network','container:'+state.projectId+'-api-gw','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
      ...(writable?['--cap-add','CHOWN']:[]),
      // Fixture preparation only. Actual CLI children drop UID/GID and prove
      // CapEff=0 before importing the unchanged product CLI.
      ...(nonrootDiagnostic?['--cap-add','CHOWN','--cap-add','FOWNER','--cap-add','SETUID','--cap-add','SETGID','--cap-add','DAC_OVERRIDE','--cap-add','KILL']:[]),
      ...(filesystemDiagnostic?['--cap-add','SYS_ADMIN','--device','/dev/fuse:/dev/fuse:rw',
        '--tmpfs','/backing:rw,noexec,nosuid,nodev,size=256k,mode=0700','--tmpfs','/fault-control:rw,noexec,nosuid,nodev,size=64k,mode=0700',
        '--tmpfs','/faults:rw,noexec,nosuid,nodev,size=64k,mode=0700']:[]),
      ...(diagnostic==='support-upgrade'||diagnostic==='tenant-summary'&&!cliSnapshot
        ?['--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m,mode=0700']:[]),
      '--memory',memory,'--cpus',nonrootDiagnostic?'1':'0.5','--pids-limit','64',...Object.keys(values).flatMap(key=>['--env',key]),
      '--mount','type=bind,src='+join(repository,'server','control')+',dst=/control,readonly',
      '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/node_modules,readonly',
      ...(cliVolume?['--mount','type=volume,src='+cliVolume+',dst=/repository,readonly',
        '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/repository/node_modules,readonly',
        '--mount','type=bind,src='+join(repository,'server','control','node_modules')+',dst=/repository/server/control/node_modules,readonly',
        '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m,mode='+(nonrootDiagnostic?'1777':'0700')]:[]),
      ...(legacyReference&&cliSnapshot?['--mount','type=bind,src='+join(state.root,'legacy-source')+',dst=/legacy-repository,readonly',
        '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/legacy-repository/node_modules,readonly',
        '--mount','type=bind,src='+join(repository,'server','control','node_modules')+',dst=/legacy-repository/server/control/node_modules,readonly']:[]),
      ...(managedVolume?['--mount','type=volume,source='+managedVolume+',target=/managed'+(writable?'':',readonly')]:[]),
      ...(runtimeMount?.producerMounts??[]),
      filesystemDiagnostic?state.faultFilesystemImage.imageId:'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85','node','--input-type=module'],
      {input:source,env:{...env,...values},timeout,onStdout});
      producerSucceeded=true;return producerResult;
      }finally{
        if(runtimeMount){
          const result=await runtimeMount.finish({success:producerSucceeded});
          if(diagnostic==='tenant-summary')state.summaryRuntimeMountContainer=result;else state.setupRuntimeMountContainer=result;
          await save();
        }
      }
    };
  try{
    assertBackendSourceBinding(state.sourceBinding,await captureBackendSourceBinding(repository));
    await save();assert.equal((await objects(state)).length,0);const vendor=join(root,'upstream');
    emit('backend_sandbox_prepare',{projectId:state.projectId,releaseTag,releaseCommit});
    if(filesystemDiagnostic){
      state.phase='installer_fault_filesystem_image';await save();
      state.faultFilesystemImage=await prepareInstallerFaultFilesystemImage({repository,ownedRoot:root,run:state.run,projectId:state.projectId,privateRun});await save();
      emit('backend_installer_fault_filesystem_image',{imageId:state.faultFilesystemImage.imageId,sourceSha256:state.faultFilesystemImage.sourceSha256});
    }
    if(!diagnostic||managedDiagnostic){
      state.managedClientLink=await checkManagedClientLinkage({state,repository,privateRun});await save();
    }
    await privateRun('git',['clone','--depth','1','--branch',releaseTag,'--filter=blob:none','--sparse','https://github.com/supabase/supabase.git',vendor],{timeout:180000});
    assert.equal((await privateRun('git',['rev-parse','HEAD'],{cwd:vendor})).stdout.trim(),releaseCommit);
    await privateRun('git',['sparse-checkout','set','docker'],{cwd:vendor,timeout:180000});
    const composeDirectory=join(vendor,'docker'),secrets=fixtureEnv(await readFile(join(composeDirectory,'.env.example'),'utf8'));
    const envPath=join(root,'fixture.env');await writeFile(envPath,Object.entries(secrets).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n'),{mode:0o600,flag:'wx'});
    const rendered=await privateRun('docker',['compose','--project-name',state.projectId,'--project-directory',composeDirectory,
      '--env-file',envPath,'--file',join(composeDirectory,'docker-compose.yml'),'config','--format','json']);
    const bundle=JSON.parse(rendered.stdout);bundle.name=state.projectId;
    bundle.volumes={...(bundle.volumes??{}),'db-data':{},'object-data':{}};
    for(const name of Object.keys(bundle.services))if(![...core,'functions'].includes(name))delete bundle.services[name];
    for(const [name,service]of Object.entries(bundle.services)){
      delete service.ports;const upstreamName=service.container_name;service.container_name=state.projectId+'-'+name;service.restart='no';
      service.labels={...(service.labels??{}),[ownerLabel]:id};service.networks={default:{...(service.networks?.default??{}),aliases:[name,upstreamName]}};
      delete service.depends_on?.studio;
      for(const mount of service.volumes??[]){
        if(name==='db'&&mount.target==='/var/lib/postgresql/data'){
          mount.type='volume';mount.source='db-data';delete mount.bind;
        }else if(['storage','imgproxy'].includes(name)&&mount.target==='/var/lib/storage'){
          mount.type='volume';mount.source='object-data';delete mount.bind;
        }
      }
      for(const mount of service.volumes??[])if(mount.type==='bind'){
        const rel=relative(root,mount.source);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'Bind must be inside owned root');
        assert.ok(!/docker\.sock|docker_engine/i.test(mount.source),'No Docker socket');
      }
    }
    if(diagnostic==='storage-resource')configureStorageResourceFixture(bundle,state);
    if(diagnostic==='realtime-resource'||diagnostic==='realtime-tls'||diagnostic?.startsWith('realtime-bootstrap'))configureRealtimeResourceFixture(bundle);
    if(!diagnostic||['customer-journey','ssh-customer-journey','management-customer-journey','browser-journey','browser-customer-journey'].includes(diagnostic)||diagnostic==='realtime-tls'||diagnostic==='realtime-tenant'||diagnostic.startsWith('realtime-bootstrap')){
      state.phase='realtime_bootstrap_build';await save();
      state.realtimeBootstrapBuild=await prepareRealtimeImage({repository,root,privateRun});await save();
      // Adoption starts on the pristine vendor, then recreates only this owned
      // service using the product image. Fresh/full builds use it from entry.
      if(diagnostic!=='realtime-bootstrap')bundle.services.realtime.image=state.realtimeBootstrapBuild.imageId;
    }
    if(diagnostic==='realtime-tls')await configureRealtimeTlsFixture({state,bundle,privateRun});
    bundle.services.db.command.push('-c','cron.launch_active_jobs=off');
    if(!diagnostic||['tenant-summary','setup-dispatch','setup-worker','support-authority','support-cutover','support-upgrade','setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic)){
      state.setupRecoveryPlannedSchema='roomqc_setup';
    }
    // Preserve, pin and record the vendor's five-second rejected-join backoff.
    // Only the acceptance client's denial deadline is longer, not health probes.
    bundle.services.realtime.environment.CHANNEL_ERROR_BACKOFF_MS='5000';
    state.realtimeChannelErrorBackoffMs=5000;
    Object.assign(bundle.services.auth.environment,{GOTRUE_SMTP_HOST:'api-gw',GOTRUE_SMTP_PORT:'2525',
      GOTRUE_SMTP_USER:'',GOTRUE_SMTP_PASS:'',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:8082/**'});
    if(diagnostic!=='password') {
      // Candidate policy only, never applied to the serving Auth stack. The
      // baseline diagnostic deliberately retains the vendor's old defaults.
      bundle.services.auth.environment.GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD='true';
      bundle.services.auth.environment.GOTRUE_AUDIT_LOG_DISABLE_POSTGRES='false';
      state.authPasswordPolicy={requireCurrentPassword:true,postgresAudit:true};
    }
    bundle.networks={default:{name:state.projectId+'-internal',internal:true,labels:{[ownerLabel]:id}}};
    for(const [name,value]of Object.entries(bundle.volumes??{}))bundle.volumes[name]={...value,name:state.projectId+'-'+name,labels:{[ownerLabel]:id}};
    // Historical baseline/policy diagnostics remain pristine vendor Auth.
    // Every new integrated candidate uses the reviewed transaction extension.
    if(!['password','password-policy'].includes(diagnostic)){
      state.phase='password_auth_build';await save();emit('backend_password_auth_build');
      state.passwordAuthBuild=await preparePasswordAuth({repository,root,privateRun});
      state.authPasswordPolicy.transactionGuard=true;
      bundle.services.auth.image=state.passwordAuthBuild.imageId;await save();
      emit('backend_password_auth_built',{sourceHash:state.passwordAuthBuild.sourceHash,imageId:state.passwordAuthBuild.imageId});
    }
    state.phase='image_lock';await save();state.imageLock=[];
    for(const [name,service]of Object.entries(bundle.services)){
      const tag=service.image;
      try{await privateRun('docker',['image','inspect',tag])}catch{await privateRun('docker',['pull','--quiet',tag],{timeout:600000})}
      const info=JSON.parse((await privateRun('docker',['image','inspect',tag])).stdout)[0];
      if(name==='auth'&&state.passwordAuthBuild){
        assert.equal(info.Id,state.passwordAuthBuild.imageId);
        assert.equal(info.Config.Labels?.['roomqc.password-auth.source'],state.passwordAuthBuild.sourceHash);
        state.imageLock.push({service:name,tag:state.passwordAuthBuild.tag,digest:info.Id,imageId:info.Id,localReviewedBuild:true});
        continue;
      }
      if(name==='realtime'&&tag===state.realtimeBootstrapBuild?.imageId){
        assert.equal(info.Config.Labels?.['roomqc.realtime.source'],state.realtimeBootstrapBuild.sourceHash);
        state.imageLock.push({service:name,tag:state.realtimeBootstrapBuild.tag,digest:info.Id,imageId:info.Id,localReviewedBuild:true});
        continue;
      }
      const digest=info.RepoDigests?.find(v=>v.startsWith(tag.slice(0,tag.lastIndexOf(':'))+'@sha256:'));
      assert.ok(digest,'Immutable image digest required');service.image=digest;
      state.imageLock.push({service:name,tag,digest,imageId:info.Id});
    }
    const passwordFaultServices=[];
    if(!diagnostic||diagnostic==='password-guard') {
      for(const [name,setting,value]of [
        ['password-policy-disabled-test','GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD','false'],
        ['password-audit-disabled-test','GOTRUE_AUDIT_LOG_DISABLE_POSTGRES','true']]) {
        bundle.services[name]={...structuredClone(bundle.services.auth),container_name:state.projectId+'-'+name,
          networks:{default:{aliases:[name]}},environment:{...bundle.services.auth.environment,[setting]:value}};
        passwordFaultServices.push(name);
      }
    }
    state.phase='functions_build';await save();emit('backend_functions_build',{joseVersion});
    await prepareFunctions(state,vendor,bundle,privateRun);
    if(process.env.ROOMQC_BACKEND_TEST_FUNCTIONS_MANIFEST){
      assert(['ssh-customer-journey','management-customer-journey'].includes(diagnostic));
      await preparePackagedJourneyFunctions({repository,state,bundle,manifestFile:process.env.ROOMQC_BACKEND_TEST_FUNCTIONS_MANIFEST,privateRun});
    }
    if(['browser-journey','browser-customer-journey'].includes(diagnostic))state.browserOrigin=await browserFixtureOrigin(state);
    if(['customer-journey','ssh-customer-journey','management-customer-journey','browser-journey','browser-customer-journey'].includes(diagnostic)){
      await configureCustomerJourneyFixture({repository,vendor,bundle,state,...(state.browserOrigin?{publicOrigin:state.browserOrigin}:{})});
      if(state.browserOrigin)Object.assign(bundle.services.auth.environment,{API_EXTERNAL_URL:state.browserOrigin,GOTRUE_URI_ALLOW_LIST:state.browserOrigin+'/**'});
    }
    if(['operations-advice','operations-advice-upgrade','advice-clock-upgrade','advice-closure-upgrade','advice-utc-upgrade','advice-edge-authority'].includes(diagnostic))await prepareOperationsAdviceFunctions(state,vendor,bundle,privateRun);
    if(diagnostic==='storage-resource'){state.phase='storage_resource_plan';await save();state.storageResourcePlan=await storageResourceFixturePlan({repository,state,bundle})}
    if(persistentLocalDemo){
      Object.assign(bundle.services.auth.environment,{GOTRUE_SMTP_HOST:'local-demo-service',
        GOTRUE_MAILER_TEMPLATES_CONFIRMATION:'http://local-demo-service:2526/confirmation',GOTRUE_MAILER_TEMPLATES_INVITE:'http://local-demo-service:2526/invite'});
    }
    const bundlePath=join(root,'runtime.compose.json');const source=JSON.stringify(bundle,null,2);state.bundleHash=createHash('sha256').update(source).digest('hex');
    await writeFile(bundlePath,source,{mode:0o600,flag:'wx'});state.phase='start';await save();
    const compose=['compose','--project-name',state.projectId,'--file',bundlePath];
    emit('backend_sandbox_start',{projectId:state.projectId,network:'internal',publishedPorts:0,providers:false});
    if(['ssh-customer-journey','management-customer-journey'].includes(diagnostic))sshDeployment=await prepareBackendSshDeployment({repository,state,bundle,vendor,
      publishableKey:secrets.ANON_KEY,privateRun,save,emit});
    else await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','180',...core],{timeout:600000});
    const owned=await objects(state);state.services=[];
    for(const {kind,name,info}of owned){
      if(kind==='network')assert.equal(info.Internal,true);
      if(kind==='container'){
        assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+(state.sshDeployment?'_default':'-internal')]);
        state.services.push({name,image:info.Config.Image,imageId:info.Image});
      }
    }
    assert.equal(state.services.length,state.sshDeployment?Object.keys(bundle.services).length:core.length);await save();emit('backend_sandbox_services',{services:state.services.map(s=>({name:s.name,image:s.image}))});
    assert.equal(await sql(state,"SELECT current_setting('cron.launch_active_jobs');"),'off');
    const productBusinessMigration=['ssh-customer-journey','management-customer-journey'].includes(diagnostic);
    if(!productBusinessMigration)await sql(state,`CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);`);
    state.phase='sql_replay';const directory=join(repository,'supabase','migrations');const files=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
    assert.ok(files.length>=520);const hasher=createHash('sha256'),replay=[];
    for(const [index,file]of files.entries()){
      assert.match(file,/^\d{14}_[a-zA-Z0-9_-]+\.sql$/);const source=(await readFile(join(directory,file),'utf8')).replace(/\r\n/g,'\n');
      assert.ok(!/^\s*\\/m.test(source),'No psql meta-command');cancel.signal.throwIfAborted();
      replay.push(`BEGIN;\n${source}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${file.slice(0,14)}','${file.slice(15,-4)}',ARRAY[]::text[]);\nCOMMIT;\nSELECT 'ROOMQC_${id}_${index+1}';`);
      hasher.update(file+'\0'+source+'\0');
    }
    let pending='';state.migration=files[0];await save();
    // One psql session preserves per-file transactions but avoids hundreds of
    // Docker exec handshakes. Only random owned progress markers are public.
    const replayBatch=async(commands,databaseRole='postgres')=>privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
      '-v','VERBOSITY=sqlstate','-U',databaseRole,'-d','postgres'],{input:commands.join('\n'),timeout:180000,onStdout:chunk=>{
      pending+=chunk.toString();const lines=pending.split(/\r?\n/);pending=lines.pop();
      for(const line of lines){const match=new RegExp('^ROOMQC_'+id+'_(\\d+)$').exec(line);if(!match)continue;
        const applied=Number(match[1]);assert.equal(applied,state.applied+1);state.applied=applied;state.migration=files[applied]??files.at(-1);
        if(applied%25===0)emit('backend_migrations_progress',{applied,total:files.length});
      }
    }});
    let supportUpgradeSeed;
    const supportUpgradeClient=async phase=>{
      const source=await readFile(join(repository,'scripts','control-backend-support-upgrade-checks.mjs'),'utf8');
      const result=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_SUPPORT_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,
        databasePassword:secrets.POSTGRES_PASSWORD,phase,seed:supportUpgradeSeed})},180000,{memory:'256m'})).stdout);
      assert.equal(result.verified,true,'Actual populated support upgrade controls required');
      if(result.seed)supportUpgradeSeed=result.seed; // Private in-memory handoff only. Never save/emit the token-bearing seed.
      const summary=result.summary??result;
      assert.equal(summary.containsSecrets,false);assert.equal(Object.hasOwn(summary,'seed'),false);
      state.supportUpgradeStages??=[];state.supportUpgradeStages.push(summary);
      emit('backend_support_populated_upgrade_stage',summary);await save();return summary;
    };
    let bookingUpgradeSource,bookingUpgradeSeed,bookingUpgradeRollback;
    let financeUpgradeSource,financeUpgradeSeed,financeUpgradeCheckpoint;
    const financeUpgradeRollbacks=[];
    let reportUpgradeSource,reportUpgradeSeed,reportUpgradeCheckpoint;
    const reportUpgradeRollbacks=[];
    let utcUpgradeSource,utcUpgradeSeed,utcUpgradeRollback;
    const utcUpgradeClient=async(phase,seed)=>{
      assert.equal(createHash('sha256').update(utcUpgradeSource).digest('hex'),state.adviceUtcUpgradeSourceHash);
      try{return JSON.parse((await runClient(utcUpgradeSource,{ROOMQC_FIXTURE_ADVICE_UTC_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceUtcUpgradeFailure={phase,stage:failed.stage,checks:failed.checks,errorCode:failed.errorCode};await save();
        emit('backend_advice_utc_upgrade_failed',state.adviceUtcUpgradeFailure)}}catch{}throw error}
    };
    let closureUpgradeSource,closureUpgradeSeed,closureUpgradeRollback;
    const closureUpgradeClient=async(phase,seed)=>{
      assert.equal(createHash('sha256').update(closureUpgradeSource).digest('hex'),state.adviceClosureUpgradeSourceHash);
      try{return JSON.parse((await runClient(closureUpgradeSource,{ROOMQC_FIXTURE_ADVICE_CLOSURE_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceClosureUpgradeFailure={phase,stage:failed.stage,checks:failed.checks,errorCode:failed.errorCode};await save();
        emit('backend_advice_closure_upgrade_failed',state.adviceClosureUpgradeFailure)}}catch{}throw error}
    };
    let clockUpgradeSource,clockUpgradeSeed,clockUpgradeRollback;
    const clockUpgradeClient=async(phase,seed)=>{
      assert.equal(createHash('sha256').update(clockUpgradeSource).digest('hex'),state.adviceClockUpgradeSourceHash);
      try{return JSON.parse((await runClient(clockUpgradeSource,{ROOMQC_FIXTURE_ADVICE_CLOCK_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceClockUpgradeFailure={phase,stage:failed.stage,checks:failed.checks,errorCode:failed.errorCode};await save();
        emit('backend_advice_clock_upgrade_failed',state.adviceClockUpgradeFailure)}}catch{}throw error}
    };
    let adviceUpgradeSource,adviceUpgradeSeed,adviceUpgradeRollback;
    const adviceUpgradeClient=async(phase,seed,timeout=90000)=>{
      const caller=await reportTargetCallerSource();assert.deepEqual(caller.build,state.reportTargetCallerBuild);
      assert.equal(createHash('sha256').update(adviceUpgradeSource).digest('hex'),state.adviceUpgradeSourceHash);
      try{return JSON.parse((await runClient(caller.source+'\n'+adviceUpgradeSource,{
        ROOMQC_FIXTURE_ADVICE_UPGRADE_INPUT:JSON.stringify({run:state.run,publishableKey:secrets.ANON_KEY,
          serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},timeout,{memory:'256m'})).stdout)}
      catch(error){try{const result=JSON.parse(error.result?.stdout??'null');if(result?.verified===false&&Array.isArray(result.checks)&&result.checks.length<=200){
        state.adviceUpgradeFailure={verified:false,phase,stage:phase,errorCode:/^[A-Z0-9_]{3,80}$/.test(result.errorCode??'')?result.errorCode:'ADVICE_UPGRADE_FAILED',
          checks:result.checks.filter(c=>/^advice-upgrade-[a-zA-Z0-9-]{1,180}$/.test(c.label??'')&&typeof c.passed==='boolean')
            .map(c=>({label:c.label,passed:c.passed,actualNative:true}))};await save();emit('backend_advice_upgrade_failed',state.adviceUpgradeFailure)}}catch{}throw error}
    };
    let advicePolicySource,advicePolicySeed,advicePolicyRollback;
    const advicePolicyClient=async(phase,seed,jwtSecret,timeout=180000)=>{
      assert.equal(createHash('sha256').update(advicePolicySource).digest('hex'),state.advicePolicySourceHash);
      const fixtureInput={run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,
        databasePassword:secrets.POSTGRES_PASSWORD,phase,seed,...(jwtSecret?{jwtSecret}:{})};
      try{return JSON.parse((await runClient(advicePolicySource,{ROOMQC_FIXTURE_ADVICE_POLICY_INPUT:JSON.stringify(fixtureInput)},timeout,{memory:'256m'})).stdout)}
      catch(error){try{const result=JSON.parse(error.result?.stdout??'null');if(result?.verified===false&&Array.isArray(result.checks)&&result.checks.length<=300){
        state.advicePolicyFailure={verified:false,phase,errorCode:/^[A-Z0-9_]{3,80}$/.test(result.failureCode??'')?result.failureCode:'ADVICE_POLICY_FAILED',
          checks:result.checks.filter(c=>/^advice-policy-[a-zA-Z0-9-]{1,180}$/.test(c.label??'')&&typeof c.passed==='boolean')
            .map(c=>({label:c.label,passed:c.passed,actualNative:true})),barriers:Array.isArray(result.barriers)?result.barriers:[]};
        await save();emit('backend_advice_policy_failed',state.advicePolicyFailure)}}catch{}throw error}
    };
    const reportUpgradeClient=async(phase,seed,timeout=60000)=>{
      const caller=await reportTargetCallerSource();assert.deepEqual(caller.build,state.reportTargetCallerBuild);
      assert.equal(createHash('sha256').update(reportUpgradeSource).digest('hex'),state.reportUpgradeSourceHash);
      try{return JSON.parse((await runClient(caller.source+'\n'+reportUpgradeSource,{
        ROOMQC_FIXTURE_REPORT_UPGRADE_INPUT:JSON.stringify({run:state.run,publishableKey:secrets.ANON_KEY,
          serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},timeout,{memory:'256m'})).stdout)}
      catch(error){
        // A failed child exits nonzero; retain only the harness' safe, bounded
        // result, without reflecting arbitrary private stdout or fixture data.
        try{const result=JSON.parse(error.result?.stdout??'null');
          if(result?.verified===false&&Array.isArray(result.checks)&&result.checks.length<=200){
            state.reportUpgradeFailure={verified:false,phase,errorCode:/^[A-Z0-9_]{3,80}$/.test(result.errorCode??'')?result.errorCode:'REPORT_UPGRADE_FAILED',
              checks:result.checks.filter(c=>/^report-upgrade-[a-zA-Z0-9-]{1,180}$/.test(c.label??'')&&typeof c.passed==='boolean')
                .map(c=>({label:c.label,passed:c.passed,actualNative:true}))};await save();
          }
        }catch{}
        throw error;
      }
    };
    if(['setup-dispatch','setup-worker','support-authority','support-cutover','support-upgrade','setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic)){
      const target='20261028010321_setup_recovery_net_privilege_boundary.sql';
      const boundaryIndex=files.indexOf(target);
      assert.deepEqual(files.slice(boundaryIndex),[target,'20261028012429_setup_recovery_scoped_credentials.sql',
        '20261028082314_setup_recovery_credential_commands.sql','20261028092339_setup_credential_live_status.sql',
        '20261028092341_release_schema_fingerprint_v3.sql','20261028101638_setup_credential_target_preflight.sql',
        '20261029005352_setup_credential_rotation_ready_fence.sql',
        '20261029055817_platform_support_command_acceptance.sql',
        '20261029063829_platform_support_acceptance_handoff_clock.sql',
        '20261029135816_tenant_summary_scoped_read.sql','20261029140847_tenant_summary_attestation_scope.sql',
        '20261029144213_tenant_summary_credential_commands.sql',
        '20261030055444_realtime_restored_primary_constraint_attestation.sql'],
        'Review setup upgrade when the migration chain changes');
      await replayBatch(replay.slice(0,boundaryIndex));
      state.phase='setup_net_boundary_upgrade';await save();
      const migration=await readFile(join(directory,target),'utf8');let normalRoleDenied=false;
      try{await sql(state,migration,{privateDiagnostics:true})}
      catch(error){normalRoleDenied=/\b42501\b/.test(error.result?.stderr??'')
        &&/SETUP_RECOVERY_NET_ADMIN_REQUIRED/.test(error.result?.stderr??'');if(!normalRoleDenied)throw error}
      assert.equal(normalRoleDenied,true,'Business migration role cannot administer pg_net');
      state.setupNetBoundaryUpgrade=await rehearseSetupNetBoundary({sql:source=>sql(state,source,{privateDiagnostics:true,databaseRole:'supabase_admin'}),
        migration});
      await replayBatch([replay[boundaryIndex]],'supabase_admin');
      state.setupNetBoundaryUpgrade.maintenanceRole='supabase_admin';
      state.setupNetBoundaryUpgrade.businessMigrationRoleDenied=normalRoleDenied;
      const after=JSON.parse(await sql(state,setupNetBoundaryCatalogSql));
      assert.equal(after.recoveryBits,0);
      assert.equal(after.nonRecoveryEffectiveSha256,state.setupNetBoundaryUpgrade.before.nonRecoveryEffectiveSha256);
      state.setupNetBoundaryUpgrade.after=after;
      emit('backend_setup_net_boundary_upgrade',state.setupNetBoundaryUpgrade);await save();
      const publicMatrixSql=`SELECT json_build_object('roles',count(*),'bits',count(*)*2,
        'matrixSha256',encode(sha256(convert_to(jsonb_agg(jsonb_build_array(rolname,
          has_schema_privilege(oid,'public','USAGE'),has_schema_privilege(oid,'public','CREATE'))
          ORDER BY rolname COLLATE "C")::text,'UTF8')),'hex'),
        'acl',(SELECT nspacl::text FROM pg_namespace WHERE nspname='public'),
        'recoveryUsage',has_schema_privilege('roomqc_setup_recovery','public','USAGE'),
        'recoveryCreate',has_schema_privilege('roomqc_setup_recovery','public','CREATE'))
        FROM pg_roles WHERE rolname<>'roomqc_setup_recovery';`;
      const publicBefore=JSON.parse(await sql(state,publicMatrixSql)),schemaBefore=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const scopedFile=files[boundaryIndex+1],scopedMigration=await readFile(join(directory,scopedFile),'utf8');let faultReached=false;
      try{await sql(state,'BEGIN;\n'+scopedMigration+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${scopedFile.slice(0,14)}','${scopedFile.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`)}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'');if(!faultReached)throw error}
      assert.equal(faultReached,true);assert.deepEqual(JSON.parse(await sql(state,publicMatrixSql)),publicBefore);
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),schemaBefore);
      assert.equal(await sql(state,"SELECT to_regnamespace('roomqc_setup') IS NULL;"),'t');
      await replayBatch([replay[boundaryIndex+1]]);
      const publicAfter=JSON.parse(await sql(state,publicMatrixSql));
      assert.equal(publicAfter.matrixSha256,publicBefore.matrixSha256);
      assert.equal(publicAfter.recoveryUsage,false);assert.equal(publicAfter.recoveryCreate,false);
      state.setupRecoveryCredentialUpgrade={verified:true,role:'postgres',injectedFaultSqlstate:'22012',
        schemaAclAndHistoryRollback:true,nonRecoveryPublicPrivilegesPreserved:true,before:publicBefore,after:publicAfter};
      emit('backend_setup_recovery_credential_upgrade',state.setupRecoveryCredentialUpgrade);await save();
      const commandFile=files[boundaryIndex+2],commandSource=await readFile(join(directory,commandFile),'utf8');
      const commandPriorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');faultReached=false;
      let credentialNormalRoleDenied=false;
      try{await sql(state,commandSource,{privateDiagnostics:true})}
      catch(error){credentialNormalRoleDenied=/SETUP_CREDENTIAL_MAINTENANCE_REQUIRED/.test(error.result?.stderr??'');if(!credentialNormalRoleDenied)throw error}
      assert.equal(credentialNormalRoleDenied,true,'Ordinary migration login must not acquire function owner membership');
      try{await sql(state,'BEGIN;\n'+commandSource+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${commandFile.slice(0,14)}','${commandFile.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,{privateDiagnostics:true,databaseRole:'supabase_admin'})}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'');if(!faultReached)throw error}
      assert.equal(faultReached,true,'Credential command rehearsal must reach fault after the complete migration');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),commandPriorHash);
      assert.equal(await sql(state,"SELECT count(*) FROM pg_roles WHERE rolname IN ('roomqc_setup_credential_owner','roomqc_setup_credential_issuer','roomqc_setup_credential_installer');"),'0');
      assert.equal(await sql(state,"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+commandFile.slice(0,14)+"';"),'0');
      state.credentialCommandUpgradeRollback={verified:true,priorMigrations:state.applied,target:commandFile,
        schemaUnchanged:true,rolesAbsent:true,historyAbsent:true,injectedFaultSqlstate:'22012',maintenanceRole:'supabase_admin',businessMigrationRoleDenied:true};await save();
      await replayBatch([replay[boundaryIndex+2]],'supabase_admin');
      state.setupAttestationUpgradeRollbacks=[];
      for(const offset of [3,4,5,6]){
        const file=files[boundaryIndex+offset],source=await readFile(join(directory,file),'utf8');
        const maintenanceRequired=offset!==4;
        const role=maintenanceRequired?'supabase_admin':'postgres',priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        const priorDefinition=await sql(state,"SELECT encode(sha256(convert_to(pg_get_functiondef('private.roomqc_schema_fingerprint()'::regprocedure),'UTF8')),'hex');");
        const priorStatus=await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.status()')::text;");
        const priorPreflight=await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.preflight()')::text;");
        const priorRotate=await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.rotate(jsonb)')::text;");
        let denied=false;
        if(maintenanceRequired){
          try{await sql(state,source,{privateDiagnostics:true})}
          catch(error){denied=/SETUP_CREDENTIAL_MAINTENANCE_REQUIRED/.test(error.result?.stderr??'');if(!denied)throw error}
          assert.equal(denied,true);
        }
        let reached=false;
        try{await sql(state,'BEGIN;\n'+source+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
          VALUES('${file.slice(0,14)}','${file.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,{privateDiagnostics:true,databaseRole:role})}
        catch(error){reached=/\b22012\b/.test(error.result?.stderr??'');if(!reached)throw error}
        assert.equal(reached,true);assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash);
        assert.equal(await sql(state,"SELECT encode(sha256(convert_to(pg_get_functiondef('private.roomqc_schema_fingerprint()'::regprocedure),'UTF8')),'hex');"),priorDefinition);
        assert.equal(await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.status()')::text;"),priorStatus);
        assert.equal(await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.preflight()')::text;"),priorPreflight);
        assert.equal(await sql(state,"SELECT to_regprocedure('roomqc_setup_admin.rotate(jsonb)')::text;"),priorRotate);
        assert.equal(await sql(state,"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+file.slice(0,14)+"';"),'0');
        state.setupAttestationUpgradeRollbacks.push({verified:true,file,priorMigrations:state.applied,role,
          schemaUnchanged:true,fingerprintDefinitionUnchanged:true,statusSurfaceUnchanged:true,preflightSurfaceUnchanged:true,rotationSurfaceUnchanged:true,historyAbsent:true,
          injectedFaultSqlstate:'22012',businessMigrationRoleDenied:maintenanceRequired?denied:null});await save();
        await replayBatch([replay[boundaryIndex+offset]],role);
      }
      // Acceptance is an ordinary migration, separate from the privileged
      // credential maintenance chain. Rehearse a full-body/history rollback
      // before applying it; do not silently accept an arbitrary new suffix.
      const acceptanceFile=files[boundaryIndex+7],acceptanceSource=await readFile(join(directory,acceptanceFile),'utf8');
      assert.equal(state.applied,585);assert.equal(acceptanceFile,'20261029055817_platform_support_command_acceptance.sql');
      if(diagnostic==='support-upgrade'){state.phase='support_upgrade_seed585';await save();await supportUpgradeClient('seed585')}
      const acceptancePriorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const acceptancePublicBefore=JSON.parse(await sql(state,publicMatrixSql));
      const acceptanceSurfaceSql=`SELECT json_build_object(
        'schema',to_regnamespace('roomqc_support')::text,
        'table',to_regclass('private.platform_support_acceptances')::text,
        'rpc',to_regprocedure('public.accept_platform_support_command(uuid,uuid,text,text,text,text)')::text,
        'immutable',to_regprocedure('private.platform_support_acceptance_immutable()')::text);`;
      const acceptancePriorSurface=JSON.parse(await sql(state,acceptanceSurfaceSql));
      assert.deepEqual(acceptancePriorSurface,{schema:null,table:null,rpc:null,immutable:null});
      let acceptanceFaultReached=false;
      try{await sql(state,'BEGIN;\n'+acceptanceSource+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${acceptanceFile.slice(0,14)}','${acceptanceFile.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`)}
      catch(error){acceptanceFaultReached=/\b22012\b/.test(error.result?.stderr??'');if(!acceptanceFaultReached)throw error}
      assert.equal(acceptanceFaultReached,true,'Acceptance rehearsal must reach fault after the complete migration and history write');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),acceptancePriorHash);
      assert.deepEqual(JSON.parse(await sql(state,publicMatrixSql)),acceptancePublicBefore);
      assert.deepEqual(JSON.parse(await sql(state,acceptanceSurfaceSql)),acceptancePriorSurface);
      assert.equal(await sql(state,"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+acceptanceFile.slice(0,14)+"';"),'0');
      state.supportAcceptanceMigrationRollback={verified:true,priorMigrations:585,target:acceptanceFile,role:'postgres',
        injectedFaultSqlstate:'22012',schemaAndNewSurfaceRollback:true,publicPrivilegesPreserved:true,historyAbsent:true,
        populatedBusinessUpgradeVerified:false};await save();
      await replayBatch([replay[boundaryIndex+7]]);
      emit('backend_support_acceptance_migration_rollback',state.supportAcceptanceMigrationRollback);
      const handoffFile=files[boundaryIndex+8],handoffSource=await readFile(join(directory,handoffFile),'utf8');
      assert.equal(state.applied,586);
      if(diagnostic==='support-upgrade'){state.phase='support_upgrade_verify586';await save();await supportUpgradeClient('verify586')}
      const handoffPriorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const handoffDefinitionSql="SELECT encode(sha256(convert_to(pg_get_functiondef('public.accept_platform_support_command(uuid,uuid,text,text,text,text)'::regprocedure),'UTF8')),'hex');";
      const handoffPriorDefinition=await sql(state,handoffDefinitionSql);let handoffFaultReached=false;
      try{await sql(state,'BEGIN;\n'+handoffSource+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${handoffFile.slice(0,14)}','${handoffFile.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`)}
      catch(error){handoffFaultReached=/\b22012\b/.test(error.result?.stderr??'');if(!handoffFaultReached)throw error}
      assert.equal(handoffFaultReached,true);assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),handoffPriorHash);
      assert.equal(await sql(state,handoffDefinitionSql),handoffPriorDefinition);
      assert.equal(await sql(state,"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+handoffFile.slice(0,14)+"';"),'0');
      state.supportHandoffMigrationRollback={verified:true,priorMigrations:586,target:handoffFile,role:'postgres',
        injectedFaultSqlstate:'22012',schemaAndFunctionRollback:true,historyAbsent:true,populatedBusinessUpgradeVerified:false};await save();
      await replayBatch([replay[boundaryIndex+8]]);
      emit('backend_support_handoff_migration_rollback',state.supportHandoffMigrationRollback);
      // Reviewed summary suffix: ordinary DDL stays under the business
      // migrator; only capability-maintenance DDL uses the extension owner.
      // Keep the exact suffix guard above instead of accepting arbitrary new
      // migrations or granting owner membership to the runtime/migrator.
      await replayBatch(replay.slice(boundaryIndex+9,boundaryIndex+11));
      const summaryFile=files[boundaryIndex+11],summarySource=await readFile(join(directory,summaryFile),'utf8');
      const summaryPriorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');let summaryNormalDenied=false;
      try{await sql(state,summarySource,{privateDiagnostics:true})}
      catch(error){summaryNormalDenied=/SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED/.test(error.result?.stderr??'');if(!summaryNormalDenied)throw error}
      assert.equal(summaryNormalDenied,true,'Business migration role cannot install summary credential maintenance');
      let summaryFaultReached=false;
      try{await sql(state,'BEGIN;\n'+summarySource+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${summaryFile.slice(0,14)}','${summaryFile.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,{privateDiagnostics:true,databaseRole:'supabase_admin'})}
      catch(error){summaryFaultReached=/\b22012\b/.test(error.result?.stderr??'');if(!summaryFaultReached)throw error}
      assert.equal(summaryFaultReached,true,'Summary rollback fault must follow the complete body/history');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),summaryPriorHash);
      assert.equal(await sql(state,"SELECT to_regnamespace('roomqc_summary_admin') IS NULL;"),'t');
      assert.equal(await sql(state,"SELECT count(*) FROM pg_roles WHERE rolname IN ('roomqc_summary_credential_owner','roomqc_summary_credential_issuer','roomqc_summary_credential_installer');"),'0');
      assert.equal(await sql(state,"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+summaryFile.slice(0,14)+"';"),'0');
      state.summaryCredentialUpgradeRollback={verified:true,priorMigrations:state.applied,target:summaryFile,role:'supabase_admin',
        businessMigrationRoleDenied:true,injectedFaultSqlstate:'22012',schemaUnchanged:true,rolesAbsent:true,historyAbsent:true};
      await replayBatch([replay[boundaryIndex+11]],'supabase_admin');
      state.summaryCredentialMaintenance={migration:summaryFile,role:'supabase_admin',businessMigrationRoleDenied:true,runtimeRoleUnchanged:true};
      emit('backend_summary_credential_upgrade_rollback',state.summaryCredentialUpgradeRollback);await save();
       const finalSetupFile=files[boundaryIndex+12];
       assert.equal(finalSetupFile,'20261030055444_realtime_restored_primary_constraint_attestation.sql');
       await replayBatch([replay[boundaryIndex+12]]);
    }else if(diagnostic==='advice-utc-upgrade'){
      assert.equal(files.length,576,'UTC quota upgrade rehearsal binds exact575-to576 chain');
      assert.equal(files.at(-2),'20261027140057_operations_advice_unknown_closure_receipts.sql');
      assert.equal(files.at(-1),'20261027144833_operations_advice_quota_day_commit_fence.sql');
      utcUpgradeSource=await readFile(join(repository,'scripts','control-backend-advice-utc-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,575));assert.equal(state.applied,575);
      state.phase='advice_utc_upgrade_seed575';await save();utcUpgradeSeed=await utcUpgradeClient('seed575');
      state.adviceUtcUpgradeSeed=utcUpgradeSeed;assert.equal(utcUpgradeSeed.verified,true);await save();
      state.phase='advice_utc_upgrade_rollback576';await save();
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();'),target=files.at(-1);
      const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
        input:'BEGIN;\n'+migration+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+target.slice(0,14)+"','"+target.slice(15,-4)+"',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;",timeout:30000});}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'UTC quota fault follows full body and history');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash);
      utcUpgradeRollback=await utcUpgradeClient('rollback576',utcUpgradeSeed.fixture);assert.equal(utcUpgradeRollback.verified,true);
      state.adviceUtcUpgradeRollback={...utcUpgradeRollback,injectedFaultSqlstate:'22012',schemaRollbackVerified:true};await save();
      state.phase='advice_utc_upgrade_apply576';await save();await replayBatch(replay.slice(575));
    }else if(diagnostic==='advice-closure-upgrade'){
      assert.equal(files.length,575,'Closure upgrade rehearsal binds exact574-to575 chain');
      assert.equal(files.at(-2),'20261027131041_operations_advice_release_entitlement_clock_fences.sql');
      assert.equal(files.at(-1),'20261027140057_operations_advice_unknown_closure_receipts.sql');
      closureUpgradeSource=await readFile(join(repository,'scripts','control-backend-advice-closure-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,574));assert.equal(state.applied,574);
      state.phase='advice_closure_upgrade_seed574';await save();closureUpgradeSeed=await closureUpgradeClient('seed574');
      state.adviceClosureUpgradeSeed=closureUpgradeSeed;assert.equal(closureUpgradeSeed.verified,true);await save();
      state.phase='advice_closure_upgrade_rollback575';await save();
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();'),target=files.at(-1);
      const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
        input:'BEGIN;\n'+migration+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+target.slice(0,14)+"','"+target.slice(15,-4)+"',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;",timeout:30000});}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'Closure fault follows full body and history');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash);
      closureUpgradeRollback=await closureUpgradeClient('rollback575',closureUpgradeSeed.fixture);assert.equal(closureUpgradeRollback.verified,true);
      state.adviceClosureUpgradeRollback={...closureUpgradeRollback,injectedFaultSqlstate:'22012',schemaRollbackVerified:true};await save();
      state.phase='advice_closure_upgrade_apply575';await save();await replayBatch(replay.slice(574));
    }else if(diagnostic==='advice-clock-upgrade'){
      assert.equal(files.length,574,'Clock upgrade rehearsal binds exact573-to574 chain');
      assert.equal(files.at(-2),'20261027104602_operations_advice_authoritative_journal.sql');
      assert.equal(files.at(-1),'20261027131041_operations_advice_release_entitlement_clock_fences.sql');
      clockUpgradeSource=await readFile(join(repository,'scripts','control-backend-advice-clock-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,573));assert.equal(state.applied,573);
      state.phase='advice_clock_upgrade_seed573';await save();clockUpgradeSeed=await clockUpgradeClient('seed573');
      state.adviceClockUpgradeSeed=clockUpgradeSeed;assert.equal(clockUpgradeSeed.verified,true);await save();
      state.phase='advice_clock_upgrade_rollback574';await save();
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();'),target=files.at(-1);
      const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
        input:'BEGIN;\n'+migration+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+target.slice(0,14)+"','"+target.slice(15,-4)+"',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;",timeout:30000});}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'Clock fault follows full body and history');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash);
      clockUpgradeRollback=await clockUpgradeClient('rollback574',clockUpgradeSeed.fixture);assert.equal(clockUpgradeRollback.verified,true);
      state.adviceClockUpgradeRollback={...clockUpgradeRollback,injectedFaultSqlstate:'22012',schemaRollbackVerified:true};await save();
      state.phase='advice_clock_upgrade_apply574';await save();await replayBatch(replay.slice(573));
    }else if(diagnostic==='operations-advice-upgrade'){
      assert.equal(files.length,573,'Advice upgrade rehearsal binds exact572-to573 chain');
      assert.equal(files.at(-2),'20261027094448_report_target_terminal_cancellation.sql');
      assert.equal(files.at(-1),'20261027104602_operations_advice_authoritative_journal.sql');
      adviceUpgradeSource=await readFile(join(repository,'scripts','control-backend-advice-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,572));assert.equal(state.applied,572);
      state.phase='advice_upgrade_seed572';await save();adviceUpgradeSeed=await adviceUpgradeClient('seed572',undefined,120000);
      state.adviceUpgradeSeed=adviceUpgradeSeed;await save();assert.equal(adviceUpgradeSeed.verified,true);
      state.phase='advice_upgrade_rollback573';await save();
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();'),target=files.at(-1);
      const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
        input:'BEGIN;\n'+migration+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${target.slice(0,14)}','${target.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,timeout:30000});}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'Advice fault must follow complete migration body and history insert');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash,'Advice fault must roll back complete schema/functions/grants/triggers');
      const rollback=await adviceUpgradeClient('rollback573',adviceUpgradeSeed.fixture);
      adviceUpgradeRollback={...rollback,injectedFaultSqlstate:'22012',schemaUnchanged:true,migration:target,sourceSha256:createHash('sha256').update(migration).digest('hex')};
      state.adviceUpgradeRollback=adviceUpgradeRollback;await save();assert.equal(rollback.verified,true);
      state.phase='advice_upgrade_apply573';await save();await replayBatch(replay.slice(572));
    }else if(diagnostic==='advice-policy-upgrade'){
      assert.equal(files.length,577,'Advice policy upgrade rehearsal binds exact576-to577 chain');
      assert.equal(files.at(-2),'20261027144833_operations_advice_quota_day_commit_fence.sql');
      assert.equal(files.at(-1),'20261027153807_operations_advice_policy_live_commands.sql');
      advicePolicySource=await readFile(join(repository,'scripts','control-backend-advice-policy-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,576));assert.equal(state.applied,576);
      state.phase='advice_policy_seed576';await save();advicePolicySeed=await advicePolicyClient('seed576');
      state.advicePolicySeed=advicePolicySeed;await save();assert.equal(advicePolicySeed.verified,true);
      state.phase='advice_policy_rollback577';await save();
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();'),target=files.at(-1);
      const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
        input:'BEGIN;\n'+migration+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${target.slice(0,14)}','${target.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,timeout:30000});}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'Advice policy fault must follow complete migration body and history insert');
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash,'Advice policy fault must roll back complete schema/functions/grants/triggers');
      const rollback=await advicePolicyClient('rollback577',advicePolicySeed.fixture);
      advicePolicyRollback={...rollback,injectedFaultSqlstate:'22012',schemaUnchanged:true,migration:target,sourceSha256:createHash('sha256').update(migration).digest('hex')};
      state.advicePolicyRollback=advicePolicyRollback;await save();assert.equal(rollback.verified,true);
      state.phase='advice_policy_apply577';await save();await replayBatch(replay.slice(576));
    }else if(diagnostic==='report-upgrade'){
      const suffix=[
        '20261027051801_booking_finance_report_live_read.sql','20261027060731_financial_report_live_scope_and_export.sql',
        '20261027070034_monthly_and_labor_report_live_scope.sql','20261027074647_operations_report_scoped_aggregates.sql',
        '20261027085249_report_targets_live_scope_and_atomic_commands.sql','20261027094448_report_target_terminal_cancellation.sql'];
      reportUpgradeSource=await readFile(join(repository,'scripts','control-backend-report-upgrade-checks.mjs'),'utf8');
      if(files.length!==572||files.slice(566).join('|')!==suffix.join('|')){
        state.reportUpgradeControls={verified:false,notRun:true,status:'NOT RUN',reason:'MIGRATION_CHAIN_MOVED',
          expected:{migrationCount:572,baseMigration:566,tail:suffix},
          actual:{migrationCount:files.length,tail:files.slice(-suffix.length)},productAcceptance:false};
        state.phase='report_upgrade_not_run_migration_chain_moved';
        emit('backend_report_upgrade_not_run',state.reportUpgradeControls);
        await save();
        return;
      }
      await replayBatch(replay.slice(0,566));assert.equal(state.applied,566);
      state.phase='report_upgrade_seed566';await save();reportUpgradeSeed=await reportUpgradeClient('seed566',undefined,120000);
      state.reportUpgradeSeed=reportUpgradeSeed;await save();assert.equal(reportUpgradeSeed.verified,true);
      for(let index=566;index<572;index++){
        const target=files[index],targetCount=index+1;
        state.phase='report_upgrade_rollback'+targetCount;await save();
        const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        const migration=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
        try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
          input:'BEGIN;\n'+migration+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${target.slice(0,14)}','${target.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,timeout:30000});}
        catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'');}
        assert.equal(faultReached,true,'Fault must be reached after complete report migration body and history insert');
        assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash,'Failed report upgrade must roll back schema/functions/grants/triggers');
        const rollback=await reportUpgradeClient('rollback'+targetCount,(reportUpgradeCheckpoint??reportUpgradeSeed).fixture);
        reportUpgradeRollbacks.push({...rollback,target:targetCount,migration:target,sourceSha256:createHash('sha256').update(migration).digest('hex'),
          injectedFaultSqlstate:'22012',schemaUnchanged:true});
        state.reportUpgradeRollbacks=reportUpgradeRollbacks;await save();assert.equal(rollback.verified,true,'Failed report migration must preserve persisted data and history');
        state.phase='report_upgrade_apply'+targetCount;await save();await replayBatch([replay[index]]);
        if(targetCount===571){
          state.phase='report_upgrade_checkpoint571';await save();reportUpgradeCheckpoint=await reportUpgradeClient('checkpoint571',reportUpgradeSeed.fixture,120000);
          state.reportUpgradeCheckpoint=reportUpgradeCheckpoint;await save();assert.equal(reportUpgradeCheckpoint.verified,true);
        }
      }
    }else if(diagnostic==='booking-finance-upgrade'){
      const expectedFinanceChain=[
        '20261027013052_booking_external_notification_targets.sql',
        '20261027034303_booking_flags_live_authority_and_room_source.sql',
        '20261027042128_booking_no_show_deposit_resolution_commands.sql',
      ];
      const currentTail=files.slice(-3);
      if(files.length!==566||currentTail.join('|')!==expectedFinanceChain.join('|')){
        financeUpgradeSource=await readFile(join(repository,'scripts','control-backend-booking-finance-upgrade-checks.mjs'),'utf8');
        state.financeUpgradeControls={verified:false,notRun:true,status:'NOT RUN',reason:'MIGRATION_CHAIN_MOVED',
          expected:{migrationCount:566,tail:expectedFinanceChain},actual:{migrationCount:files.length,tail:currentTail},
          productAcceptance:false};
        state.phase='finance_upgrade_not_run_migration_chain_moved';
        emit('backend_finance_upgrade_not_run',state.financeUpgradeControls);
        await save();
        return;
      }
      financeUpgradeSource=await readFile(join(repository,'scripts','control-backend-booking-finance-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,-2));assert.equal(state.applied,564);
      const client=async(phase,seed,timeout=60000)=>JSON.parse((await runClient(financeUpgradeSource,{
        ROOMQC_FIXTURE_BOOKING_FINANCE_UPGRADE_INPUT:JSON.stringify({run:state.run,publishableKey:secrets.ANON_KEY,
          serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,phase,seed})},timeout)).stdout);
      state.phase='finance_upgrade_seed564';await save();financeUpgradeSeed=await client('seed',undefined,90000);
      state.financeUpgradeSeed=financeUpgradeSeed;await save();assert.equal(financeUpgradeSeed.verified,true,'Persisted564 seed must be valid');
      for(const index of [564,565]){
        const target=files[index],targetCount=index+1;
        state.phase='finance_upgrade_rollback'+targetCount;await save();
        const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        const source=(await readFile(join(directory,target),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
        try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{
          input:'BEGIN;\n'+source+`\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${target.slice(0,14)}','${target.slice(15,-4)}',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;`,timeout:30000});}
        catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'');}
        assert.equal(faultReached,true,'Fault must be reached after complete migration body and history insert');
        assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),priorHash,'Fault must roll back schema/function/grant/trigger chain');
        const rollback=await client('rollback'+targetCount,(financeUpgradeCheckpoint??financeUpgradeSeed).fixture);
        financeUpgradeRollbacks.push({...rollback,injectedFaultSqlstate:'22012',schemaUnchanged:true});
        state.financeUpgradeRollbacks=financeUpgradeRollbacks;await save();assert.equal(rollback.verified,true,'Fault must preserve persisted data/history');
        state.phase='finance_upgrade_apply'+targetCount;await save();await replayBatch([replay[index]]);
        if(targetCount===565){financeUpgradeCheckpoint=await client('checkpoint565',financeUpgradeSeed.fixture);
          state.financeUpgradeCheckpoint=financeUpgradeCheckpoint;await save();assert.equal(financeUpgradeCheckpoint.verified,true,'Intermediate565 command must commit');}
      }
    }else if(diagnostic==='booking-upgrade'){
      assert.equal(files.length,564,'Upgrade rehearsal explicitly binds563-to564; review new chains before reusing it');
      assert.equal(files.at(-1),'20261027013052_booking_external_notification_targets.sql');
      bookingUpgradeSource=await readFile(join(repository,'scripts','control-backend-booking-upgrade-checks.mjs'),'utf8');
      await replayBatch(replay.slice(0,-1));assert.equal(state.applied,563);state.phase='booking_upgrade_seed';await save();
      const upgradeInput={run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD};
      bookingUpgradeSeed=JSON.parse((await runClient(bookingUpgradeSource,{ROOMQC_FIXTURE_BOOKING_UPGRADE_INPUT:JSON.stringify({...upgradeInput,phase:'seed'})},90000)).stdout);
      state.bookingUpgradeSeed=bookingUpgradeSeed;await save();assert.equal(bookingUpgradeSeed.verified,true,'Persisted563 seed must be valid');
      const priorHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');state.phase='booking_upgrade_rollback';await save();
      const targetSource=(await readFile(join(directory,files.at(-1)),'utf8')).replace(/\r\n/g,'\n');let faultReached=false;
      try{await privateRun('docker',['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],
        {input:'BEGIN;\n'+targetSource+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261027013052','booking_external_notification_targets',ARRAY[]::text[]);\nSELECT 1/0;\nCOMMIT;",timeout:30000})}
      catch(error){faultReached=/\b22012\b/.test(error.result?.stderr??'')}
      assert.equal(faultReached,true,'Injected division-by-zero must be reached after the whole upgrade body');
      const rollbackHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(rollbackHash,priorHash,'Failed upgrade must roll back schema');
      bookingUpgradeRollback=JSON.parse((await runClient(bookingUpgradeSource,{ROOMQC_FIXTURE_BOOKING_UPGRADE_INPUT:JSON.stringify({...upgradeInput,phase:'rollback',seed:bookingUpgradeSeed.fixture})},30000)).stdout);
      state.bookingUpgradeRollback={...bookingUpgradeRollback,injectedFaultSqlstate:'22012',schemaUnchanged:true};await save();
      assert.equal(bookingUpgradeRollback.verified,true,'Failed upgrade must preserve data and migration ledger');
      state.phase='booking_upgrade_apply';await save();await replayBatch(replay.slice(-1));
    }else if(productBusinessMigration){
      state.productBusinessMigration=await runBackendBusinessMigration({state,image:process.env.ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE,
        databasePassword:secrets.POSTGRES_PASSWORD,migrationSetHash:hasher.copy().digest('hex'),migrationCount:files.length,privateRun});
      state.applied=state.productBusinessMigration.migrationReceipt.appliedCount;await save();
      emit('backend_product_business_migrations',{applied:state.applied,sourceMounted:false,initialized:true});
    }else{
      // The vendor-owned pg_net ACL migration needs an extension-owner session.
      // Keep all business DDL and subsequent runtime probes under postgres.
      const privileged=files.indexOf('20261028010321_setup_recovery_net_privilege_boundary.sql');
      if(privileged<0)await replayBatch(replay);
      else{
        await replayBatch(replay.slice(0,privileged));
        await replayBatch([replay[privileged]],'supabase_admin');
        const credentialCommand=files.indexOf('20261028082314_setup_recovery_credential_commands.sql');
        if(credentialCommand>privileged){
          await replayBatch(replay.slice(privileged+1,credentialCommand));
          await replayBatch([replay[credentialCommand]],'supabase_admin');
          let start=credentialCommand+1;
          const statusIndex=files.indexOf('20261028092339_setup_credential_live_status.sql');
          if(statusIndex>=start){await replayBatch(replay.slice(start,statusIndex));await replayBatch([replay[statusIndex]],'supabase_admin');start=statusIndex+1}
          const preflightIndex=files.indexOf('20261028101638_setup_credential_target_preflight.sql');
          if(preflightIndex>=start){await replayBatch(replay.slice(start,preflightIndex));await replayBatch([replay[preflightIndex]],'supabase_admin');start=preflightIndex+1}
          const rotationIndex=files.indexOf('20261029005352_setup_credential_rotation_ready_fence.sql');
          if(rotationIndex>=start){await replayBatch(replay.slice(start,rotationIndex));await replayBatch([replay[rotationIndex]],'supabase_admin');start=rotationIndex+1}
          const summaryIndex=files.indexOf('20261029144213_tenant_summary_credential_commands.sql');
          if(summaryIndex>=start){
            await replayBatch(replay.slice(start,summaryIndex));
            const summaryMigration=await readFile(join(directory,files[summaryIndex]),'utf8');let normalRoleDenied=false;
            try{await sql(state,summaryMigration,{privateDiagnostics:true})}catch(error){normalRoleDenied=/SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED/.test(error.result?.stderr??'')}
            assert.equal(normalRoleDenied,true,'Business migration role cannot install summary credential maintenance');
            assert.equal(await sql(state,"SELECT to_regnamespace('roomqc_summary_admin') IS NULL;"),'t');
            await replayBatch([replay[summaryIndex]],'supabase_admin');start=summaryIndex+1;
            state.summaryCredentialMaintenance={migration:files[summaryIndex],role:'supabase_admin',businessMigrationRoleDenied:true,runtimeRoleUnchanged:true};await save();
          }
          if(start<replay.length)await replayBatch(replay.slice(start));
        }else if(privileged+1<replay.length)await replayBatch(replay.slice(privileged+1));
        state.migrationMaintenanceSessions=[{migration:files[privileged],role:'supabase_admin',runtimeRoleUnchanged:true}];
      }
    }
    assert.equal(state.applied,files.length);await save();
    state.migrationSetHash=hasher.digest('hex');
    if(state.setupRecoveryPlannedSchema){
      // PostgREST cannot load a non-existent exposed schema. Migrate first,
      // then recreate only REST with the new explicit schema allowlist.
      const schemas=new Set((bundle.services.rest.environment.PGRST_DB_SCHEMAS??'public,graphql_public').split(','));
      schemas.add(state.setupRecoveryPlannedSchema);bundle.services.rest.environment.PGRST_DB_SCHEMAS=[...schemas].join(',');
      if(files.includes('20261029135816_tenant_summary_scoped_read.sql')){
        schemas.add('roomqc_summary');bundle.services.rest.environment.PGRST_DB_SCHEMAS=[...schemas].join(',');
      }
      const updated=JSON.stringify(bundle,null,2);state.startupBundleHash=state.bundleHash;
      state.bundleHash=createHash('sha256').update(updated).digest('hex');
      await writeFile(bundlePath,updated,{mode:0o600});state.phase='setup_recovery_rest_exposure';await save();
      await privateRun('docker',[...compose,'up','--detach','--no-deps','--wait','--wait-timeout','60','rest'],{timeout:120000});
      state.setupRecoveryExposedSchema=state.setupRecoveryPlannedSchema;
      emit('backend_setup_recovery_rest_exposed',{schema:state.setupRecoveryExposedSchema,afterMigrations:state.applied});await save();
    }
    if(passwordFaultServices.length) {
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...passwordFaultServices],{timeout:120000});
      state.passwordConfigServices=[];
      for(const name of passwordFaultServices) {
        const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);
        assert.equal(info.Image,state.passwordAuthBuild.imageId);
        assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);
        state.passwordConfigServices.push({name,imageId:info.Image,publishedPorts:0,internalOnly:true});
      }
      emit('backend_password_config_services',{services:state.passwordConfigServices});
    }
    const managedExporter=(!diagnostic||managedDiagnostic)
      ?await prepareManagedExporterRole({state,repository,privateRun}):null;
    await capturePartitionCatalog(state);await save();
    state.preInitializationSchemaHash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
    assert.match(state.preInitializationSchemaHash,/^[a-f0-9]{64}$/);state.phase='verified_sql_replay';
    const fingerprintSource=(await readFile(join(directory,'20261019142205_control_realtime_partition_attestation.sql'),'utf8'));
    const canonical=fingerprintSource.slice(fingerprintSource.indexOf('WITH RECURSIVE'),fingerprintSource.indexOf('SELECT encode(sha256'));
    assert.ok(canonical.startsWith('WITH RECURSIVE'));
    const schemaParts=async()=>{
      const value=JSON.parse(await sql(state,canonical+`SELECT json_agg(json_build_object('kind',kind,'identity',identity,
        'hash',encode(sha256(convert_to(definition::text,'UTF8')),'hex')) ORDER BY kind COLLATE "C",identity COLLATE "C") FROM parts;`));
      assert.equal(new Set(value.map(v=>v.kind+':'+v.identity)).size,value.length,'Canonical identities must not collide or truncate');return value;
    };
    const changes=(before,after)=>{
      const old=new Map(before.map(v=>[v.kind+':'+v.identity,v])),current=new Map(after.map(v=>[v.kind+':'+v.identity,v]));
      return [...new Set([...old.keys(),...current.keys()])].filter(key=>old.get(key)?.hash!==current.get(key)?.hash)
        .map(key=>{const row=current.get(key)??old.get(key);return {kind:row.kind,identity:row.identity,
          change:!old.has(key)?'added':!current.has(key)?'removed':'changed'}});
    };
    const beforeInitialization=await schemaParts();
    await writeFile(join(root,'pre-initialization-schema-parts.json'),JSON.stringify(beforeInitialization,null,2),{mode:0o600});
    emit('backend_migrations_verified',{applied:state.applied,preInitializationSchemaHash:state.preInitializationSchemaHash,
      migrationSetHash:state.migrationSetHash,schemaFrozen:false,fullFiveProbesVerified:false,signupOpened:false});
    if(diagnostic==='permission-session'){
      assert.equal(String(bundle.services.auth.environment.GOTRUE_JWT_EXP),'3600');
      state.phase='permission_session_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const setup=await readFile(join(repository,'scripts','control-backend-service-setup.mjs'),'utf8');
      const canaries=JSON.parse((await privateRun('docker',['exec','-i','--env','ROOMQC_FIXTURE_SERVICE_KEY',
        state.projectId+'-storage','node','--input-type=module'],{input:setup,
        env:{...env,ROOMQC_FIXTURE_SERVICE_KEY:secrets.SERVICE_ROLE_KEY},timeout:30000})).stdout);
      // Deliberately age the initial token. The check must prove both its denial
      // and a fresh same-identity login without changing Auth's JWT expiry.
      const payload=JSON.parse(Buffer.from(canaries.auth.token.split('.')[1],'base64url'));
      const now=Math.floor(Date.now()/1000);payload.iat=now-7200;payload.exp=now-3600;
      const body=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
        Buffer.from(JSON.stringify(payload)).toString('base64url')].join('.');
      const expired=body+'.'+createHmac('sha256',secrets.JWT_SECRET).update(body).digest('base64url');
      const source=await readFile(join(repository,'scripts','control-backend-permission-checks.mjs'),'utf8');
      const permission=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_PERMISSION_INPUT:JSON.stringify({
        publishableKey:secrets.ANON_KEY,auth:{...canaries.auth,token:expired},installer:canaries.installer,
        authSessionOnly:true})})).stdout);
      assert.equal(permission.verified,true);assert.equal(permission.auth.userId,canaries.auth.userId);
      state.permissionAuthControls={verified:true,checks:permission.checks,initialTokenExpired:true,
        authJwtExpiryUnchanged:true};
      state.permissionAuthSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.permissionAuthSchemaAfter,state.schemaManifestHash);
      emit('backend_permission_auth_controls',state.permissionAuthControls);
      await verifySource();state.phase='permission_session_diagnostic_verified';await save();return;
    }
    if(diagnostic==='directory-integration'){
      state.phase='directory_integration_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const source=await readFile(join(repository,'scripts/control-backend-directory-integration-checks.mjs'),'utf8');
      let result;
      try{result=await runClient(source,{ROOMQC_FIXTURE_DIRECTORY_INPUT:JSON.stringify({run:state.run,
        publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000,{memory:'256m'});}
      catch(error){
        try{const failed=JSON.parse(error.result?.stdout??'null');
          if(failed?.verified===false&&Array.isArray(failed.checks))state.directoryIntegrationControls=failed;
        }catch{}throw error;
      }
      state.directoryIntegrationControls=JSON.parse(result.stdout);
      assert.equal(state.directoryIntegrationControls.verified,true);
      state.directoryIntegrationSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.directoryIntegrationSchemaAfter,state.schemaManifestHash,'Directory checks must not change business schema');
      emit('backend_directory_integration_controls',state.directoryIntegrationControls);
      await verifySource();state.phase='directory_integration_diagnostic_verified';await save();return;
    }
    if(['customer-journey','ssh-customer-journey','management-customer-journey','browser-journey','browser-customer-journey'].includes(diagnostic)){
      state.phase='customer_journey_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const initialize=await readFile(join(repository,'scripts/control-backend-realtime-init.mjs'),'utf8');
      let initialized;
      for(let round=0;round<2;round++){
        const result=JSON.parse((await runClient(initialize,{ROOMQC_FIXTURE_INIT_INPUT:JSON.stringify({
          publishableKey:secrets.ANON_KEY,token:secrets.ROOMQC_FIXTURE_PROBE_TOKEN})})).stdout);
        assert.deepEqual(result,{realtimeInitialized:true,roundTrips:1});
        const current=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        if(round===0)initialized=current;else assert.equal(current,initialized,'Journey Realtime startup must stabilize before customer writes');
      }
      state.schemaManifestHash=initialized;state.customerJourneyRealtimeInitialized=true;await save();
      if(['browser-journey','browser-customer-journey'].includes(diagnostic)){
        state.customerBrowserControls=await runBrowserJourneyDiagnostic({repository,state,privateRun,compose,runClient,save,emit,invitationCallerSource,seeded:diagnostic==='browser-customer-journey',
          input:{run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD}});
        assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),state.schemaManifestHash);
        await verifySource();
        if(persistentLocalDemo){
          const owned=await objects(state);
          for(const object of owned.filter(value=>value.kind==='container'))await privateRun('docker',['update','--restart','unless-stopped',object.name]);
          state.phase='persistent_local_demo_ready';await save();
          await writeFile(join(repository,'.local','roomqc-signup-demo.json'),JSON.stringify({version:1,ownership:join(root,'ownership.json'),origin:state.browserOrigin}),{mode:0o600});
        }else state.phase='browser_journey_diagnostic_verified';
        await save();return;
      }
      const journey=async management=>{
        const value=await runCustomerJourneyDiagnostic({repository,state,privateRun,compose,runClient,invitationCallerSource,
          input:{run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,
            ...(management?{management}: {})}});
        state.customerJourneyControls=value;await save();return value;
      };
      if(diagnostic==='management-customer-journey'){
        state.phase='management_ssh_install_and_journey';await save();
        state.managementDeployment=await runManagementInstallerJourneyLocal({repository,
          backend:{diagnosticOnly:true,run:state.run,network:state.projectId+'_default',
            gatewayContainer:backendContainerArguments([state.projectId+'-api-gw'],state)[0],
            publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY},
          transport:sshDeployment,onInstalled:journey,
          controlImage:process.env.ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE});
      }else await journey();
      state.customerJourneySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.customerJourneySchemaAfter,state.schemaManifestHash,'Customer journey must not change the business schema');
      emit('backend_customer_journey_controls',state.customerJourneyControls);
      await verifySource();state.phase='customer_journey_diagnostic_verified';await save();return;
    }
    if(diagnostic==='realtime-tls'){
      state.phase='realtime_tls_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      state.realtimeTlsControls=await runRealtimeTlsDiagnostic({repository,state,bundle,privateRun,runClient,sql,compose,save,
        input:{run:state.run,databasePassword:secrets.POSTGRES_PASSWORD,serviceKey:secrets.SERVICE_ROLE_KEY},
        captureSchemaChanges:async()=>changes(beforeInitialization,await schemaParts()),
        progress:details=>emit('backend_realtime_tls_phase',details)});
      emit('backend_realtime_tls_controls',state.realtimeTlsControls);
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='realtime_tls_diagnostic_verified';await save();return;
    }
    if(diagnostic?.startsWith('realtime-bootstrap')){
      state.phase='realtime_bootstrap_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      state.realtimeBootstrapControls=await runRealtimeBootstrapDiagnostic({repository,state,bundle,privateRun,runClient,sql,
        fresh:diagnostic==='realtime-bootstrap-fresh',compose,save,
        input:{run:state.run,databasePassword:secrets.POSTGRES_PASSWORD,serviceKey:secrets.SERVICE_ROLE_KEY},
        captureSchemaChanges:async()=>changes(beforeInitialization,await schemaParts()),
        progress:details=>emit('backend_realtime_bootstrap_phase',details)});
      emit('backend_realtime_bootstrap_controls',state.realtimeBootstrapControls);
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='realtime_bootstrap_diagnostic_verified';await save();return;
    }
    if(diagnostic==='realtime-resource'){
      state.phase='realtime_resource_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      state.realtimeResourceControls=await runRealtimeResourceDiagnostic({repository,state,bundle,privateRun,runClient,sql,
        input:{run:state.run,databasePassword:secrets.POSTGRES_PASSWORD,serviceKey:secrets.SERVICE_ROLE_KEY},
        captureSchemaChanges:async()=>{
          const parts=await schemaParts(),delta=changes(beforeInitialization,parts);
          await writeFile(join(root,'realtime-active-schema-parts.json'),JSON.stringify(parts,null,2),{mode:0o600});
          emit('backend_realtime_active_schema_changes',{changes:delta});return delta;
        },
        progress:details=>emit('backend_realtime_resource_phase',details)});
      emit('backend_realtime_resource_controls',state.realtimeResourceControls);
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='realtime_resource_diagnostic_verified';await save();return;
    }
    if(diagnostic==='realtime-tenant'){
      state.phase='realtime_tenant_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const source=await readFile(join(repository,'scripts','control-backend-realtime-tenant-checks.mjs'),'utf8');
      state.realtimeTenantControls=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_REALTIME_TENANT_INPUT:JSON.stringify({
        run:state.run,databasePassword:secrets.POSTGRES_PASSWORD,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY})},180000,{memory:'256m'})).stdout);
      emit('backend_realtime_tenant_controls',state.realtimeTenantControls);await save();
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      state.realtimeTenantSchemaFingerprint={before:state.schemaManifestHash,after:state.diagnosticSchemaAfter,
        unchanged:state.diagnosticSchemaAfter===state.schemaManifestHash};
      emit('backend_realtime_tenant_schema_fingerprint',state.realtimeTenantSchemaFingerprint);
      await verifySource();state.phase='realtime_tenant_diagnostic_verified';await save();return;
    }
    if(diagnostic==='storage-resource'){
      state.phase='storage_resource_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const exercise=async phase=>JSON.parse((await runClient("import {runStorageResourceChecks} from '/control/testing/storage-resource-native.mjs'; console.log(JSON.stringify(await runStorageResourceChecks(JSON.parse(process.env.ROOMQC_FIXTURE_STORAGE_INPUT))));",
        {ROOMQC_FIXTURE_STORAGE_INPUT:JSON.stringify({run:state.run,databasePassword:secrets.POSTGRES_PASSWORD,serviceKey:secrets.SERVICE_ROLE_KEY,phase})},120000,{memory:'256m'})).stdout);
      const initial=await exercise('exercise');assert.equal(initial.verified,true);
      const container=state.projectId+'-storage',before=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
      await privateRun('docker',['restart',container],{timeout:60000});
      const after=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
      assert.equal(after.Image,before.Image);assert.notEqual(after.State.StartedAt,before.State.StartedAt);
      const restarted=await exercise('verify-restart');assert.equal(restarted.verified,true);
      state.storageResourceControls={verified:true,checks:initial.checks+restarted.checks,initial,restarted,actualContainerRestart:true,
        plan:state.storageResourcePlan,productAcceptance:false};emit('backend_storage_resource_controls',state.storageResourceControls);
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='storage_resource_diagnostic_verified';await save();return;
    }
    if(diagnostic==='tenant-summary'){
      state.phase='tenant_summary_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const source=await readFile(join(repository,'scripts/control-backend-tenant-summary-checks.mjs'),'utf8');
      const result=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_TENANT_SUMMARY_INPUT:JSON.stringify({run:state.run,
        publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,jwtSecret:secrets.JWT_SECRET,
        cliSourceSha256:state.sourceBinding.sha256})},600000,{memory:'256m',cliSnapshot:true})).stdout);
      assert.equal(result.verified,true);state.tenantSummaryControls={verified:result.verified,checks:result.checks,containsSecrets:false};
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:result.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_tenant_summary_controls',state.tenantSummaryControls);
      emit('backend_tenant_summary_no_policy_controls',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),state.schemaManifestHash);
      await verifySource();state.phase='tenant_summary_diagnostic_verified';await save();return;
    }
    if(['setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention','setup-runtime-mount','setup-installer','setup-installer-nonroot','setup-installer-filesystem','setup-installer-volume'].includes(diagnostic)){
      state.phase='setup_installer_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const path='scripts/control-backend-setup-installer-checks.mjs';
      const source=await readFile(join(repository,path),'utf8');
      assert.equal(createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),state.sourceBinding.files.find(f=>f.path===path)?.sha256);
      const controls=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_SETUP_DISPATCH_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,jwtSecret:secrets.JWT_SECRET,
        // The nonroot matrix adds 147 real CLI runs to the existing suite.
        // Its finite thirty-minute fixture budget does not change the
        // deadline of any product command or the other diagnostic budgets.
        cliSourceSha256:state.sourceBinding.sha256,cliSourceFiles:state.sourceBinding.files.length,
        nonrootFilesystem:nonrootDiagnostic,realFilesystemFaults:filesystemDiagnostic,volumeOnly:diagnostic==='setup-installer-volume',rotationOnly:['setup-rotation','setup-rotation-faults','setup-rotation-durability','setup-rotation-storage','setup-rotation-contention'].includes(diagnostic),rotationFaultsOnly:diagnostic==='setup-rotation-faults',rotationDurabilityOnly:diagnostic==='setup-rotation-durability',rotationStorageOnly:diagnostic==='setup-rotation-storage',rotationContentionOnly:diagnostic==='setup-rotation-contention',runtimeMountOnly:diagnostic==='setup-runtime-mount',
        faultFilesystem:filesystemDiagnostic?{expectedCSourceSha256:state.faultFilesystemImage.cSourceSha256,expectedBinarySha256:state.faultFilesystemImage.binarySha256}:null})},['setup-rotation-storage','setup-rotation-contention'].includes(diagnostic)?1200000:['setup-rotation','setup-rotation-faults','setup-rotation-durability'].includes(diagnostic)?600000:filesystemDiagnostic?2100000:nonrootDiagnostic?1800000:600000,{memory:'256m',cliSnapshot:true})).stdout);
      state.setupInstallerControls=controls;assert.equal(controls.verified,true);emit('backend_setup_installer_controls',controls);await save();
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);await verifySource();state.phase=diagnostic==='setup-rotation-contention'?'setup_rotation_contention_diagnostic_verified':diagnostic==='setup-rotation-storage'?'setup_rotation_storage_diagnostic_verified':diagnostic==='setup-rotation-durability'?'setup_rotation_durability_diagnostic_verified':diagnostic==='setup-rotation-faults'?'setup_rotation_faults_diagnostic_verified':diagnostic==='setup-runtime-mount'?'setup_runtime_mount_diagnostic_verified':diagnostic==='setup-rotation'?'setup_rotation_diagnostic_verified':filesystemDiagnostic?'setup_installer_filesystem_diagnostic_verified':nonrootDiagnostic?'setup_installer_nonroot_diagnostic_verified':'setup_installer_diagnostic_verified';await save();return;
    }
    if(diagnostic==='support-upgrade'){
      state.phase='support_upgrade_verify587';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      // The current source chain has moved past the historical 587 target.
      // Seed585/verify586 still run at their exact migration boundaries above,
      // but do not execute the old 587 verifier against a 591 schema: that
      // would be a false failure and cannot prove the historical rehearsal.
      if(state.applied!==587){
        state.supportPopulatedUpgrade={verified:false,status:'NOT_RUN',reason:'MIGRATION_CHAIN_MOVED',targetMigrations:587,currentMigrations:state.applied};
        emit('backend_support_populated_upgrade_skipped',state.supportPopulatedUpgrade);
        state.phase='support_upgrade_migration_chain_moved';await save();return;
      }
      state.supportPopulatedUpgrade=await supportUpgradeClient('verify587');
      state.accessCatalog=await captureAccessCatalog({state,sql});
      assert.equal(state.accessCatalog.browserDirectGrantViolations,0);
      const liveSupportOwner={id:supportUpgradeSeed.active.id,sessionId:supportUpgradeSeed.active.session};
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:liveSupportOwner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);
      emit('backend_access_catalog',state.accessCatalog);emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='support_upgrade_diagnostic_verified';await save();return;
    }
    if(['setup-dispatch','setup-worker','support-authority','support-cutover','support-upgrade'].includes(diagnostic)){
      state.phase='setup_dispatch_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const source=await readFile(join(repository,'scripts','control-backend-setup-dispatch-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),state.setupDispatchSourceHash);
      const controls=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_SETUP_DISPATCH_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,jwtSecret:secrets.JWT_SECRET,
        cliSourceSha256:state.sourceBinding.sha256,cliSourceFiles:state.sourceBinding.files.length,workerOnly:diagnostic==='setup-worker',supportAuthorityOnly:['support-authority','support-cutover'].includes(diagnostic),supportCutoverOnly:diagnostic==='support-cutover',
        ...(legacyReference?{legacySourceSha256:legacyReference.source.sha256,legacySourceFiles:legacyReference.source.files.length}:{})})},diagnostic==='support-authority'?420000:['setup-worker','support-upgrade'].includes(diagnostic)?180000:900000,{memory:'256m',cliSnapshot:true})).stdout);
      state.setupDispatchControls=controls;
      if(controls.recoveryFunctionSurface){
        await writeFile(join(root,'setup-recovery-function-catalog.json'),JSON.stringify(controls.recoveryFunctionSurface,null,2),{mode:0o600});
        const {functions,...summary}=controls.recoveryFunctionSurface;
        emit('backend_setup_dispatch_controls',{...controls,recoveryFunctionSurface:{...summary,functionsOmittedFromConsole:functions.length}});
      }else emit('backend_setup_dispatch_controls',controls);
      await save();
      assert.equal(controls.verified,true,'Actual dispatch close/commit/kill/authority controls must pass');
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash,'Fault fixture must restore the complete schema');
      await verifySource();state.phase=diagnostic==='support-cutover'?'support_cutover_diagnostic_verified':diagnostic==='support-authority'?'support_authority_diagnostic_verified':diagnostic==='setup-worker'?'setup_worker_diagnostic_verified':'setup_dispatch_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-utc-upgrade'){
      state.phase='advice_utc_upgrade_post576';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await utcUpgradeClient('post576',utcUpgradeSeed.fixture);
      const services=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
      for(const name of services){const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
        assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);}
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      let edge;
      try{edge=JSON.parse((await runClient(edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({
        phase:'closure-upgrade',fixture:utcUpgradeSeed.fixture,run:state.run,publishableKey:secrets.ANON_KEY,
        serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceUtcUpgradeEdgeFailure={stage:failed.stage,checks:failed.checks,failureCode:failed.failureCode};await save();
        emit('backend_advice_utc_upgrade_edge_failed',state.adviceUtcUpgradeEdgeFailure)}}catch{}throw error}
      state.adviceUtcUpgradeEdgeControls=edge;assert.equal(edge.verified,true);
      const after=await utcUpgradeClient('afterEdge',utcUpgradeSeed.fixture);
      state.adviceUtcUpgradeControls={verified:utcUpgradeSeed.verified&&utcUpgradeRollback.verified&&post.verified&&after.verified&&edge.verified,
        checks:[...utcUpgradeSeed.checks,...utcUpgradeRollback.checks,...post.checks,...after.checks],priorMigrations:575,targetMigrations:576,
        schemaRollbackVerified:true,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,productAccepted:false};
      emit('backend_advice_utc_upgrade_controls',state.adviceUtcUpgradeControls);emit('backend_advice_utc_upgrade_edge_controls',edge);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:utcUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceUtcUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.adviceUtcUpgradeSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='advice_utc_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-closure-upgrade'){
      state.phase='advice_closure_upgrade_post575';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await closureUpgradeClient('post575',closureUpgradeSeed.fixture);
      const services=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
      for(const name of services){const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
        assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);}
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      let edge;
      try{edge=JSON.parse((await runClient(edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({
        phase:'closure-upgrade',fixture:closureUpgradeSeed.fixture,run:state.run,publishableKey:secrets.ANON_KEY,
        serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceClosureUpgradeEdgeFailure={stage:failed.stage,checks:failed.checks,failureCode:failed.failureCode};await save();
        emit('backend_advice_closure_upgrade_edge_failed',state.adviceClosureUpgradeEdgeFailure)}}catch{}throw error}
      state.adviceClosureUpgradeEdgeControls=edge;assert.equal(edge.verified,true);
      const after=await closureUpgradeClient('afterEdge',closureUpgradeSeed.fixture);
      state.adviceClosureUpgradeControls={verified:closureUpgradeSeed.verified&&closureUpgradeRollback.verified&&post.verified&&after.verified&&edge.verified,
        checks:[...closureUpgradeSeed.checks,...closureUpgradeRollback.checks,...post.checks,...after.checks],priorMigrations:574,targetMigrations:575,
        schemaRollbackVerified:true,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,productAccepted:false};
      emit('backend_advice_closure_upgrade_controls',state.adviceClosureUpgradeControls);emit('backend_advice_closure_upgrade_edge_controls',edge);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:closureUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceClosureUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.adviceClosureUpgradeSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='advice_closure_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-clock-upgrade'){
      state.phase='advice_clock_upgrade_post574';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await clockUpgradeClient('post574',clockUpgradeSeed.fixture);
      const services=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
      for(const name of services){const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
        assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);}
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      let edge;
      try{edge=JSON.parse((await runClient(edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({
        phase:'clock-upgrade',fixture:clockUpgradeSeed.fixture,run:state.run,publishableKey:secrets.ANON_KEY,
        serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},120000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceClockUpgradeEdgeFailure={stage:failed.stage,checks:failed.checks,failureCode:failed.failureCode};await save();
        emit('backend_advice_clock_upgrade_edge_failed',state.adviceClockUpgradeEdgeFailure)}}catch{}throw error}
      state.adviceClockUpgradeEdgeControls=edge;assert.equal(edge.verified,true);
      const after=await clockUpgradeClient('afterEdge',clockUpgradeSeed.fixture);
      state.adviceClockUpgradeControls={verified:clockUpgradeSeed.verified&&clockUpgradeRollback.verified&&post.verified&&after.verified&&edge.verified,
        checks:[...clockUpgradeSeed.checks,...clockUpgradeRollback.checks,...post.checks,...after.checks],priorMigrations:573,targetMigrations:574,
        schemaRollbackVerified:true,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,productAccepted:false};
      emit('backend_advice_clock_upgrade_controls',state.adviceClockUpgradeControls);emit('backend_advice_clock_upgrade_edge_controls',edge);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:clockUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceClockUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.adviceClockUpgradeSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='advice_clock_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='operations-advice-upgrade'){
      state.phase='advice_upgrade_post573';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await adviceUpgradeClient('post573',adviceUpgradeSeed.fixture,120000);
      const services=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
      for(const name of services){const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
        assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);}
      const caller=await operationsAdviceCallerSource();assert.deepEqual(caller.build,state.operationsAdviceCallerBuild);
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      let edge;
      try{edge=JSON.parse((await runClient(caller.source+'\n'+edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({phase:'upgrade',
        fixture:{owner:adviceUpgradeSeed.fixture.owner,foreign:adviceUpgradeSeed.fixture.foreign},run:state.run,
        publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceUpgradeEdgeFailure={phase:'upgrade',stage:failed.stage,checks:failed.checks,callerChecks:failed.callerChecks??[],failureCode:failed.failureCode};
        await save();emit('backend_advice_upgrade_edge_failed',state.adviceUpgradeEdgeFailure)}}catch{}throw error}
      state.adviceUpgradeEdgeControls=edge;assert.equal(edge.verified,true);await save();
      const afterEdge=await adviceUpgradeClient('afterEdge',adviceUpgradeSeed.fixture);
      state.adviceUpgradeControls={verified:adviceUpgradeSeed.verified&&adviceUpgradeRollback.verified&&post.verified&&afterEdge.verified&&edge.verified,
        checks:[...adviceUpgradeSeed.checks,...adviceUpgradeRollback.checks,...post.checks,...afterEdge.checks],priorMigrations:572,targetMigrations:573,
        schemaRollbackVerified:true,nativeCallerCompatibility:true,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,productAccepted:false};
      state.adviceUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.adviceUpgradeSchemaAfter,state.preInitializationSchemaHash);
      emit('backend_advice_upgrade_controls',state.adviceUpgradeControls);emit('backend_advice_upgrade_edge_controls',edge);await save();assert.equal(state.adviceUpgradeControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:adviceUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),state.schemaManifestHash);await verifySource();state.phase='advice_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-policy-upgrade'){
      state.phase='advice_policy_post577';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await advicePolicyClient('post577',advicePolicySeed.fixture);
      state.advicePolicyControls={...post,checks:[...advicePolicySeed.checks,...advicePolicyRollback.checks,...post.checks],
        schemaRollbackVerified:true,verified:advicePolicySeed.verified&&advicePolicyRollback.verified&&post.verified,
        priorMigrations:576,targetMigrations:577,actualOldBinaryRollback:false,productAccepted:false};
      state.advicePolicySchemaBefore=state.preInitializationSchemaHash;
      state.advicePolicySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_advice_policy_controls',state.advicePolicyControls);await save();
      assert.equal(state.advicePolicySchemaAfter,state.advicePolicySchemaBefore);assert.equal(state.advicePolicyControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:advicePolicySeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='advice_policy_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='report-upgrade'){
      state.phase='report_upgrade_post572';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=await reportUpgradeClient('post572',reportUpgradeCheckpoint.fixture,120000);
      state.reportUpgradeControls={...post,checks:[...reportUpgradeSeed.checks,...reportUpgradeRollbacks.flatMap(r=>r.checks),...reportUpgradeCheckpoint.checks,...post.checks],
        schemaRollbackVerified:true,verified:reportUpgradeSeed.verified&&reportUpgradeRollbacks.every(r=>r.verified)&&reportUpgradeCheckpoint.verified&&post.verified};
      state.reportUpgradeSchemaBefore=state.preInitializationSchemaHash;
      state.reportUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_report_upgrade_controls',state.reportUpgradeControls);await save();
      assert.equal(state.reportUpgradeSchemaAfter,state.reportUpgradeSchemaBefore);assert.equal(state.reportUpgradeControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:reportUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='report_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='booking-finance-upgrade'){
      state.phase='finance_upgrade_post566';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=JSON.parse((await runClient(financeUpgradeSource,{ROOMQC_FIXTURE_BOOKING_FINANCE_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,
        phase:'post',seed:financeUpgradeCheckpoint.fixture})},120000)).stdout);
      state.financeUpgradeControls={...post,checks:[...financeUpgradeSeed.checks,...financeUpgradeRollbacks.flatMap(r=>r.checks),...financeUpgradeCheckpoint.checks,...post.checks],
        schemaRollbackVerified:true,verified:financeUpgradeSeed.verified&&financeUpgradeRollbacks.every(r=>r.verified)&&financeUpgradeCheckpoint.verified&&post.verified};
      state.financeUpgradeSchemaBefore=state.preInitializationSchemaHash;
      state.financeUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_finance_upgrade_controls',state.financeUpgradeControls);await save();
      assert.equal(state.financeUpgradeSchemaAfter,state.financeUpgradeSchemaBefore);assert.equal(state.financeUpgradeControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:financeUpgradeSeed.fixture.owner}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='finance_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='booking-upgrade'){
      state.phase='booking_upgrade_post';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const post=JSON.parse((await runClient(bookingUpgradeSource,{ROOMQC_FIXTURE_BOOKING_UPGRADE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,
        phase:'post',seed:bookingUpgradeSeed.fixture})},90000)).stdout);
      state.bookingUpgradeControls={...post,checks:[...bookingUpgradeSeed.checks,...bookingUpgradeRollback.checks,...post.checks],
        schemaRollbackVerified:true,verified:bookingUpgradeSeed.verified&&bookingUpgradeRollback.verified&&post.verified};
      state.bookingUpgradeSchemaBefore=state.preInitializationSchemaHash;
      state.bookingUpgradeSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_booking_upgrade_controls',state.bookingUpgradeControls);await save();
      assert.equal(state.bookingUpgradeSchemaAfter,state.bookingUpgradeSchemaBefore);assert.equal(state.bookingUpgradeControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:{id:bookingUpgradeSeed.fixture.ownerId,sessionId:bookingUpgradeSeed.fixture.sessionId}}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='booking_upgrade_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-policy'){
      assert.equal(files.length,577,'Advice policy current diagnostic binds exact577 source chain');
      state.phase='advice_policy_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      advicePolicySource=await readFile(join(repository,'scripts','control-backend-advice-policy-checks.mjs'),'utf8');
      const controls=await advicePolicyClient('current',undefined,secrets.JWT_SECRET,240000);
      const {aclFixture,...safeControls}=controls;state.advicePolicyControls=safeControls;
      emit('backend_advice_policy_controls',safeControls);await save();
      assert.equal(safeControls.verified,true,'Actual live policy command/read/lookup/cancel controls must pass');
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
      state.advicePolicySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');assert.equal(state.advicePolicySchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='advice_policy_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-policy-baseline'){
      assert.equal(files.length,576,'Advice policy baseline binds exact pre-command576 chain');
      state.phase='advice_policy_baseline_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const policySource=await readFile(join(repository,'scripts','control-backend-advice-policy-baseline-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(policySource).digest('hex'),state.advicePolicyBaselineSourceHash);
      let controls;
      try{controls=JSON.parse((await runClient(policySource,{ROOMQC_FIXTURE_ADVICE_POLICY_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},120000)).stdout)}
      catch(error){try{controls=JSON.parse(error.result?.stdout??'null')}catch{}
        if(!controls||!Array.isArray(controls.checks))throw error;}
      const {aclFixture,...safeControls}=controls;state.advicePolicyBaselineControls=safeControls;
      emit('backend_advice_policy_baseline_controls',safeControls);await save();
      if(aclFixture){state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
        assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);}
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.advicePolicyBaselineSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.advicePolicyBaselineSchemaAfter,state.schemaManifestHash);await verifySource();
      state.phase=controls.verified?'advice_policy_baseline_verified':'advice_policy_baseline_red';await save();
      if(!controls.verified)throw new Error('ADVICE_POLICY_BASELINE_PRODUCT_DEFECTS');return;
    }
    if(diagnostic==='advice-utc'){
      state.phase='advice_utc_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const utcSource=await readFile(join(repository,'scripts','control-backend-advice-utc-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(utcSource).digest('hex'),state.adviceUtcSourceHash);
      let controls;
      try{controls=JSON.parse((await runClient(utcSource,{ROOMQC_FIXTURE_ADVICE_UTC_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed&&Array.isArray(failed.checks)){
        state.adviceUtcFailure={stage:failed.stage,checks:failed.checks,barriers:failed.barriers,findings:failed.findings,
          clockExpressionsReplaced:failed.clockExpressionsReplaced,originalDefinitionsRestored:failed.originalDefinitionsRestored,failureCode:failed.failureCode};
        await save();emit('backend_advice_utc_failed',state.adviceUtcFailure)}}catch{}
        if(state.adviceUtcFailure?.originalDefinitionsRestored){
          state.adviceUtcSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
          assert.equal(state.adviceUtcSchemaAfter,state.schemaManifestHash);await verifySource();await save();
        }
        throw error}
      const {aclFixture,...safeControls}=controls;state.adviceUtcControls=safeControls;assert.equal(safeControls.verified,true);
      emit('backend_advice_utc_controls',safeControls);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceUtcSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.adviceUtcSchemaAfter,state.schemaManifestHash);await verifySource();state.phase='advice_utc_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-edge-authority'){
      state.phase='advice_edge_authority_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const services=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
      for(const name of services){const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
        assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);}
      const authoritySource=await readFile(join(repository,'scripts','control-backend-advice-edge-authority-checks.mjs'),'utf8');
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(authoritySource).digest('hex'),state.adviceEdgeAuthoritySourceHash);
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      let controls;
      try{controls=JSON.parse((await runClient(authoritySource+'\n'+edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({
        phase:'authority',run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed?.verified===false&&Array.isArray(failed.checks)){
        state.adviceEdgeAuthorityFailure={stage:failed.stage,checks:failed.checks,observations:failed.observations,failureCode:failed.failureCode};
        await save();emit('backend_advice_edge_authority_failed',state.adviceEdgeAuthorityFailure)}}catch{}
        state.adviceEdgeAuthoritySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        assert.equal(state.adviceEdgeAuthoritySchemaAfter,state.schemaManifestHash);await verifySource();await save();throw error;}
      const {aclFixture,...safeControls}=controls;state.adviceEdgeAuthorityControls=safeControls;assert.equal(safeControls.verified,true);
      emit('backend_advice_edge_authority_controls',safeControls);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceEdgeAuthoritySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.adviceEdgeAuthoritySchemaAfter,state.schemaManifestHash);await verifySource();state.phase='advice_edge_authority_diagnostic_verified';await save();return;
    }
    if(diagnostic==='advice-authority'){
      state.phase='advice_authority_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const authoritySource=await readFile(join(repository,'scripts','control-backend-advice-authority-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(authoritySource).digest('hex'),state.adviceAuthoritySourceHash);
      let controls;
      try{controls=JSON.parse((await runClient(authoritySource,{ROOMQC_FIXTURE_ADVICE_AUTHORITY_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000)).stdout)}
      catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed&&Array.isArray(failed.checks)){
        state.adviceAuthorityFailure={stage:failed.stage,checks:failed.checks,races:failed.races,failureCode:failed.failureCode};
        await save();emit('backend_advice_authority_failed',state.adviceAuthorityFailure)}}catch{}throw error}
      const {aclFixture,...safeControls}=controls;state.adviceAuthorityControls=safeControls;assert.equal(safeControls.verified,true);
      emit('backend_advice_authority_controls',safeControls);await save();
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      state.adviceAuthoritySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.adviceAuthoritySchemaAfter,state.schemaManifestHash);await verifySource();state.phase='advice_authority_diagnostic_verified';await save();return;
    }
    if(diagnostic==='operations-advice'){
      state.phase='operations_advice_checks';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const adviceSource=await readFile(join(repository,'scripts','control-backend-operations-advice-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(adviceSource).digest('hex'),state.operationsAdviceSourceHash);
      let controls;
      try{controls=JSON.parse((await runClient(adviceSource,{ROOMQC_FIXTURE_WORKFLOW_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000)).stdout)}
      catch(error){
        try{const failed=JSON.parse(error.result?.stdout??'null');if(failed&&Array.isArray(failed.checks)){
          state.operationsAdviceFailure={stage:failed.stage,checks:failed.checks,failureCode:failed.failureCode};await save();
          emit('backend_operations_advice_failed',state.operationsAdviceFailure)}}catch{}
        throw error;
      }
      const {aclFixture,...safeControls}=controls;state.operationsAdviceControls=safeControls;
      const adviceServices=['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...adviceServices],{timeout:90000});
      const inspectAdvice=async()=>{
        const result=[];
        for(const name of adviceServices){
          const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
          assert.equal(info.Config.Labels?.[ownerLabel],state.run);
          assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
          assert.equal(info.Config.Image,state.operationsAdviceBuild.image);
          assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
          assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);
          result.push({name,image:info.Image,startedAt:info.State.StartedAt});
        }
        return result;
      };
      const beforeRestart=await inspectAdvice();
      const edgeSource=await readFile(join(repository,'scripts','control-backend-operations-advice-edge-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(edgeSource).digest('hex'),state.operationsAdviceEdgeSourceHash);
      const adviceCaller=await operationsAdviceCallerSource();assert.deepEqual(adviceCaller.build,state.operationsAdviceCallerBuild);
      const runAdviceEdge=async(phase,fixture)=>{
        try{return JSON.parse((await runClient(adviceCaller.source+'\n'+edgeSource,{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({phase,fixture,
          run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout)}
        catch(error){try{const failed=JSON.parse(error.result?.stdout??'null');if(failed&&Array.isArray(failed.checks)){
          state.operationsAdviceEdgeFailure={phase,stage:failed.stage,checks:failed.checks,callerChecks:failed.callerChecks??[],failureCode:failed.failureCode};
          await save();emit('backend_operations_advice_edge_failed',state.operationsAdviceEdgeFailure)}}catch{}throw error}
      };
      const edge=await runAdviceEdge('exercise'),{fixture:restartFixture,...edgeSafe}=edge;
      state.operationsAdviceEdgeControls=edgeSafe;assert.equal(edgeSafe.verified,true);await save();
      await privateRun('docker',[...compose,'restart','--timeout','10',...adviceServices],{timeout:60000});
      const afterRestart=await inspectAdvice();
      assert.ok(afterRestart.every((v,i)=>v.image===beforeRestart[i].image&&v.startedAt!==beforeRestart[i].startedAt));
      const resumed=await runAdviceEdge('resume',restartFixture);
      state.operationsAdviceEdgeRestart={...resumed,actualProcessRestart:true,imagesUnchanged:true,internalOnly:true};
      assert.equal(resumed.verified,true);emit('backend_operations_advice_edge_controls',edgeSafe);
      emit('backend_operations_advice_edge_restart',state.operationsAdviceEdgeRestart);await save();
      state.phase='operations_advice_interruption';await save();
      try{
        const interruption=await runAdviceInterruption({state,source:adviceCaller.source+'\n'+edgeSource,privateRun,runClient,
          values:{ROOMQC_FIXTURE_ADVICE_EDGE_INPUT:JSON.stringify({phase:'interrupt',run:state.run,publishableKey:secrets.ANON_KEY,
            serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})}});
        state.operationsAdviceInterruptionControls=interruption.controls;state.operationsAdviceInterruptionProcess=interruption.processProof;
        await save();emit('backend_operations_advice_interruption_controls',interruption.controls);emit('backend_operations_advice_interruption_process',interruption.processProof);
      }catch(error){try{
        const failed=JSON.parse((error.result?.stdout??'').split(/\r?\n/).filter(Boolean).at(-1)??'null');
        if(failed?.verified===false&&Array.isArray(failed.checks)){
          state.operationsAdviceInterruptionFailure={stage:failed.stage,checks:failed.checks,failureCode:failed.failureCode};
          await save();emit('backend_operations_advice_interruption_failed',state.operationsAdviceInterruptionFailure)}
      }catch{}throw error}
      state.operationsAdviceSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.operationsAdviceSchemaAfter,state.preInitializationSchemaHash);
      emit('backend_operations_advice_controls',safeControls);await save();assert.equal(safeControls.verified,true);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);
      if(advisorsCli){state.phase='advisors';await save();state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors)}
      assert.equal(await sql(state,'SELECT private.roomqc_schema_fingerprint();'),state.schemaManifestHash);
      await verifySource();state.phase='operations_advice_diagnostic_verified';await save();return;
    }
    const runInvitationStage=async()=>{
      state.phase='staff_invitation_diagnostic';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const invitationServices=['staff-invitation-test','staff-invitation-send-test','create-user-invitation-test'];
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...invitationServices],{timeout:90000});
      for(const name of invitationServices){
        const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-'+name])).stdout)[0];
        assert.equal(info.Config.Labels?.[ownerLabel],state.run);
        assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
        assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);
      }
      const invitationSource=await readFile(join(repository,'scripts','control-backend-staff-invitation-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(invitationSource).digest('hex'),state.staffInvitationSourceHash);
      const deliverySource=await readFile(join(repository,'scripts','control-backend-invitation-delivery.mjs'),'utf8');
      assert.equal(createHash('sha256').update(deliverySource).digest('hex'),state.staffInvitationDeliverySourceHash);
      const authoritySource=await readFile(join(repository,'scripts','control-backend-invitation-authority.mjs'),'utf8');
      assert.equal(createHash('sha256').update(authoritySource).digest('hex'),state.staffInvitationAuthoritySourceHash);
      const invitationCaller=await invitationCallerSource();assert.deepEqual(invitationCaller.build,state.staffInvitationCallerBuild);
      state.staffInvitationControls=JSON.parse((await runClient(invitationCaller.source+'\n'+deliverySource+'\n'+authoritySource+'\n'+invitationSource,{ROOMQC_FIXTURE_INVITATION_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},300000)).stdout);
      state.staffInvitationSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.staffInvitationSchemaAfter,state.preInitializationSchemaHash,'Invitation fixture must not drift schema');
      emit('backend_staff_invitation_diagnostic',state.staffInvitationControls);await save();
      assert.equal(state.staffInvitationControls.verified,true,'Actual staff invitation endpoint and native password setup');
      if(diagnostic){
        if(advisorsCli){
          state.phase='advisors';await save();
          state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});
          emit('backend_advisors',state.advisors);
          state.staffInvitationSchemaAfterAdvisors=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
          assert.equal(state.staffInvitationSchemaAfterAdvisors,state.preInitializationSchemaHash);await save();
        }
        await verifySource();state.phase='staff_invitation_diagnostic_verified';await save();return;
      }
    };
    if(diagnostic==='staff-invitation'){await runInvitationStage();return;}
    const runWorkflowDeliveryStage=async()=>{
      state.phase='workflow_delivery_checks';await save();
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','workflow-delivery-test'],{timeout:90000});
      const info=JSON.parse((await privateRun('docker',['container','inspect',state.projectId+'-workflow-delivery-test'])).stdout)[0];
      assert.equal(info.Config.Labels?.[ownerLabel],state.run);
      assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
      assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);
      const workflowSource=await readFile(join(repository,'scripts','control-backend-workflow-delivery-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(workflowSource).digest('hex'),state.workflowDeliverySourceHash);
      const schemaBefore=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const controls=JSON.parse((await runClient(workflowSource,{ROOMQC_FIXTURE_WORKFLOW_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout);
      const {aclFixture,...safeControls}=controls;
      state.workflowDeliveryControls=safeControls;
      state.workflowDeliverySchemaBefore=schemaBefore;
      state.workflowDeliverySchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_workflow_delivery_controls',safeControls);await save();
      assert.equal(state.workflowDeliverySchemaAfter,schemaBefore,'Temporary workflow faults must not drift schema');
      assert.equal(safeControls.verified,true,'Actual delivery source, RPC and Edge controls must pass');
      if(diagnostic==='workflow-delivery'){
        state.schemaManifestHash=state.preInitializationSchemaHash;
        assert.equal(schemaBefore,state.schemaManifestHash);
        assert.equal(createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-no-policy-checks.mjs'))).digest('hex'),state.noPolicySourceHash);
        state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
        assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
        if(advisorsCli){
          state.phase='advisors';await save();
          state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});
          emit('backend_advisors',state.advisors);
        }
        state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
        await verifySource();state.phase='workflow_delivery_diagnostic_verified';await save();
      }
    };
    if(diagnostic==='workflow-delivery'){await runWorkflowDeliveryStage();return;}
    const runRoomSourceStage=async()=>{
      state.phase='room_source_checks';await save();
      const source=await readFile(join(repository,'scripts','control-backend-room-source-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),state.roomSourceHash);
      const schemaBefore=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const caller=await roomCallerSource();assert.deepEqual(caller.build,state.roomCallerBuild);
      const controls=JSON.parse((await runClient(caller.source+'\n'+source,{ROOMQC_FIXTURE_WORKFLOW_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout);
      const {aclFixture,...safeControls}=controls;
      state.roomSourceControls=safeControls;state.roomSourceSchemaBefore=schemaBefore;
      state.roomSourceSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_room_source_controls',safeControls);await save();
      assert.equal(state.roomSourceSchemaAfter,schemaBefore,'Temporary room source faults must not drift schema');
      assert.equal(safeControls.verified,true,'Actual room source authorization, replay and atomicity must pass');
      if(diagnostic==='room-source'){
        state.schemaManifestHash=state.preInitializationSchemaHash;assert.equal(schemaBefore,state.schemaManifestHash);
        assert.equal(createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-no-policy-checks.mjs'))).digest('hex'),state.noPolicySourceHash);
        state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
        assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
        if(advisorsCli){state.phase='advisors';await save();
          state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
        state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
        assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);await verifySource();
        state.phase='room_source_diagnostic_verified';await save();
      }
    };
    if(diagnostic==='room-source'){await runRoomSourceStage();return;}
    const runReportTargetTransportStage=async()=>{
      state.phase='report_target_transport_checks';await save();
      const caller=await reportTargetCallerSource();assert.deepEqual(caller.build,state.reportTargetCallerBuild);
      const source=await readFile(join(repository,'scripts','control-backend-report-target-transport-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),state.reportTargetTransportSourceHash);
      const before=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const controls=JSON.parse((await runClient(caller.source+'\nconst roomqcTransportCallerSource='+JSON.stringify(caller.source)+';\n'+source,{
        ROOMQC_FIXTURE_TARGET_TRANSPORT_INPUT:JSON.stringify({run:state.run,publishableKey:secrets.ANON_KEY,
          serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000,{memory:'256m'})).stdout);
      state.reportTargetTransportControls=controls;state.reportTargetTransportSchemaBefore=before;
      state.reportTargetTransportSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_report_target_transport_controls',controls);await save();
      assert.equal(controls.verified,true,'Actual report target caller must recover TCP loss and process restarts');
      assert.equal(state.reportTargetTransportSchemaAfter,before,'Report target transport fixture must not drift schema');
      await verifySource();
    };
    if(diagnostic==='revenue-report'){
      state.phase='revenue_report_checks';await save();
      const source=await readFile(join(repository,'scripts','control-backend-revenue-report-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),state.revenueReportSourceHash);
      const schemaBefore=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const controls=JSON.parse((await runClient(source,{ROOMQC_FIXTURE_WORKFLOW_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout);
      const {aclFixture,...safeControls}=controls;
      state.revenueReportControls=safeControls;state.revenueReportSchemaBefore=schemaBefore;
      state.revenueReportSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_revenue_report_controls',safeControls);await save();
      assert.equal(state.revenueReportSchemaAfter,schemaBefore,'Read-only finance checks must not drift schema');
      assert.equal(safeControls.verified,true,'Actual report authority, calendar recognition and complete aggregates must pass');
      await runReportTargetTransportStage();
      state.schemaManifestHash=state.preInitializationSchemaHash;assert.equal(schemaBefore,state.schemaManifestHash);
      state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
      assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
      if(advisorsCli){state.phase='advisors';await save();
        state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});emit('backend_advisors',state.advisors);}
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);await verifySource();
      state.phase='revenue_report_diagnostic_verified';await save();return;
    }
    const runRoomWriterStage=async()=>{
      state.phase='room_writer_checks';await save();
      const source=await readFile(join(repository,'scripts','control-backend-room-writer-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),state.roomWriterSourceHash);
      const caller=await roomOperationCallerSource();assert.deepEqual(caller.build,state.roomOperationCallerBuild);
      const externalChecks=await readFile(join(repository,'scripts','control-backend-booking-external-checks.mjs'),'utf8');
      const flagChecks=await readFile(join(repository,'scripts','control-backend-booking-flag-checks.mjs'),'utf8');
      const schemaBefore=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      const controls=JSON.parse((await runClient(caller.source+'\n'+externalChecks+'\n'+flagChecks+'\n'+source,{ROOMQC_FIXTURE_WORKFLOW_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout);
      const {aclFixture,...safeControls}=controls;
      state.roomWriterControls=safeControls;state.roomWriterSchemaBefore=schemaBefore;
      state.roomWriterSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_room_writer_controls',safeControls);await save();
      assert.equal(state.roomWriterSchemaAfter,schemaBefore,'Temporary room writer faults must not drift schema');
      if(diagnostic==='room-writers'){
        state.schemaManifestHash=state.preInitializationSchemaHash;assert.equal(schemaBefore,state.schemaManifestHash);
        assert.equal(createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-no-policy-checks.mjs'))).digest('hex'),state.noPolicySourceHash);
        state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks({owner:aclFixture}),{privateDiagnostics:true}));
        assert.equal(state.noPolicyControls.verified,true);emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
      }
      await verifySource();
      assert.equal(safeControls.verified,true,'Actual compound room writers must pass authority, positive flows and source effects');
      if(diagnostic==='room-writers'){
        state.schemaManifestHash=state.preInitializationSchemaHash;assert.equal(schemaBefore,state.schemaManifestHash);
        state.phase='room_writer_diagnostic_verified';await save();
      }
    };
    if(diagnostic==='room-writers'){await runRoomWriterStage();return;}
    const runEmployeeUpdateStage=async()=>{
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','employee-update-test'],{timeout:90000});
      const instance=(await objects(state)).find(v=>v.kind==='container'&&v.name===state.projectId+'-employee-update-test');
      assert.ok(instance);assert.deepEqual(Object.keys(instance.info.NetworkSettings.Networks),[state.projectId+'-internal']);
      assert.ok(!Object.values(instance.info.NetworkSettings.Ports??{}).some(value=>value?.length));
      state.employeeUpdateBuild.startedInternalOnly=true;await save();
    };
    if(diagnostic==='employee-profile')await runEmployeeUpdateStage();
    if(diagnostic&&!managedDiagnostic&&diagnostic!=='parent-boundary'){
      const kind=diagnostic==='self-profile'?'selfProfile':['password','password-policy','password-guard'].includes(diagnostic)?'password':'employeeProfile';
      state.phase=diagnostic.replace('-','_')+'_diagnostic';state.schemaManifestHash=state.preInitializationSchemaHash;await save();
      const caller=diagnostic==='password-guard'?await passwordCallerSource():{source:''};
      if(caller.source)assert.deepEqual(caller.build,state.passwordCallerBuild,'Application password caller source changed during run');
      const employeeSource=await readFile(join(repository,'scripts','control-backend-employee-profile-checks.mjs'),'utf8');
      const selfSource=diagnostic==='self-profile'?await readFile(join(repository,'scripts','control-backend-self-profile-checks.mjs'),'utf8'):'';
      const passwordSource=['password','password-policy','password-guard'].includes(diagnostic)?await readFile(join(repository,'scripts','control-backend-password-checks.mjs'),'utf8'):'';
      const passwordAdversarialSource=diagnostic==='password-guard'?await readFile(join(repository,'scripts','control-backend-password-adversarial-checks.mjs'),'utf8'):'';
      const passwordConfigSource=diagnostic==='password-guard'?await readFile(join(repository,'scripts','control-backend-password-config-checks.mjs'),'utf8'):'';
      const scopeSource=await readFile(join(repository,'scripts','control-backend-hotel-scope-checks.mjs'),'utf8');
      assert.equal(createHash('sha256').update(employeeSource).digest('hex'),state.employeeProfileSourceHash);
      if(selfSource)assert.equal(createHash('sha256').update(selfSource).digest('hex'),state.selfProfileSourceHash);
      if(passwordSource)assert.equal(createHash('sha256').update(passwordSource).digest('hex'),state.passwordSourceHash);
      if(passwordAdversarialSource)assert.equal(createHash('sha256').update(passwordAdversarialSource).digest('hex'),state.passwordAdversarialSourceHash);
      if(passwordConfigSource)assert.equal(createHash('sha256').update(passwordConfigSource).digest('hex'),state.passwordConfigSourceHash);
      assert.equal(createHash('sha256').update(scopeSource).digest('hex'),state.hotelScopeSourceHash);
      const result=JSON.parse((await runClient(caller.source+'\n'+employeeSource+'\n'+selfSource+'\n'+passwordAdversarialSource+'\n'+passwordConfigSource+'\n'+passwordSource+'\n'+scopeSource,{ROOMQC_FIXTURE_HOTEL_SCOPE_INPUT:JSON.stringify({
        run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,
        diagnosticOnly:true,diagnostic,passwordSdk:['password-policy','password-guard'].includes(diagnostic),passwordGuard:diagnostic==='password-guard',passwordCaller:diagnostic==='password-guard',passwordConfig:diagnostic==='password-guard'})},240000)).stdout);
      assert.equal(result.diagnosticOnly,true);assert.equal(result.fullIntegratedRun,false);
      state[kind+'Diagnostic']=result;state[kind+'Controls']=result[kind+'Controls'];
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      emit('backend_'+diagnostic.replace('-','_')+'_diagnostic',result);await save();
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash,'Diagnostic temporary faults must not drift schema');
      assert.equal(result.verified,true,'Diagnostic must pass; it is not full acceptance');
      await verifySource();state.phase=diagnostic.replace('-','_')+'_diagnostic_verified';await save();return;
    }
    const auditProbePrivileges=async()=>JSON.parse(await sql(state,`SELECT json_build_object(
      'businessTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m')
        AND c.relname<>'roomqc_release_manifest' AND has_schema_privilege('roomqc_control_probe',n.oid,'USAGE')
        AND (has_table_privilege('roomqc_control_probe',c.oid,'SELECT') OR has_table_privilege('roomqc_control_probe',c.oid,'INSERT')
          OR has_table_privilege('roomqc_control_probe',c.oid,'UPDATE') OR has_table_privilege('roomqc_control_probe',c.oid,'DELETE')
          OR has_any_column_privilege('roomqc_control_probe',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))),
      'businessDefiners',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private') AND p.prosecdef AND has_schema_privilege('roomqc_control_probe',n.oid,'USAGE')
          AND has_function_privilege('roomqc_control_probe',p.oid,'EXECUTE')));`));
    state.phase='functions_start';await save();
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','functions'],{timeout:90000});
    const functionInfo=(await objects(state)).find(v=>v.kind==='container'&&v.name===state.projectId+'-functions');
    assert.ok(functionInfo);assert.deepEqual(Object.keys(functionInfo.info.NetworkSettings.Networks),[state.projectId+'-internal']);
    assert.ok(!Object.values(functionInfo.info.NetworkSettings.Ports??{}).some(v=>v?.length));
    state.phase='functions_offline_started';await save();emit('backend_functions_offline_started',{...state.functionsBuild,verifiedInvoke:false});
    const checks=await readFile(join(repository,'scripts','control-backend-function-checks.mjs'),'utf8');
    const checkFunctions=async(stopped=false)=>JSON.parse((await privateRun('docker',['exec','-i',
      '--env','ROOMQC_FIXTURE_PROBE_TOKEN','--env','ROOMQC_FIXTURE_ANON_KEY','--env','ROOMQC_FIXTURE_SERVICE_KEY',
      '--env','ROOMQC_FIXTURE_FUNCTION_STOPPED',state.projectId+'-storage','node','--input-type=module'],{
      input:checks,env:{...env,ROOMQC_FIXTURE_PROBE_TOKEN:secrets.ROOMQC_FIXTURE_PROBE_TOKEN,ROOMQC_FIXTURE_ANON_KEY:secrets.ANON_KEY,
        ROOMQC_FIXTURE_SERVICE_KEY:secrets.SERVICE_ROLE_KEY,ROOMQC_FIXTURE_FUNCTION_STOPPED:String(stopped)},timeout:45000})).stdout);
    state.phase='functions_invoke';await save();state.functionChecks=[await checkFunctions()];
    await privateRun('docker',['stop','--time','5',state.projectId+'-functions']);state.functionChecks.push(await checkFunctions(true));
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','functions'],{timeout:90000});
    state.functionChecks.push(await checkFunctions());state.phase='functions_offline_verified';await save();
    emit('backend_functions_offline_verified',{checks:state.functionChecks,fullFiveProbesVerified:false,signupOpened:false});
    state.phase='service_setup';await save();
    const setup=await readFile(join(repository,'scripts','control-backend-service-setup.mjs'),'utf8');
    const canaries=JSON.parse((await privateRun('docker',['exec','-i','--env','ROOMQC_FIXTURE_SERVICE_KEY',
      state.projectId+'-storage','node','--input-type=module'],{input:setup,
      env:{...env,ROOMQC_FIXTURE_SERVICE_KEY:secrets.SERVICE_ROLE_KEY},timeout:30000})).stdout);
    assert.match(canaries.auth.userId,/^[a-f0-9-]{36}$/);
    const memberships=await sql(state,`SELECT count(*) FROM public.user_hotels WHERE user_id='${canaries.auth.userId}';`);
    assert.equal(memberships,'0','Auth canary must not have a business hotel membership');
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','email-admin-test'],{timeout:90000});
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','email-admin-race-test'],{timeout:90000});
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','lifecycle-test'],{timeout:90000});
    await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','provider-webhook-test','provider-queue-test'],{timeout:90000});
    state.phase='email_provider_checks';await save();
    const providerSource=await readFile(join(repository,'scripts','control-backend-email-provider-checks.mjs'),'utf8');
    state.emailProviderControls=JSON.parse((await runClient(providerSource,{ROOMQC_FIXTURE_PROVIDER_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},180000)).stdout);
    assert.equal(state.emailProviderControls.verified,true);
    emit('backend_email_provider_verified',state.emailProviderControls);await save();
    // Provider consumer owns an initially empty queue. Hotel provisioning below
    // legitimately creates ready emails, so its fixtures must follow that drill.
    // Invitation fixtures also provision hotels. Do not discard their valid
    // welcome messages or weaken the provider's empty-queue precondition.
    await runInvitationStage();
    await runWorkflowDeliveryStage();
    await runRoomSourceStage();
    await runRoomWriterStage();
    await runReportTargetTransportStage();
    state.phase='hotel_delete_checks';await save();
    const hotelDeleteSource=await readFile(join(repository,'scripts','control-backend-hotel-delete-checks.mjs'),'utf8');
    try{state.hotelDeleteControls=JSON.parse((await runClient(hotelDeleteSource,{ROOMQC_FIXTURE_HOTEL_DELETE_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},120000)).stdout);
    }catch(error){
      const partial=error.result?.stdout?.trim().split(/\r?\n/).map(line=>{try{return JSON.parse(line)}catch{return null}})
        .find(value=>value?.incomplete===true&&value?.verified===false);
      if(partial){state.hotelDeleteControls=partial;await save();emit('backend_hotel_delete_incomplete',partial)}
      throw error;
    }
    emit('backend_hotel_delete_verified',state.hotelDeleteControls);await save();
    assert.equal(state.hotelDeleteControls.verified,true,'Hotel delete must preserve receipt and enforce live authority');
    state.phase='lifecycle_service_checks';await save();
    const lifecycleSource=await readFile(join(repository,'scripts','control-backend-lifecycle-checks.mjs'),'utf8');
    state.lifecycleServiceControls=JSON.parse((await runClient(lifecycleSource,{ROOMQC_FIXTURE_LIFECYCLE_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},240000)).stdout);
    assert.equal(state.lifecycleServiceControls.verified,true);
    emit('backend_lifecycle_service_verified',state.lifecycleServiceControls);await save();
    state.phase='email_admin_action_checks';await save();
    const emailActionSource=await readFile(join(repository,'scripts','control-backend-email-admin-checks.mjs'),'utf8');
    state.emailAdminActionControls=JSON.parse((await runClient(emailActionSource,{ROOMQC_FIXTURE_EMAIL_ADMIN_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},90000)).stdout);
    assert.equal(state.emailAdminActionControls.verified,true);
    emit('backend_email_admin_actions_verified',state.emailAdminActionControls);await save();
    state.phase='application_access_checks';await save();
    const accessSource=await readFile(join(repository,'scripts','control-backend-access-checks.mjs'),'utf8');
    const access=JSON.parse((await runClient(accessSource,{ROOMQC_FIXTURE_ACCESS_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})})).stdout);
    assert.equal(access.verified,true);
    state.actorSessionControls=JSON.parse(await sql(state,buildActorSessionChecks(access.sessionFixtures)));
    state.applicationAccess={verified:access.verified,checks:access.checks,fixtures:access.fixtures,distributionOrders:access.distributionOrders};
    emit('backend_application_access_verified',state.applicationAccess);emit('backend_actor_sessions_verified',state.actorSessionControls);await save();
    const runAccessBoundaryStage=async()=>{
    state.phase='access_catalog';await save();
    state.accessCatalog=await captureAccessCatalog({state,sql});
    assert.equal(state.accessCatalog.browserDirectGrantViolations,0,'No-policy tables must have no browser table/column grants');
    emit('backend_access_catalog',state.accessCatalog);await save();
    state.phase='no_policy_controls';await save();
    assert.equal(createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-no-policy-checks.mjs'))).digest('hex'),
      state.noPolicySourceHash,'No-policy source changed during run');
    state.noPolicyControls=JSON.parse(await sql(state,buildNoPolicyChecks(access.sessionFixtures),{privateDiagnostics:true}));
    assert.equal(state.noPolicyControls.verified,true);
    emit('backend_no_policy_controls_verified',state.noPolicyControls);await save();
    state.phase='parent_boundary_controls';await save();
    assert.equal(createHash('sha256').update(await readFile(join(repository,'scripts','control-backend-parent-boundary-checks.mjs'))).digest('hex'),
      state.parentBoundarySourceHash,'Parent boundary source changed during run');
    // Verify the outer rollback also removes the positive setup fixtures, not
    // only the per-attempt mutations compared by the SQL snapshot observer.
    const parentFixtureTables=['private.hotel_room_setup','private.subscription_reconciliation_cases',
      'private.subscription_reconciliation_case_events','private.subscription_reconciliation_case_receipts',
      'public.rooms','public.room_types','public.room_type_rates','public.tenant_usage',
      'public.tenants','public.payment_transactions','public.invoices'];
    const parentFixtureSnapshotSql='SELECT jsonb_build_object('+parentFixtureTables.map(table=>
      "'"+table+"',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM "+table+' r)').join(',')+');';
    state.parentFixtureSnapshotBefore=JSON.parse(await sql(state,parentFixtureSnapshotSql));
    state.parentBoundaryControls=JSON.parse(await sql(state,buildParentBoundaryChecks(access.sessionFixtures),{privateDiagnostics:true,timeout:150000}));
    state.parentFixtureSnapshotAfter=JSON.parse(await sql(state,parentFixtureSnapshotSql));
    assert.deepEqual(state.parentFixtureSnapshotAfter,state.parentFixtureSnapshotBefore,'Parent fixture setup must roll back with the drill');
    state.parentFixtureRollbackVerified=true;
    emit('backend_parent_boundary_controls',state.parentBoundaryControls);await save();
    assert.equal(state.parentBoundaryControls.verified,true,'Populated FK parent-delete boundaries must match contract');
    };
    if(diagnostic==='parent-boundary'){
      state.schemaManifestHash=state.preInitializationSchemaHash;
      await runAccessBoundaryStage();
      state.diagnosticSchemaAfter=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      assert.equal(state.diagnosticSchemaAfter,state.schemaManifestHash);
      await verifySource();state.phase='parent_boundary_diagnostic_verified';await save();return;
    }
    state.phase='registration_access_checks';await save();
    const registrationSource=await readFile(join(repository,'scripts','control-backend-registration-checks.mjs'),'utf8');
    const registration=JSON.parse((await runClient(registrationSource,{ROOMQC_FIXTURE_ACCESS_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})})).stdout);
    assert.equal(registration.verified,true);
    state.registrationSessions=JSON.parse(await sql(state,buildRegistrationSessionChecks(registration.sessionFixture)));
    state.registrationAccess={verified:true,checks:registration.checks,fixtures:registration.fixtures};
    emit('backend_registration_access_verified',state.registrationAccess);
    emit('backend_registration_sessions_verified',state.registrationSessions);await save();
    state.phase='email_ready_trigger_checks';await save();
    state.emailReadyControls=JSON.parse(await sql(state,buildEmailReadyChecks(registration.emailReadyFixtures)));
    emit('backend_email_ready_verified',state.emailReadyControls);await save();
    state.phase='mutation_caller_checks';await save();
    const mutationSource=await readFile(join(repository,'scripts','control-backend-mutation-checks.mjs'),'utf8');
    state.mutationCallerControls=JSON.parse((await runClient(mutationSource,{ROOMQC_FIXTURE_MUTATION_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD})},90000)).stdout);
    assert.equal(state.mutationCallerControls.verified,true);
    emit('backend_mutation_callers_verified',state.mutationCallerControls);await save();
    const initializationSource=await readFile(join(repository,'scripts','control-backend-realtime-init.mjs'),'utf8');
    const initializationSpec={version:1,roundTrips:2,topic:'roomqc-control-probe',publication:'supabase_realtime_messages_publication',
      initializerHash:createHash('sha256').update(initializationSource).digest('hex'),
      protocolHash:createHash('sha256').update(await readFile(join(repository,'server','control','service-probes.mjs'))).digest('hex')};
    const specificationHash=createHash('sha256').update(JSON.stringify(initializationSpec)).digest('hex');
    const publication=async()=>JSON.parse(await sql(state,`SELECT coalesce((SELECT json_build_object('name',p.pubname,
      'allTables',p.puballtables,'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate,
      'viaRoot',p.pubviaroot,'messagesMember',EXISTS(SELECT 1 FROM pg_publication_rel pr
        WHERE pr.prpubid=p.oid AND pr.prrelid='realtime.messages'::regclass))
      FROM pg_publication p WHERE p.pubname='supabase_realtime_messages_publication'),'null'::json);`));
    state.phase='service_initialization';await save();const publicationBefore=await publication();
    let initializedParts,initializedHash;const initializationChecks=[];
    for(let round=0;round<initializationSpec.roundTrips;round++){
      const result=JSON.parse((await runClient(initializationSource,{ROOMQC_FIXTURE_INIT_INPUT:JSON.stringify({
        publishableKey:secrets.ANON_KEY,token:secrets.ROOMQC_FIXTURE_PROBE_TOKEN})})).stdout);
      assert.deepEqual(result,{realtimeInitialized:true,roundTrips:1});initializationChecks.push(result);
      const deadline=Date.now()+15000;let currentPublication;
      do{currentPublication=await publication();if(currentPublication?.messagesMember)break;
        await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
      assert.equal(currentPublication?.messagesMember,true,'Realtime must finish initializing its publication before freeze');
      const hash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      if(round===0){initializedHash=hash;initializedParts=await schemaParts()}
      else assert.equal(hash,initializedHash,'Repeated canary initialization must not keep mutating schema');
    }
    state.schemaManifestHash=initializedHash;
    state.schemaInitialization={...initializationSpec,specificationHash,verified:true,checks:initializationChecks,
      publicationBefore,publicationAfter:await publication(),preInitializationSchemaHash:state.preInitializationSchemaHash,
      schemaManifestHash:initializedHash};
    await writeFile(join(root,'schema-parts.json'),JSON.stringify(initializedParts,null,2),{mode:0o600});
    const initializationChanges=changes(beforeInitialization,initializedParts);
    emit('backend_schema_initialization_verified',{...state.schemaInitialization,changed:initializationChanges});
    if(expectedBuildState){
      const previous=referenceBuild;
      assertBackendSourceBinding(state.sourceBinding,await captureBackendSourceBinding(repository));
      assert.equal(previous.diagnosticOnly??false,false,'A diagnostic is not a full integration reference');
      assert.match(previous.run,/^[a-f0-9]{12}$/);assert.equal(previous.projectId,'roomqc-probe-'+previous.run);
      assert.equal(dirname(previous.root),resolve(repository,'.local'));assert.equal(join(previous.root,'ownership.json'),resolve(expectedBuildState));
      assert.equal(previous.cleaned,true);assert.equal(previous.releaseCommit,state.releaseCommit);
      assert.notEqual(previous.failed,true,'A failed run is not an approved independent build reference');
      assert.equal(previous.phase,'permission_controls_verified','Reference must have completed the entire backend drill');
      assert.equal(previous.managedHealth?.verified,true,'Reference must include the actual timed managed health pipeline');
      assert.equal(previous.sourceBindingVerifiedAtEnd,true,'Reference must bind the complete unchanged runtime/orchestrator source set');
      assertBackendSourceBinding(previous.sourceBinding,state.sourceBinding);
      assertManagedMonitoringBinding(previous.managedMonitoringBinding,previous.managedMonitoringBinding);
      assert.deepEqual(previous.managedClientLink,state.managedClientLink,'Same linked managed client source required');
      assert.deepEqual(previous.managedExporterRole,state.managedExporterRole,'Same pre-attestation exporter setup required');
      assert.equal(previous.schemaInitialization?.version,1,'Pre-initialization state is not a trusted build reference');
      assert.equal(previous.schemaInitialization?.verified,true);assert.equal(previous.schemaInitialization?.specificationHash,specificationHash);
      assert.equal(previous.schemaInitialization?.schemaManifestHash,previous.schemaManifestHash);
      assert.equal(previous.migrationSetHash,state.migrationSetHash,'Same source migration set required for repeatability');
      assert.equal(previous.lifecycleServiceControls?.verified,true,'Reference must include real lifecycle service controls');
      assert.deepEqual(previous.lifecycleBuild,state.lifecycleBuild,'Same lifecycle sources and compiled Edge bundle required');
      assert.equal(previous.emailProviderControls?.verified,true,'Reference must include actual provider/queue controls');
      assert.equal(previous.noPolicyControls?.verified,true,'Reference must include current no-policy authority controls');
      assert.equal(previous.noPolicyControls?.tables,44,'Reference must cover all current authority, workflow, notification, dispatch, target and receipt tables');
      assert.equal(previous.noPolicyControls?.supportAcceptanceDirectDenials,12);
      assert.equal(previous.noPolicyControls?.supportAcceptanceServiceDenials,4);
      assert.equal(previous.workflowDeliveryControls?.verified,true,'Reference must include actual guarded delivery source and Edge controls');
      assert.equal(previous.workflowDeliverySourceHash,state.workflowDeliverySourceHash,'Same workflow contract checks required');
      assert.deepEqual(previous.workflowDeliveryBuild,state.workflowDeliveryBuild,'Same workflow Edge build required');
      assert.equal(previous.roomSourceControls?.verified,true,'Reference must include actual room source command controls');
      assert.equal(previous.roomSourceHash,state.roomSourceHash,'Same room source command controls required');
      assert.deepEqual(previous.roomCallerBuild,state.roomCallerBuild,'Same production room caller build required');
      assert.equal(previous.roomWriterControls?.verified,true,'Reference must include actual compound room writer controls');
      assert.equal(previous.roomWriterSourceHash,state.roomWriterSourceHash,'Same compound room writer checks required');
      assert.equal(previous.reportTargetTransportControls?.verified,true,'Reference must include real target TCP loss and caller process restart controls');
      assert.equal(previous.reportTargetTransportSourceHash,state.reportTargetTransportSourceHash,'Same report target transport checks required');
      assert.deepEqual(previous.reportTargetCallerBuild,state.reportTargetCallerBuild,'Same report target client sources and compiled bundle required');
      assert.equal(previous.noPolicyControls?.roomTransitionDirectDenials,12);
      assert.equal(previous.noPolicyControls?.roomTransitionServiceDenials,4);
      assert.equal(previous.noPolicyControls?.employeeAuthorityDirectDenials,36);
      assert.equal(previous.noPolicyControls?.employeeAuthorityServiceDenials,12);
      assert.equal(previous.noPolicySourceHash,state.noPolicySourceHash,'Same reviewed direct-grant inventory required');
      assert.equal(previous.hotelDeleteControls?.verified,true,'Reference must include receipt-preserving hotel-delete controls');
      assert.equal(previous.parentBoundaryControls?.verified,true,'Reference must include populated FK parent-delete boundaries');
      assert.equal(previous.parentBoundarySourceHash,state.parentBoundarySourceHash,'Same parent boundary harness source required');
      assert.equal(previous.hotelScopeControls?.verified,true,'Reference must include actual five-table hotel-scope controls');
      assert.equal(previous.hotelScopeSourceHash,state.hotelScopeSourceHash,'Same hotel scope harness source required');
      assert.equal(previous.businessActorControls?.verified,true,'Reference must include actual business account/session controls');
      assert.equal(previous.employeeProfileControls?.verified,true,'Reference must include actual atomic employee edit controls');
      assert.equal(previous.employeeProfileSourceHash,state.employeeProfileSourceHash,'Same employee edit harness source required');
      assert.equal(previous.selfProfileControls?.verified,true,'Reference must include actual self-profile controls');
      assert.equal(previous.selfProfileSourceHash,state.selfProfileSourceHash,'Same self-profile harness source required');
      assert.equal(previous.passwordControls?.verified,true,'Reference must include actual password-change controls');
      assert.equal(previous.passwordSourceHash,state.passwordSourceHash,'Same password-change harness source required');
      assert.equal(previous.passwordAdversarialSourceHash,state.passwordAdversarialSourceHash,'Same password fault/race harness required');
      assert.equal(previous.passwordConfigSourceHash,state.passwordConfigSourceHash,'Same password config fault harness required');
      assert.equal(previous.passwordControls?.configuration?.verified,true,'Reference must include actual config faults');
      assert.deepEqual(previous.passwordCallerBuild,state.passwordCallerBuild,'Same application password caller build required');
      assert.deepEqual(previous.staffInvitationBuild,state.staffInvitationBuild,'Same actual staff invitation Edge build required');
      assert.deepEqual(previous.staffInvitationCallerBuild,state.staffInvitationCallerBuild,'Same production invitation/email caller build required');
      assert.deepEqual(previous.staffInvitationDeliveryBuild,state.staffInvitationDeliveryBuild,'Same actual create-user entry and internal SMTP target required');
      assert.equal(previous.staffInvitationDeliverySourceHash,state.staffInvitationDeliverySourceHash,'Same SMTP/delivery checks required');
      assert.equal(previous.staffInvitationAuthoritySourceHash,state.staffInvitationAuthoritySourceHash,'Same bounded authority/race inventory required');
      assert.equal(previous.staffInvitationSourceHash,state.staffInvitationSourceHash,'Same staff invitation contract checks required');
      assert.equal(previous.staffInvitationControls?.verified,true,'Staff invitation checks required in full reference');
      assert.deepEqual(previous.authPasswordPolicy,state.authPasswordPolicy,'Same server password/audit policy required');
      assert.equal(previous.passwordAuthBuild?.sourceHash,state.passwordAuthBuild?.sourceHash,'Same reviewed Auth transaction extension required');
      assert.equal(previous.passwordAuthBuild?.imageId,state.passwordAuthBuild?.imageId,'Same immutable extended Auth image required');
      assert.equal(previous.accessCatalog?.contractVersion,3,'Reference must include expanded FK/trigger authority catalog');
      assert.deepEqual(previous.providerBuild,state.providerBuild,'Same provider/queue sources and compiled Edge bundles required');
      assert.deepEqual(previous.imageLock.map(v=>[v.service,v.digest]).sort(),state.imageLock.map(v=>[v.service,v.digest]).sort());
      if(previous.schemaManifestHash!==state.schemaManifestHash){
        const changed=changes(JSON.parse(await readFile(join(previous.root,'schema-parts.json'),'utf8')),initializedParts);
        emit('backend_schema_repeatability_failed',{changed:changed.slice(0,20),changedCount:changed.length});
      }
      assert.equal(state.schemaManifestHash,previous.schemaManifestHash,'Independent initialized rebuild must match trusted candidate');
      state.buildRepeatability={referenceProject:previous.projectId,matched:true,specificationHash,schemaManifestHash:state.schemaManifestHash};
      emit('backend_schema_repeatability_verified',state.buildRepeatability);
    }
    state.probePrivilegeAudit=await auditProbePrivileges();emit('backend_probe_privilege_audit',state.probePrivilegeAudit);
    assert.deepEqual(state.probePrivilegeAudit,{businessTables:0,businessDefiners:0},'Probe must not have direct or indirect application access');
    state.phase='schema_frozen';await save();
    const assertSchemaFrozen=async phase=>{
      const hash=await sql(state,'SELECT private.roomqc_schema_fingerprint();');
      if(hash!==state.schemaManifestHash){const changed=changes(initializedParts,await schemaParts());
        emit('backend_schema_drift_during_probe',{phase,changedCount:changed.length,changed:changed.slice(0,20)})}
      assert.equal(hash,state.schemaManifestHash,'Frozen schema must not be changed or re-blessed by ordinary probes');
    };
    // Controlled maintenance drill on this exact-owned fresh backend. Recreate
    // the vendor's normal old-partition deletion / future-partition creation
    // using its real running Janitor, not a replacement cleanup implementation.
    state.phase='partition_maintenance';await save();
    const partitionDates=JSON.parse(await sql(state,`SELECT json_build_object(
      'old',to_char((statement_timestamp() AT TIME ZONE 'UTC')::date-4,'YYYY_MM_DD'),
      'oldStart',to_char((statement_timestamp() AT TIME ZONE 'UTC')::date-4,'YYYY-MM-DD'),
      'oldEnd',to_char((statement_timestamp() AT TIME ZONE 'UTC')::date-3,'YYYY-MM-DD'),
      'future',to_char((statement_timestamp() AT TIME ZONE 'UTC')::date+3,'YYYY_MM_DD'));`));
    assert.match(partitionDates.old,/^\d{4}_\d{2}_\d{2}$/);assert.match(partitionDates.future,/^\d{4}_\d{2}_\d{2}$/);
    assert.match(partitionDates.oldStart,/^\d{4}-\d{2}-\d{2}$/);assert.match(partitionDates.oldEnd,/^\d{4}-\d{2}-\d{2}$/);
    const oldPartition='realtime.messages_'+partitionDates.old,futurePartition='realtime.messages_'+partitionDates.future;
    assert.equal(await sql(state,`SELECT to_regclass('${oldPartition}')::text;`),'','The seeded old partition must be new and owned by this drill');
    // postgres is deliberately not allowed to SET ROLE supabase_admin or DROP
    // vendor-owned tables. Use the fixture installer's existing credential for
    // this controlled empty-partition drill, never grant it to postgres/probes.
    const maintenanceSql=async source=>(await privateRun('docker',['exec','-i','--env','PGPASSWORD',state.projectId+'-db',
      'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate',
      '-h','127.0.0.1','-U','supabase_admin','-d','postgres'],{
      input:source,env:{...env,PGPASSWORD:secrets.POSTGRES_PASSWORD},timeout:30000})).stdout.trim();
    await maintenanceSql(`BEGIN;
      CREATE TABLE ${oldPartition} PARTITION OF realtime.messages
        FOR VALUES FROM ('${partitionDates.oldStart}') TO ('${partitionDates.oldEnd}');
      ALTER TABLE ${oldPartition} OWNER TO supabase_realtime_admin;COMMIT;`);
    await assertSchemaFrozen('maintenance-old-partition-created');
    assert.equal(await sql(state,`SELECT count(*) FROM ${futurePartition};`),'0','Never drop a partition containing fixture data');
    await maintenanceSql(`DROP TABLE ${futurePartition};`);await assertSchemaFrozen('maintenance-future-partition-missing');
    const maintenance=await privateRun('docker',['exec','--env','ERL_FLAGS=+S 1:1',state.projectId+'-realtime','/app/bin/realtime','rpc',
      'IO.puts("ROOMQC_MAINTENANCE_" <> inspect(Realtime.Tenants.Janitor.MaintenanceTask.run("realtime-dev")))'],{timeout:30000});
    assert.ok(maintenance.stdout.split(/\r?\n/).includes('ROOMQC_MAINTENANCE_:ok'),'The pinned vendor maintenance RPC must finish explicitly');
    assert.equal(await sql(state,`SELECT to_regclass('${oldPartition}')::text;`),'');
    assert.equal(await sql(state,`SELECT to_regclass('${futurePartition}')::text;`),futurePartition);
    await assertSchemaFrozen('vendor-partition-maintenance');
    const maintenanceRoundTrip=JSON.parse((await runClient(initializationSource,{ROOMQC_FIXTURE_INIT_INPUT:JSON.stringify({
      publishableKey:secrets.ANON_KEY,token:secrets.ROOMQC_FIXTURE_PROBE_TOKEN})})).stdout);
    assert.equal(maintenanceRoundTrip.realtimeInitialized,true);await assertSchemaFrozen('maintenance-private-roundtrip');
    state.partitionMaintenance={verified:true,vendorCommit:'d46540b3a4a79113f40301d5e5cb690f41150b9b',
      oldDropped:true,futureRecreated:true,staticHashUnchanged:true,roundTripVerified:true,scheduledSoakVerified:false};
    emit('backend_partition_maintenance_verified',state.partitionMaintenance);state.phase='partition_maintenance_verified';await save();
    // Synthetic installer proof only. This hash is NOT exported as an approved
    // production expectation; a second independent build must match first.
    const expectation={clusterId:'fixture-a',releaseId:'sandbox-v1',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
      migrationSetHash:state.migrationSetHash,schemaManifestHash:state.schemaManifestHash};
    await sql(state,`INSERT INTO private.roomqc_release_manifest(cluster_id,release_id,contract_version,schema_fingerprint_version,
      artifact_digest,frontend_artifact_digest,migration_set_hash,expected_schema_hash)
      VALUES('fixture-a','sandbox-v1',3,3,'${expectation.artifactDigest}','${expectation.frontendArtifactDigest}',
      '${expectation.migrationSetHash}','${expectation.schemaManifestHash}');`);
    const probeInput={expected:expectation,credential:{publishableKey:secrets.ANON_KEY,token:secrets.ROOMQC_FIXTURE_PROBE_TOKEN},
      auth:canaries.auth,storage:canaries.storage};
    const checksSource=await readFile(join(repository,'scripts','control-backend-service-checks.mjs'),'utf8');
    const checkServices=async(failed='')=>{try{
      const result=JSON.parse((await runClient(checksSource,{ROOMQC_FIXTURE_SERVICE_INPUT:JSON.stringify(probeInput),ROOMQC_FIXTURE_FAILED_SERVICE:failed})).stdout);
      await assertSchemaFrozen(failed?'fault:'+failed:'healthy');return result;
    }catch(error){await assertSchemaFrozen(failed?'failed:'+failed:'failed:healthy');throw error}};
    state.phase='five_service_probes';await save();state.serviceProbeChecks=[await checkServices()];
    emit('backend_five_service_probes',state.serviceProbeChecks[0]);
    for(const service of ['auth','rest','storage','realtime','functions']){
      await privateRun('docker',['stop','--time','5',state.projectId+'-'+service]);
      const result=await checkServices(service);state.serviceProbeChecks.push(result);emit('backend_service_fault',result);
      await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',service],{timeout:90000});
      state.serviceProbeChecks.push(await checkServices());
    }
    state.phase='five_service_faults_verified';await save();
    emit('backend_five_service_faults_verified',{fullFiveProbesVerified:true,signupOpened:false});
    await runManagedHealthDrill({state,repository,privateRun,runClient,sql,compose,canaries,expectation,
      credential:probeInput.credential,serviceKey:secrets.SERVICE_ROLE_KEY,exporterPassword:managedExporter.password,
      businessInstallerDatabaseUrl:`postgresql://postgres:${encodeURIComponent(secrets.POSTGRES_PASSWORD)}@db:5432/postgres`,
      save,emit,signal:cancel.signal,credentialOnly:diagnostic==='managed-credential',
      configurationOnly:diagnostic==='managed-configuration',releaseOnly:diagnostic==='managed-release'});
    // The installer changed manifest DATA and Functions release environment,
    // not schema. The shared Compose arguments retain that explicit override;
    // subsequent mandatory checks must query the effective approved release.
    if(state.managedHealth.effectiveExpectation)probeInput.expected=state.managedHealth.effectiveExpectation;
    if(referenceBuild){
      assertManagedMonitoringBinding(referenceBuild.managedMonitoringBinding,state.managedMonitoringBinding);
      state.buildRepeatability.managedRuntimeMatched=true;
    }
    await checkServices();await assertSchemaFrozen('managed-health-recovery');
    if(managedDiagnostic){await verifySource();state.phase=diagnostic.replace('-','_')+'_diagnostic_verified';await save();return;}
    if(advisorsCli){state.phase='advisors';await save();
      state.advisors=await runBackendAdvisors({state,password:secrets.POSTGRES_PASSWORD,cli:advisorsCli,run:privateRun});
      emit('backend_advisors',state.advisors);state.phase='advisors_verified';await save();
    }
    await runAccessBoundaryStage();
    state.phase='hotel_scope_checks';await save();
    const hotelScopeSource=await readFile(join(repository,'scripts','control-backend-hotel-scope-checks.mjs'),'utf8');
    await runEmployeeUpdateStage();
    const employeeProfileSource=await readFile(join(repository,'scripts','control-backend-employee-profile-checks.mjs'),'utf8');
    const selfProfileSource=await readFile(join(repository,'scripts','control-backend-self-profile-checks.mjs'),'utf8');
    const passwordSource=await readFile(join(repository,'scripts','control-backend-password-checks.mjs'),'utf8');
    const passwordAdversarialSource=await readFile(join(repository,'scripts','control-backend-password-adversarial-checks.mjs'),'utf8');
    const passwordConfigSource=await readFile(join(repository,'scripts','control-backend-password-config-checks.mjs'),'utf8');
    assert.equal(createHash('sha256').update(employeeProfileSource).digest('hex'),state.employeeProfileSourceHash,'Employee edit source changed during run');
    assert.equal(createHash('sha256').update(selfProfileSource).digest('hex'),state.selfProfileSourceHash,'Self-profile source changed during run');
    assert.equal(createHash('sha256').update(passwordSource).digest('hex'),state.passwordSourceHash,'Password source changed during run');
    assert.equal(createHash('sha256').update(passwordAdversarialSource).digest('hex'),state.passwordAdversarialSourceHash,'Password fault/race source changed during run');
    assert.equal(createHash('sha256').update(passwordConfigSource).digest('hex'),state.passwordConfigSourceHash,'Password config fault source changed during run');
    assert.equal(createHash('sha256').update(hotelScopeSource).digest('hex'),state.hotelScopeSourceHash,'Hotel scope source changed during run');
    const caller=await passwordCallerSource();
    assert.deepEqual(caller.build,state.passwordCallerBuild,'Application password caller source changed during run');
    try{state.hotelScopeControls=JSON.parse((await runClient(caller.source+'\n'+employeeProfileSource+'\n'+selfProfileSource+'\n'+passwordAdversarialSource+'\n'+passwordConfigSource+'\n'+passwordSource+'\n'+hotelScopeSource,{ROOMQC_FIXTURE_HOTEL_SCOPE_INPUT:JSON.stringify({
      run:state.run,publishableKey:secrets.ANON_KEY,serviceKey:secrets.SERVICE_ROLE_KEY,databasePassword:secrets.POSTGRES_PASSWORD,
      fixtureJwtSecret:secrets.JWT_SECRET,passwordSdk:true,passwordGuard:true,passwordCaller:true,passwordConfig:true})},420000)).stdout);
    }catch(error){
      const partial=error.result?.stdout?.trim().split(/\r?\n/).map(line=>{try{return JSON.parse(line)}catch{return null}})
        .find(value=>value?.incomplete===true&&value?.verified===false&&value?.contractVersion===2);
      if(partial){state.hotelScopeControls=partial;await save();emit('backend_hotel_scope_incomplete',partial)}
      throw error;
    }
    emit('backend_hotel_scope_controls',state.hotelScopeControls);await save();
    assert.equal(state.hotelScopeControls.verified,true,'Actual hotel-scope reads and writes must match assigned-hotel contract');
    state.businessActorControls=state.hotelScopeControls.accountSessionControls;
    emit('backend_business_actor_controls',state.businessActorControls);await save();
    assert.equal(state.businessActorControls.verified,true,'Actual business account/session states must deny without effects and recover');
    state.employeeProfileControls=state.hotelScopeControls.employeeProfileControls;
    emit('backend_employee_profile_controls',state.employeeProfileControls);await save();
    assert.equal(state.employeeProfileControls?.verified,true,'A legitimate manager profile edit must succeed without a partial commit or role change');
    state.selfProfileControls=state.hotelScopeControls.selfProfileControls;
    emit('backend_self_profile_controls',state.selfProfileControls);await save();
    assert.equal(state.selfProfileControls?.verified,true,'Self metadata/Storage/fencing must pass without widening management authority');
    state.passwordControls=state.hotelScopeControls.passwordControls;
    emit('backend_password_controls',state.passwordControls);await save();
    assert.equal(state.passwordControls?.verified,true,'Password changes and forced-change completion must satisfy the server contract');
    const expiredBody=[{alg:'HS256',typ:'JWT'},{role:'roomqc_control_probe',exp:1}]
      .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const expiredProbeToken=expiredBody+'.'+createHmac('sha256',secrets.JWT_SECRET).update(expiredBody).digest('base64url');
    state.phase='permission_controls';await save();
    const permissionSource=await readFile(join(repository,'scripts','control-backend-permission-checks.mjs'),'utf8');
    const permission=JSON.parse((await runClient(permissionSource,{ROOMQC_FIXTURE_PERMISSION_INPUT:JSON.stringify({
      publishableKey:secrets.ANON_KEY,probeToken:secrets.ROOMQC_FIXTURE_PROBE_TOKEN,serviceKey:secrets.SERVICE_ROLE_KEY,
      expiredProbeToken,auth:canaries.auth,installer:canaries.installer})})).stdout);
    assert.equal(permission.verified,true);assert.equal(permission.auth.userId,canaries.auth.userId);probeInput.auth=permission.auth;
    state.permissionControls={verified:true,checks:permission.checks,realtime:permission.realtime,
      channelErrorBackoffMs:state.realtimeChannelErrorBackoffMs};emit('backend_permission_controls_verified',state.permissionControls);
    await checkServices();await assertSchemaFrozen('permission-recovery');
    await verifySource();state.phase='permission_controls_verified';await save();
  }catch(error){state.failed=true;state.failureReason=error.message;state.errorCode=error.result?.stderr?.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/)?.[1]??'SANDBOX_PHASE_FAILED';
    if(error.result)state.failedCommand={exitCode:error.result.code,signal:error.result.signal??null,
      timedOut:error.result.timedOut===true,elapsedMs:error.result.elapsedMs??null};
    if(state.phase==='parent_boundary_controls'){
      const code=error.result?.stderr?.match(/ERROR:\s+(?:[A-Z0-9]{5}:\s+)?(PARENT_[A-Z_]+)/)?.[1];
      if(parentBoundaryFailureCodes.includes(code)){state.parentBoundaryFailureReason=code;emit('backend_parent_boundary_failed',{reason:code});}
    }
    if(state.phase==='no_policy_controls'){
      const code=error.result?.stderr?.match(/\b(NO_POLICY_[A-Z_]+)\b/)?.[1];
      if(noPolicyFailureCodes.includes(code)){state.noPolicyFailureReason=code;emit('backend_no_policy_failed',{reason:code});}
    }
    if(error.result)await writeFile(join(root,'failure-private.log'),error.result.stdout+'\n'+error.result.stderr,{mode:0o600});
    // The normal SQL channel intentionally emits SQLSTATE only. For this fixed,
    // catalog-only validator retain the detailed reason privately and expose
    // only its allowlisted code, never generic raw SQL/provider diagnostics.
    try{
      await docker(['exec','-i',state.projectId+'-db','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=default',
        '-U','postgres','-d','postgres'],{input:'SELECT private.roomqc_managed_realtime_partition_ids();'});
    }catch(diagnostic){
      const reason=diagnostic.result?.stderr?.match(/ERROR:\s+(REALTIME_PARTITION_[A-Z_]+)/)?.[1];
      if(reason){state.partitionFailureReason=reason;emit('backend_partition_validation_diagnostic',{reason});
        await writeFile(join(root,'partition-failure-private.log'),diagnostic.result.stderr,{mode:0o600})}
    }
    // Retain diagnostics before cleanup; raw logs stay in the ACL-protected root.
    // Only owned service names and process states are printed publicly.
    try{
      state.serviceStates=[];
      for(const value of (await objects(state)).filter(o=>o.kind==='container')){
        state.serviceStates.push({name:value.name,status:value.info.State.Status,exitCode:value.info.State.ExitCode,
          health:value.info.State.Health?.Status??null});
        try{const logs=await docker(['logs','--tail','150',value.name]);
          await writeFile(join(root,value.name+'-private.log'),logs.stdout+'\n'+logs.stderr,{mode:0o600});
        }catch{}
      }
      emit('backend_sandbox_service_states',{services:state.serviceStates});
    }catch{state.diagnosticsFailed=true}
    emit('backend_sandbox_failed',{phase:state.phase,migration:state.migration??null,applied:state.applied,code:state.errorCode});process.exitCode=1;
  }finally{
    if(sshDeployment)try{await sshDeployment.stop()}catch{state.sshTransportCleanupFailed=true;process.exitCode=1}
    try{if(!(persistentLocalDemo&&state.phase==='persistent_local_demo_ready'))await cleanup(state)}catch{state.cleanupFailed=true;process.exitCode=1;emit('backend_cleanup_requires_review',{projectId:state.projectId})}
    if(sshDeployment)try{await sshDeployment.cleanup()}catch{state.sshAssetCleanupFailed=true;process.exitCode=1}
    await save();process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);
    emit('backend_sandbox_state',{path:join(root,'ownership.json'),cleaned:state.cleaned});
  }
}
await main(process.argv.slice(2));
