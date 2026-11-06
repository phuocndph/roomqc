// Acceptance wiring only. The unchanged product CLI owns initialization,
// credentials, TLS, bootstrap, networks, volumes and verification over SSH.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
import {managementDirectoryImage} from '../server/control/management-bundle.mjs';
import {managementInstallPlan} from '../server/control/management-install-plan.mjs';
import {fixtureConfig} from '../server/control/test-fixtures.mjs';
import {fixtureReleaseApproval,fixtureReleaseContext,fixtureReleaseTrustRaw,fixtureReleaseMaximumValidityMs} from '../server/control/release-test-fixtures.mjs';
import {syntheticBundle,syntheticRelease} from '../server/control/probe-test-fixtures.mjs';

export function managementJourneyApprovalContext(envelope){
 return Object.fromEntries(['inventoryRef','clusterId','hostId','environment','endpointFingerprint','expected'].map(k=>[k,envelope.payload[k]]));
}

export async function managementJourneyInstallInput({repository,backend,control,frontend,binding}){
 assert.equal(backend.diagnosticOnly,true);assert.match(backend.run,/^[a-f0-9]{12}$/);
 const id='mi-'+backend.run,root='/opt/RoomQC/management/'+id,p=root+'/private',meta=root+'/metadata';
 const budget=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));
 budget.environment='local';budget.databases[0].maxConnections=32;
 for(const c of budget.databases[0].consumers)c.replicas=['control-api','alert-worker','migration','backup'].includes(c.id)?1:0;
 const cluster={id:'cluster-a',url:'https://cluster-a.roomqc.invalid',internalUrl:'http://127.0.0.1:8000',
  publishableKey:backend.publishableKey,serviceKey:backend.serviceKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99};
 const cfg=fixtureConfig('',[cluster]),emailKey=randomBytes(32).toString('hex');
 const catalog={version:2,entries:[{inventoryRef:cluster.id,
  approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,{...syntheticRelease,clusterId:cluster.id})),
  credential:{...syntheticBundle().credential,publishableKey:cluster.publishableKey}}]};
 const raw={version:1,deploymentId:id,environment:'local',listenPort:0,images:{directory:managementDirectoryImage,control,frontend},
  resources:{directory:{memoryBytes:512*1024**2,cpus:1,sharedBuffersBytes:64*1024**2,shmBytes:64*1024**2},
   control:{memoryBytes:256*1024**2,cpus:0.5},frontend:{memoryBytes:128*1024**2,cpus:0.5}},
  networks:Object.fromEntries(['directory','egress','web','metrics'].map(k=>[k,'roomqc-management-'+id+'-'+k])),
  volumes:Object.fromEntries(['data','private','ca'].map(k=>[k,'roomqc-management-'+id+'-'+k])),
  files:{budget:p+'/budget.json',apiEnvironment:p+'/api.env',apiDsn:p+'/runtime/rq_'+id.replaceAll('-','_')+'_api_1.dsn',
   postgresConfig:meta+'/postgresql.conf',hbaConfig:meta+'/pg_hba.conf',webConfig:meta+'/nginx.conf'},
  apiRelease:{catalogFile:p+'/release-catalog.json',trustFile:p+'/release-trust.json',maximumValidityMs:fixtureReleaseMaximumValidityMs},
  workers:{alert:{configFile:p+'/alerts.json',dsnFile:p+'/runtime/rq_'+id.replaceAll('-','_')+'_alerts_1.dsn',
   endpointFile:p+'/alert.endpoint',tokenFile:p+'/alert.token',resources:{memoryBytes:256*1024**2,cpus:0.5}}}};
 const env={ROOMQC_PUBLIC_URL:'http://127.0.0.1:8082',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_SUPPORT_CLUSTER_ID:cluster.id,
  ROOMQC_CONTROL_EMAIL_HASH_KEY:emailKey,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([cluster]),ROOMQC_CONTROL_INVENTORY:JSON.stringify([...cfg.inventory.values()])};
 const files=[{path:raw.files.budget,content:JSON.stringify(budget)+'\n'},
  {path:raw.files.apiEnvironment,content:Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n'},
  {path:raw.apiRelease.catalogFile,content:JSON.stringify(catalog)},
  {path:raw.apiRelease.trustFile,content:JSON.stringify(fixtureReleaseTrustRaw)},
  {path:raw.workers.alert.configFile,content:JSON.stringify({schemaVersion:1,instanceId:'alerts-'+backend.run,poolMax:1,concurrency:1,
   intervalMs:1000,requestTimeoutMs:1000,leaseMs:15000,shutdownTimeoutMs:3000,approvedAddresses:[],
   connectionBudget:{maxConnections:32,otherAllocatedConnections:7,instances:1,reservedConnections:5}})},
  {path:raw.workers.alert.endpointFile,content:'https://alerts.roomqc.invalid/events\n'},
  {path:raw.workers.alert.tokenFile,content:randomBytes(32).toString('hex')+'\n'}];
 for(const [path,source]of [[raw.files.postgresConfig,'deploy/control/directory/postgresql.conf'],
  [raw.files.hbaConfig,'deploy/control/directory/pg_hba.conf'],[raw.files.webConfig,'deploy/control/management-nginx.conf']]){
  files.push({path,content:await readFile(join(repository,source),'utf8')});
 }
 const registryText=JSON.stringify([{id:cluster.id,url:cluster.url,publishableKey:cluster.publishableKey,
  vapidPublicKey:cluster.vapidPublicKey,maxWorkspaces:99,credentialRef:cluster.id}]);
 // Pure validation occurs before handing any input to the SSH transport.
 managementInstallPlan({descriptor:raw,budgetText:files[0].content,files,registryText,requiredDiskBytes:1024**3,
  backendSourceSha256:binding.sha256,targetHost:'11.253.1.2'});
 return {descriptor:raw,files,registryText,requiredDiskBytes:1024**3,backendSourceSha256:binding.sha256};
}

export async function runManagementInstallerJourneyLocal({repository,backend,transport,onInstalled,controlImage}){
 assert.equal(backend.diagnosticOnly,true);assert.match(backend.run,/^[a-f0-9]{12}$/);
 assert.equal(typeof transport.managementInstall,'function');assert.equal(typeof transport.docker,'function');assert.equal(typeof onInstalled,'function');
 const run=backend.run,id='mi-'+run,installRoot='/opt/RoomQC/management/'+id,project='roomqc-management-'+id;
 const root=await mkdtemp(join(repository,'.local',project+'-'));
 if(process.platform==='win32'){
  const exec=promisify(execFile),sid=(await exec('whoami',['/user','/fo','csv','/nh'],{windowsHide:true})).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];assert(sid);
  await exec('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true});
 }
 const result={kind:'roomqc-management-installer-journey-local',run,actualSsh:true,installerCliUsed:false,verified:false,cleaned:false,
  contaboChanged:false,productionSignupOpened:false,limitations:['Developer Docker daemon with exact-owned fixtures, not a VPS.',
   'Health, release approval and queue administrator authority are explicitly synthetic.',
   'Business initialization and migration use the packaged CLI on this disposable backend; production rollout is still unproved.',
   'No browser E2E, external email, full health/setup workers, offsite backup, load test or customer pilot.']};
 const stateFile=join(root,'result.json'),save=()=>writeFile(stateFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 let count=0,backendNetwork=false,auditNetwork=false,plan;
 const d=async(args,options={})=>{
  const response=await transport.docker(args,options);
  await writeFile(join(root,'command-'+(++count)+'.private.log'),response.stdout+'\n'+(response.stderr??''),{mode:0o600});
  if(!options.allowFailure)assert.equal(response.code,0,'MANAGEMENT_INSTALLER_JOURNEY_COMMAND_'+count);return response;
 };
 const inspect=async name=>JSON.parse((await d(['inspect',name])).stdout)[0];
 const binding=await captureBackendSourceBinding(repository);assert.match(controlImage??'',/^roomqc\/control@sha256:[a-f0-9]{64}$/);
 assert.equal((await inspect(controlImage)).Config.Labels['roomqc.control.backend'],binding.sha256,'Rebuild control from current sources');
 const web=await inspect('roomqc/web:customer-access-20261031');
 const input=await managementJourneyInstallInput({repository,backend,control:controlImage,frontend:'roomqc/web@'+web.Id,binding});
 const raw=input.descriptor,compose=installRoot+'/output/management.compose.json',overlay=installRoot+'/output/local-journey-only.json';
 const runControl=(args,stdin)=>d(['run','--rm',...(stdin?['-i']:[]),'--label','roomqc.management.journey='+run,'--network',raw.networks.directory,
  '--read-only','--user','0:0','--cap-drop','ALL','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges',
  '--env','NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/ca.crt',
  '--mount','type=bind,source='+installRoot+',target='+installRoot,
  '--mount','type=volume,source='+raw.volumes.ca+',target=/run/roomqc-directory-ca,readonly','--entrypoint','node',controlImage,...args],
 {input:stdin,timeout:120000});
 const op=(args,withOverlay=false)=>d(['compose','--project-name',project,'-f',compose,...(withOverlay?['-f',overlay]:[]),...args],{timeout:180000});
 try{
  const network=await inspect(backend.network),gateway=await inspect(backend.gatewayContainer);
  assert.equal(network.Internal,true);assert.equal(network.Labels['roomqc.control-backend-test'],run);
  assert.equal(gateway.Config.Labels['roomqc.control-backend-test'],run);
  plan=await transport.managementInstall(input,'plan');result.installerCliUsed=true;result.specSha256=plan.specSha256;await save();
  result.prepare=await transport.managementInstall(input,'prepare');
  assert.equal(result.prepare.directoryPrepared,true);assert.equal(result.prepare.runtimeStarted,false);
  const preparedIds=(await op(['ps','-q'])).stdout.trim().split(/\s+/).filter(Boolean);
  assert.equal(preparedIds.length,1);
  assert.equal((await inspect(preparedIds[0])).Config.Labels['com.docker.compose.service'],'roomqc-directory');
  result.preparedServices=['roomqc-directory'];
  result.resume=await transport.managementInstall(input,'resume');
  result.verifyBefore=await transport.managementInstall(input,'verify');
  console.log(JSON.stringify({event:'management_product_installed',run,mode:'prepare/resume/verify',signupOpened:false}));
  const ids=(await op(['ps','-q'])).stdout.trim().split(/\s+/).filter(Boolean);
  assert.equal(ids.length,4);result.services=4;
  for(const containerId of ids){const info=await inspect(containerId);assert.equal(info.State.Health.Status,'healthy');
   assert.equal(info.Config.Labels['roomqc.management.spec'],plan.specSha256);assert(info.HostConfig.ReadonlyRootfs);
   assert(!info.Mounts.some(m=>m.Source==='/var/run/docker.sock'));}
  const seed=String.raw`import pg from 'pg';import fs from 'node:fs/promises';import {seedOperationalCluster} from '/app/test-fixtures.mjs';
import {ReleaseApprovalTrust} from '/app/release-approval.mjs';import {releaseApprovalIdentity} from '/app/release-authority.mjs';
let text='';for await(const c of process.stdin)text+=c;const v=JSON.parse(text);
const pool=new pg.Pool({connectionString:(await fs.readFile(v.root+'/operator/admin.dsn','utf8')).trim(),max:1});
try{
// Use the preplanned, mounted public signing authority. Importing the fixture
// module in a new process creates a new keypair, which cannot authorize this API.
const entry=JSON.parse(await fs.readFile(v.catalog,'utf8')).entries[0];
const context=(${managementJourneyApprovalContext.toString()})(entry.approval);
const trust=new ReleaseApprovalTrust(JSON.parse(await fs.readFile(v.trust,'utf8')),{maximumValidityMs:v.maximumValidityMs});
const a=trust.verify(entry.approval,context);
await seedOperationalCluster(pool,'cluster-a',{cluster:v.cluster,approvalSeed:false});
await pool.query('BEGIN');
await pool.query("INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)",
[a.approvalId,a.clusterId,a.epoch,a.envelopeDigest,a.issuerId,a.keyId,a.keyFingerprint,a.inventoryRef,a.hostId,a.environment,a.endpointFingerprint,a.expectationFingerprint,JSON.stringify(a.expected),a.notBefore,a.expiresAt]);
await pool.query("INSERT INTO roomqc_control.release_authority(cluster_id,approval_id,epoch,row_version,state) VALUES($1,$2,$3,1,'active')",[a.clusterId,a.approvalId,a.epoch]);
await pool.query("UPDATE roomqc_control.cluster_health_current SET evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,releaseApproval}',$2::jsonb) WHERE cluster_id=$1",[a.clusterId,JSON.stringify(releaseApprovalIdentity(a))]);
await pool.query('COMMIT');
await fs.writeFile(v.path,JSON.stringify(v.overlay),{flag:'wx',mode:0o600});console.log(JSON.stringify({seeded:true,authority:'synthetic-local-fixture'}));}finally{await pool.end()}`;
  const cluster=JSON.parse(input.files.find(f=>f.path===raw.files.apiEnvironment).content.split('\n').find(l=>l.startsWith('ROOMQC_CONTROL_CLUSTERS=')).slice('ROOMQC_CONTROL_CLUSTERS='.length))[0];
  const testOverlay={services:{'roomqc-control':{environment:{ROOMQC_CONTROL_SIGNUP_ENABLED:'true',ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED:'true'}},
   'roomqc-web':{networks:['web','egress']},'journey-backend-relay':{
    image:controlImage,user:'1000:1000',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],
    labels:{'roomqc.management.install':id,'roomqc.management.spec':plan.specSha256},network_mode:'service:roomqc-control',mem_limit:64*1024**2,cpus:0.5,pids_limit:32,
    depends_on:{'roomqc-control':{condition:'service_healthy'}},command:['node','--input-type=module','-e',
     "import http from 'node:http';http.createServer((req,res)=>{const up=http.request({hostname:'api-gw',port:8000,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});up.on('error',()=>{res.writeHead(502);res.end()});req.pipe(up)}).listen(8000,'127.0.0.1');"]}}};
  await runControl(['--input-type=module','-e',seed],JSON.stringify({root:installRoot,cluster,path:overlay,overlay:testOverlay,
   catalog:raw.apiRelease.catalogFile,trust:raw.apiRelease.trustFile,maximumValidityMs:raw.apiRelease.maximumValidityMs}));
  await d(['network','connect','--alias','api-gw',raw.networks.egress,backend.gatewayContainer]);backendNetwork=true;
  await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90'],true);
  await d(['network','connect',raw.networks.directory,backend.gatewayContainer]);auditNetwork=true;
  const access=JSON.parse((await runControl(['--input-type=module','-e',
   "import fs from 'node:fs/promises';console.log(JSON.stringify({databaseUrl:(await fs.readFile(process.argv[1]+'/operator/admin.dsn','utf8')).trim(),ca:await fs.readFile('/run/roomqc-directory-ca/ca.crt','utf8')}));",installRoot])).stdout);
  result.customerJourney=await onInstalled({run,origin:'http://roomqc-web:8080',deploymentId:id,...access});
  assert.equal(result.customerJourney.verified,true);assert.equal(result.customerJourney.controlRuntime,'installed-management-image');
  await d(['network','disconnect',raw.networks.directory,backend.gatewayContainer]);auditNetwork=false;
  await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90','--remove-orphans']);
  result.verifyAfter=await transport.managementInstall(input,'verify');result.signupReclosed=true;
  const snapshot=String.raw`import pg from 'pg';import fs from 'node:fs/promises';const p=new pg.Pool({connectionString:(await fs.readFile(process.argv[1],'utf8')).trim(),max:1});try{
if(process.argv[2]==='write')await p.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES('sentinel','Preserve installer journey','local')");
const host=(await p.query("SELECT name FROM roomqc_control.hosts WHERE id='sentinel'")).rows[0];if(host?.name!=='Preserve installer journey')throw Error('SENTINEL_LOST');
const workspaces=(await p.query("SELECT id::text,slug,cluster_id,status FROM roomqc_control.workspaces ORDER BY id")).rows;
if(workspaces.length<2)throw Error('CUSTOMER_WORKSPACES_MISSING');console.log(JSON.stringify({persisted:true,workspaces}));}finally{await p.end()}`;
  const before=JSON.parse((await runControl(['--input-type=module','-e',snapshot,installRoot+'/operator/admin.dsn','write'])).stdout);
  await op(['restart','--timeout','30']);await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90']);
  result.verifyAfterRestart=await transport.managementInstall(input,'verify');
  const after=JSON.parse((await runControl(['--input-type=module','-e',snapshot,installRoot+'/operator/admin.dsn','read'])).stdout);
  assert.deepEqual(after,before);result.restartPreservesData=true;result.persistedWorkspaces=after.workspaces.length;
  assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));result.sourceUnchanged=true;
  result.backendSourceSha256=binding.sha256;result.controlImage=controlImage;result.verified=true;
 }catch(error){result.failedCommand=count;result.failureCode=/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'MANAGEMENT_INSTALLER_JOURNEY_FAILED';throw error;}
 finally{
  if(auditNetwork)await d(['network','disconnect',raw.networks.directory,backend.gatewayContainer]);
  if(backendNetwork)await d(['network','disconnect',raw.networks.egress,backend.gatewayContainer]);
  if(plan){
   for(const kind of ['container','network','volume']){
    const filter='label=roomqc.management.install='+id;
    const values=(await d([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter',filter])).stdout.trim().split(/\s+/).filter(Boolean);
    for(const value of values){const info=JSON.parse((await d([kind,'inspect',value])).stdout)[0];
     const labels=kind==='container'?info.Config.Labels:info.Labels;
     assert.equal(labels['roomqc.management.install'],id);assert.equal(labels['roomqc.management.spec'],plan.specSha256);
     await d([kind,'rm',...(kind==='container'?['--force']:[]),value],{timeout:60000});}
   }
   result.remaining={};for(const kind of ['container','network','volume']){
    assert.equal((await d([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter','label=roomqc.management.install='+id])).stdout.trim(),'');result.remaining[kind]=0;}
   result.cleaned=true;
  }
  await save();console.log(JSON.stringify({event:'management_product_installer_terminal',run,verified:result.verified,cleaned:result.cleaned,stateFile}));
 }
 return result;
}
