// Real deployment-template exercise on fresh labeled Docker resources only.
// The operator owns a test Docker socket; long-lived services never receive it.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {composePreflightEnvironment} from './control-backend-resource-preflight.mjs';
import {renderManagementBundle,managementDirectoryImage} from '../server/control/management-bundle.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
const repository=fileURLToPath(new URL('../',import.meta.url)),owner='roomqc.management-bundle-test';
const emit=v=>console.log(JSON.stringify(v)),sha=v=>createHash('sha256').update(v).digest('hex');
export async function runManagementBundleLocal({backend,transport,onInstalled,controlImage}={}){
 if(!backend&&process.argv.slice(2).join(' ')!=='--run'){
  console.log('Usage: node scripts/test-management-bundle-local.mjs --run. Requires ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE, a current built immutable control image. No VPS or serving data changes.');return;
 }
 if(backend){assert.equal(backend.diagnosticOnly,true);assert.match(backend.run,/^[a-f0-9]{12}$/);assert.equal(typeof transport,'function');assert.equal(typeof onInstalled,'function');}
 const run=backend?.run??randomBytes(6).toString('hex'),id='mg-'+run,project='roomqc-management-'+id,label=owner+'='+run;
 await mkdir(join(repository,'.local'),{recursive:true});const root=await mkdtemp(join(repository,'.local',project+'-'));
 // This directory contains private command logs. Restrict Windows inheritance.
 if(process.platform==='win32'){
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),exec=promisify(execFile);
  const sid=(await exec('whoami',['/user','/fo','csv','/nh'],{windowsHide:true})).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];assert(sid);
  await exec('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true});
 }
 let command=0;
 const d=async(args,{input,timeout=30000,allowFailure=false}={})=>{
  const result=transport?await transport(args,{input,timeout,allowFailure}):await new Promise((accept,reject)=>{
   const c=spawn('docker',args,{cwd:repository,env:composePreflightEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
   const out=[],err=[];let bytes=0,timedOut=false;const timer=setTimeout(()=>{timedOut=true;c.kill()},timeout);
   const collect=(target,b)=>{bytes+=b.length;if(bytes>8*1024*1024)c.kill();else target.push(b)};
   c.stdout.on('data',b=>collect(out,b));c.stderr.on('data',b=>collect(err,b));c.on('error',e=>{clearTimeout(timer);reject(e)});
   c.on('close',(code,signal)=>{clearTimeout(timer);accept({code,signal,timedOut,stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()})});c.stdin.end(input);
  });
  await writeFile(join(root,'command-'+(++command)+'.log'),result.stdout+'\n'+result.stderr,{mode:0o600});
  if(!allowFailure){assert.equal(result.code,0,'MANAGEMENT_TEST_COMMAND_'+command);assert(!result.timedOut);assert.equal(result.signal,null)}
  return result;
 };
 const control=controlImage??process.env.ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE;
 assert.match(control??'',/^roomqc\/control@sha256:[a-f0-9]{64}$/);
 const web='roomqc/web:customer-access-20261031',operatorImage='roomqc/deployment-executor:private-config-20261031',helper='roomqc/realtime:bootstrap-d4ce9a9abab8f2d4';
 const image=async ref=>JSON.parse((await d(['image','inspect',ref])).stdout)[0];
 const controlInfo=await image(control),webInfo=await image(web);await image(operatorImage);await image(helper);await image(managementDirectoryImage);
 const binding=await captureBackendSourceBinding(repository);
 assert.equal(controlInfo.Config.Labels['roomqc.control.backend'],binding.sha256,'Rebuild the control image from current sources');
 const snapshot=async()=>{
  const ids=(await d(['ps','-aq','--no-trunc'])).stdout.trim().split(/\s+/).filter(Boolean);
  if(!ids.length)return new Map();
  return new Map((await d(['inspect','--format','{{.Id}} {{.State.StartedAt}}',...ids])).stdout.trim().split('\n').map(line=>line.trim().split(' ')));
 };
 const baseline=await snapshot();
 const result={kind:'roomqc-management-bundle-local',run,startedAt:new Date().toISOString(),backendSourceSha256:binding.sha256,
  controlImage:control,frontendImageId:webInfo.Id,externalVpsChanged:false,signupOpened:false,verified:false,cleaned:false,
  limitations:['Frontend rendering and API routing only; no browser signup on this project.','Alert worker idle readiness; external delivery not exercised.','Host monitor, setup/health full worker integration, TLS renewal and offsite backup remain separate.']};
 const stateFile=join(root,'result.json'),save=()=>writeFile(stateFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 emit({event:'management_bundle_started',run,stateFile});
 const names={data:project+'-data',private:project+'-private',ca:project+'-ca',workspace:project+'-workspace'};
 const networks=Object.fromEntries(['directory','egress','web','metrics'].map(k=>[k,project+'-'+k]));
 const operator=project+'-operator';let failed=false,workspace,auditNetworkConnected=false,backendNetworkConnected=false;
 try{
  if(backend){
   const network=JSON.parse((await d(['network','inspect',backend.network])).stdout)[0];
   assert.equal(network.Internal,true);assert.equal(network.Labels['roomqc.control-backend-test'],run);
   const gateway=JSON.parse((await d(['inspect',backend.gatewayContainer])).stdout)[0];
   assert.equal(gateway.Config.Labels['roomqc.control-backend-test'],run);
   result.actualSsh=true;result.sharedBackend=true;result.localFixtureSignupOpened=false;
  }
  for(const name of Object.values(names))await d(['volume','create','--label',label,name]);
  // A web bridge needs a gateway for Docker to publish its loopback port.
  // Database/metrics and fixture worker egress remain internal.
  for(const [kind,name]of Object.entries(networks))await d(['network','create',...(kind==='web'?[]:['--internal']),'--label',label,name]);
  if(backend){await d(['network','connect','--alias','api-gw',networks.egress,backend.gatewayContainer]);backendNetworkConnected=true;}
  workspace=JSON.parse((await d(['volume','inspect',names.workspace])).stdout)[0].Mountpoint;
  assert.match(workspace,/^\/var\/lib\/docker\/volumes\/roomqc-management-mg-[a-f0-9]{12}-workspace\/_data$/);
  const p=workspace+'/private',meta=workspace+'/metadata',out=workspace+'/output',credentials=p+'/credentials';
  const budget=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));budget.environment='local';
  const db=budget.databases[0];db.maxConnections=32;
  for(const c of db.consumers)c.replicas=['control-api','alert-worker','migration','backup'].includes(c.id)?1:0;
  const budgetText=JSON.stringify(budget)+'\n',budgetSha256=sha(budgetText);
  const raw={version:1,deploymentId:id,environment:'local',listenPort:0,
   images:{directory:managementDirectoryImage,control,frontend:'roomqc/web@'+webInfo.Id},
   resources:{directory:{memoryBytes:512*1024*1024,cpus:1,sharedBuffersBytes:64*1024*1024,shmBytes:64*1024*1024},control:{memoryBytes:256*1024*1024,cpus:0.5},frontend:{memoryBytes:128*1024*1024,cpus:0.5}},
   networks,volumes:{data:names.data,private:names.private,ca:names.ca},
   files:{budget:p+'/budget.json',apiEnvironment:p+'/api.env',apiDsn:credentials+'/rq_'+id.replaceAll('-','_')+'_api_1.dsn',postgresConfig:meta+'/postgresql.conf',hbaConfig:meta+'/pg_hba.conf',webConfig:meta+'/nginx.conf'},
   workers:{alert:{configFile:p+'/alerts.json',dsnFile:credentials+'/rq_'+id.replaceAll('-','_')+'_alerts_1.dsn',endpointFile:p+'/alert.endpoint',tokenFile:p+'/alert.token',resources:{memoryBytes:256*1024*1024,cpus:0.5}}}};
  const bundle=renderManagementBundle(raw,budget);for(const s of Object.values(bundle.compose.services))s.labels[owner]=run;
  const testOverlay={services:Object.fromEntries(Object.keys(bundle.compose.services).map(name=>[name,{labels:{[owner]:run}}]))};
  if(backend){
   testOverlay.services['roomqc-control'].volumes=[
    {type:'bind',source:p+'/release-catalog.json',target:'/etc/roomqc/release-catalog.json',read_only:true},
    {type:'bind',source:p+'/release-trust.json',target:'/etc/roomqc/release-trust.json',read_only:true}];
   testOverlay.services['roomqc-web'].networks=['web','egress'];
   // Local test adapter for the approved loopback URL. It has no configuration
   // credentials or Docker socket and cannot replace a product handler.
   testOverlay.services['journey-backend-relay']={image:control,user:'1000:1000',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],
    labels:{[owner]:run},network_mode:'service:roomqc-control',mem_limit:64*1024*1024,cpus:0.5,pids_limit:32,
    depends_on:{'roomqc-control':{condition:'service_healthy'}},command:['node','--input-type=module','-e',
     "import http from 'node:http';http.createServer((req,res)=>{const up=http.request({hostname:'api-gw',port:8000,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});up.on('error',()=>{res.writeHead(502);res.end()});req.pipe(up)}).listen(8000,'127.0.0.1');"]};
  }
  const adminPassword=randomBytes(32).toString('hex'),emailKey=randomBytes(32).toString('hex'),alertToken=randomBytes(32).toString('hex');
  const files={
   [p+'/budget.json']:budgetText,[p+'/descriptor.json']:JSON.stringify(raw),[out+'/test.compose.json']:JSON.stringify(bundle.compose),
   [out+'/test-labels.json']:JSON.stringify(testOverlay),
   [p+'/api.env']:'ROOMQC_PUBLIC_URL=https://management.roomqc.invalid\nROOMQC_CONTROL_SUPPORT_CLUSTER_ID=cluster-a\nROOMQC_CONTROL_EMAIL_HASH_KEY='+emailKey+'\nROOMQC_CONTROL_CLUSTERS='+JSON.stringify([{id:'cluster-a',url:'https://cluster-a.roomqc.invalid',publishableKey:'fixture-public',serviceKey:'fixture-private',vapidPublicKey:'fixture-vapid',maxWorkspaces:10}])+'\n',
   [p+'/alerts.json']:JSON.stringify({schemaVersion:1,instanceId:'alerts-'+run,poolMax:1,concurrency:1,intervalMs:1000,requestTimeoutMs:1000,leaseMs:15000,shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:32,otherAllocatedConnections:7,instances:1,reservedConnections:5}}),
   [p+'/alert.endpoint']:'https://alerts.roomqc.invalid/events\n',[p+'/alert.token']:alertToken+'\n',
   [p+'/registry.json']:JSON.stringify([{id:'cluster-a',url:'https://cluster-a.roomqc.invalid',publishableKey:'fixture-public',vapidPublicKey:'fixture-vapid',maxWorkspaces:10,credentialRef:'cluster-a'}]),
   [meta+'/postgresql.conf']:await readFile(join(repository,'deploy/control/directory/postgresql.conf'),'utf8'),
   [meta+'/pg_hba.conf']:await readFile(join(repository,'deploy/control/directory/pg_hba.conf'),'utf8'),
   [meta+'/nginx.conf']:await readFile(join(repository,'deploy/control/management-nginx.conf'),'utf8')};
  if(backend)files[p+'/registry.json']=JSON.stringify([{id:'cluster-a',url:'https://cluster-a.roomqc.invalid',
   publishableKey:backend.publishableKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99,credentialRef:'cluster-a'}]);
  // The helper copies only this test's inputs into its own volume via stdin.
  const prepare=String.raw`const fs=require('node:fs');let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{
const v=JSON.parse(text);for(const path of v.dirs){fs.mkdirSync(path,{recursive:true,mode:0o700});fs.chownSync(path,1000,1000)}
for(const [path,data]of Object.entries(v.files)){fs.writeFileSync(path,data,{flag:'wx',mode:path.includes('/metadata/')?0o444:0o600});fs.chownSync(path,1000,1000)}
fs.chmodSync(v.metadata,0o755);fs.chmodSync(v.workspace,0o755);});`;
  await d(['run','--rm','-i','--label',label,'--network','none','--user','0:0','--mount','type=volume,source='+names.workspace+',target='+workspace,
   '--entrypoint','node',control,'-e',prepare],{input:JSON.stringify({workspace,metadata:meta,dirs:[workspace,p,meta,out,credentials],files})});
  const cert=String.raw`set -eu
read -r password
umask 077
cd /tmp
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out /public/ca.crt -days 2 -subj /CN=RoomQC-Management-Fixture
openssl req -newkey rsa:2048 -nodes -keyout /private/server.key -out server.csr -subj /CN=roomqc-directory
printf 'subjectAltName=DNS:roomqc-directory\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA /public/ca.crt -CAkey ca.key -CAcreateserial -out /private/server.crt -days 2 -extfile server.ext
printf '%s' "$password" > /private/admin-password
chown -R 70:70 /private /data
chmod 0700 /private /data
chmod 0600 /private/server.key /private/admin-password
chmod 0444 /private/server.crt /public/ca.crt
chmod 0755 /public
`;
  await d(['run','--rm','-i','--label',label,'--network','none','--user','0:0','--read-only','--tmpfs','/tmp:rw,nosuid,noexec,size=8m',
   '--mount','type=volume,source='+names.data+',target=/data','--mount','type=volume,source='+names.private+',target=/private','--mount','type=volume,source='+names.ca+',target=/public',
   '--entrypoint','sh',helper,'-c',cert],{input:adminPassword+'\n',timeout:60000});
  await d(['run','-d','--name',operator,'--label',label,'--network',networks.directory,'--user','0:0',
   '--mount','type=volume,source='+names.workspace+',target='+workspace,'--mount','type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
   '--entrypoint','sh',operatorImage,'-c','sleep 900']);
  let composeFiles=['-f',out+'/test.compose.json'];
  const op=args=>d(['exec',operator,'docker','compose','--project-name',project,...composeFiles,...args],{timeout:150000});
  await op(['config','--quiet']);await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','60','roomqc-directory']);
  emit({event:'management_directory_started',run});
  const probe=String.raw`import pg from 'pg';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
let text='';for await(const c of process.stdin)text+=c;const v=JSON.parse(text),u=new URL('postgresql://roomqc-directory:5432/roomqc_control?sslmode=verify-full');u.username='postgres';u.password=v.password;
const pool=new pg.Pool({connectionString:u.href,max:1});try{
const expected=(await pool.query('SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",(pg_control_system()).system_identifier::text AS "systemIdentifier" FROM pg_database d WHERE d.datname=current_database()')).rows[0];
const config={version:1,deploymentId:v.id,environment:'local',expected,budgetFile:v.p+'/budget.json',budgetSha256:v.budgetSha256,adminDsnFile:v.p+'/admin.dsn',credentialsDirectory:v.p+'/credentials',registryFile:v.p+'/registry.json'};
await fs.writeFile(config.adminDsnFile,u.href+'\n',{mode:0o600});await fs.writeFile(v.p+'/bootstrap.json',JSON.stringify(config),{mode:0o600});
await fs.writeFile(v.p+'/wrong.json',JSON.stringify({...config,expected:{...expected,databaseOid:String(Number(expected.databaseOid)+1)}}),{mode:0o600});
console.log(JSON.stringify({ok:true}));}finally{await pool.end()}`;
  const runControl=async(args,{input,allowFailure=false}={})=>d(['run','--rm',...(input?['-i']:[]),'--label',label,'--network',networks.directory,'--read-only',
   '--cap-drop','ALL','--security-opt','no-new-privileges','--env','NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/ca.crt',
   '--mount','type=volume,source='+names.workspace+',target='+workspace,'--mount','type=volume,source='+names.ca+',target=/run/roomqc-directory-ca,readonly',
   '--entrypoint','node',control,...args],{input,timeout:90000,allowFailure});
  await runControl(['--input-type=module','-e',probe],{input:JSON.stringify({password:adminPassword,id,p,budgetSha256})});
  const bootstrap=async(mode,file=p+'/bootstrap.json')=>{
   const r=await runControl(['management-bootstrap-cli.mjs','--config-file',file,'--'+mode],{allowFailure:true});
   assert(!r.stdout.includes(adminPassword));return {code:r.code,report:JSON.parse(r.stdout.trim())};
  };
  const wrong=await bootstrap('initialize',p+'/wrong.json');assert.equal(wrong.code,1);assert.equal(wrong.report.code,'MANAGEMENT_BOOTSTRAP_TARGET_MISMATCH');
  const missingOwner=await bootstrap('resume');assert.equal(missingOwner.code,1);assert.equal(missingOwner.report.code,'MANAGEMENT_BOOTSTRAP_OWNER_MISMATCH');
  const unowned=String.raw`import pg from 'pg';import fs from 'node:fs/promises';const p=new pg.Pool({connectionString:(await fs.readFile(process.argv[1],'utf8')).trim(),max:1});try{
if(process.argv[2]==='seed')await p.query('CREATE FUNCTION public.management_fixture_unowned() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');
else{const row=(await p.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];if(row.marker!==null)throw Error('UNOWNED_DATABASE_ADOPTED');await p.query('DROP FUNCTION public.management_fixture_unowned()');}
console.log(JSON.stringify({ok:true}));}finally{await p.end()}`;
  await runControl(['--input-type=module','-e',unowned,p+'/admin.dsn','seed']);
  const populated=await bootstrap('initialize');assert.equal(populated.code,1);assert.equal(populated.report.code,'MANAGEMENT_BOOTSTRAP_OWNER_MISMATCH');
  await runControl(['--input-type=module','-e',unowned,p+'/admin.dsn','clear']);result.unownedDatabaseRejectedWithoutMutation=true;
  const initial=await bootstrap('initialize');assert.equal(initial.code,0,JSON.stringify(initial.report));assert.equal(initial.report.runtimeLogins,2);assert(initial.report.migrationsApplied>0);result.bootstrap=initial.report;
  const resumed=await bootstrap('resume');assert.equal(resumed.code,0,JSON.stringify(resumed.report));assert.equal(resumed.report.migrationsApplied,0);
  assert.equal((await bootstrap('verify')).code,0);result.repeatPreservesCredentials=true;
  const rendered=JSON.parse((await runControl(['management-bundle-cli.mjs','--config-file',p+'/descriptor.json','--output-directory',out])).stdout);
  assert.equal(rendered.ok,true);result.bundle=rendered;
  if(backend){
   const seed=String.raw`import pg from 'pg';import fs from 'node:fs/promises';
import {fixtureConfig,seedOperationalCluster} from '/app/test-fixtures.mjs';
import {fixtureReleaseApproval,fixtureReleaseContext,fixtureReleaseTrustRaw,fixtureReleaseMaximumValidityMs} from '/app/release-test-fixtures.mjs';
import {syntheticBundle,syntheticRelease} from '/app/probe-test-fixtures.mjs';
let text='';for await(const part of process.stdin)text+=part;const v=JSON.parse(text);
const cluster={id:'cluster-a',url:'https://cluster-a.roomqc.invalid',internalUrl:'http://127.0.0.1:8000',publishableKey:v.publishableKey,serviceKey:v.serviceKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99};
const pool=new pg.Pool({connectionString:(await fs.readFile(v.p+'/admin.dsn','utf8')).trim(),max:1});
try{await seedOperationalCluster(pool,cluster.id,{cluster});const cfg=fixtureConfig('',[cluster]);
const catalog={version:2,entries:[{inventoryRef:cluster.id,approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,{...syntheticRelease,clusterId:cluster.id})),credential:{...syntheticBundle().credential,publishableKey:cluster.publishableKey}}]};
for(const [name,value]of [['release-catalog.json',catalog],['release-trust.json',fixtureReleaseTrustRaw]])await fs.writeFile(v.p+'/'+name,JSON.stringify(value),{flag:'wx',mode:0o600});
const env={ROOMQC_PUBLIC_URL:'http://127.0.0.1:8082',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_SUPPORT_CLUSTER_ID:cluster.id,ROOMQC_CONTROL_EMAIL_HASH_KEY:v.emailKey,
ROOMQC_CONTROL_CLUSTERS:JSON.stringify([cluster]),ROOMQC_CONTROL_INVENTORY:JSON.stringify([...cfg.inventory.values()]),
ROOMQC_CONTROL_RELEASE_VALIDATION_FILE:'/etc/roomqc/release-catalog.json',ROOMQC_CONTROL_RELEASE_TRUST_FILE:'/etc/roomqc/release-trust.json',ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(fixtureReleaseMaximumValidityMs)};
await fs.writeFile(v.p+'/api.env',Object.entries(env).map(([k,value])=>k+'='+value).join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({seeded:true,authority:'synthetic-local-fixture'}));}finally{await pool.end()}`;
   await runControl(['--input-type=module','-e',seed],{input:JSON.stringify({p,emailKey,publishableKey:backend.publishableKey,serviceKey:backend.serviceKey})});
  }
  composeFiles=['-f',out+'/management.compose.json','-f',out+'/test-labels.json'];
  await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90']);
  const ids=(await op(['ps','-q'])).stdout.trim().split(/\s+/),containers=JSON.parse((await d(['inspect',...ids])).stdout);
  assert.equal(containers.length,backend?5:4);
  for(const c of containers){
   assert.equal(c.Config.Labels[owner],run);if(c.State.Health)assert.equal(c.State.Health.Status,'healthy');else assert.equal(c.State.Status,'running');assert(c.HostConfig.ReadonlyRootfs);
   assert(!c.Mounts.some(m=>m.Source==='/var/run/docker.sock'));
  }
  const webContainer=containers.find(c=>c.Config.Labels['com.docker.compose.service']==='roomqc-web');
  const port=webContainer.NetworkSettings.Ports['8080/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
  let base='http://127.0.0.1:'+port.HostPort;
  const refreshBase=async()=>{const id=(await op(['ps','-q','roomqc-web'])).stdout.trim();const info=JSON.parse((await d(['inspect',id])).stdout)[0];
   const bound=info.NetworkSettings.Ports['8080/tcp'][0];assert.equal(bound.HostIp,'127.0.0.1');base='http://127.0.0.1:'+bound.HostPort;};
  result.http={};result.http.frontendHealth=(await fetch(base+'/healthz')).status;assert.equal(result.http.frontendHealth,200);
  const page=await fetch(base+'/super-admin/infrastructure');result.http.frontendPage=page.status;assert.equal(page.status,200);assert.match(await page.text(),/<div id="root">/);
  assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('x-frame-options'),'SAMEORIGIN');
  const ready=await fetch(base+'/api/control/readyz');result.http.controlReadiness=ready.status;assert.equal(ready.status,200);result.controlReady=await ready.json();
  const adminRead=await fetch(base+'/api/control/admin/hosts');result.http.unauthenticatedAdmin=adminRead.status;assert.equal(adminRead.status,401);
  const signup=await fetch(base+'/api/control/signup-intents',{method:'POST',headers:{Origin:backend?'http://127.0.0.1:8082':'https://management.roomqc.invalid','Content-Type':'application/json'},body:JSON.stringify({slug:'bundle-test'})});
  assert.equal(signup.status,503);assert.equal((await signup.json()).error,'SIGNUP_CLOSED');
  result.http.signupStatus=503;result.http.signupCode='SIGNUP_CLOSED';
  emit({event:'management_services_healthy',run,services:containers.length});
  if(backend){
   // The product bundle remains closed. Only this explicitly owned local
   // acceptance overlay opens signup, then is removed and checked again.
   const optIn={services:{'roomqc-control':{environment:{ROOMQC_CONTROL_SIGNUP_ENABLED:'true',ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED:'true'}}}};
   const writeOptIn=String.raw`import fs from 'node:fs/promises';let text='';for await(const part of process.stdin)text+=part;const v=JSON.parse(text);await fs.writeFile(v.path,JSON.stringify(v.value),{flag:'wx',mode:0o600});`;
   await runControl(['--input-type=module','-e',writeOptIn],{input:JSON.stringify({path:out+'/local-signup-only.json',value:optIn})});
   composeFiles.push('-f',out+'/local-signup-only.json');
   await op(['up','-d','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90']);
   await refreshBase();
   await d(['network','connect',networks.directory,backend.gatewayContainer]);auditNetworkConnected=true;
   const privateInput=String.raw`import fs from 'node:fs/promises';console.log(JSON.stringify({databaseUrl:(await fs.readFile(process.argv[1],'utf8')).trim(),ca:await fs.readFile('/run/roomqc-directory-ca/ca.crt','utf8')}));`;
   const access=JSON.parse((await runControl(['--input-type=module','-e',privateInput,p+'/admin.dsn'])).stdout);
   result.customerJourney=await onInstalled({run,origin:'http://roomqc-web:8080',deploymentId:id,...access});
   assert.equal(result.customerJourney.verified,true);assert.equal(result.customerJourney.controlRuntime,'installed-management-image');
   result.localFixtureSignupOpened=true;
   await d(['network','disconnect',networks.directory,backend.gatewayContainer]);auditNetworkConnected=false;
   composeFiles=composeFiles.slice(0,-2);
   await op(['up','-d','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90']);
   await refreshBase();
   const closed=await fetch(base+'/api/control/signup-intents',{method:'POST',headers:{Origin:'http://127.0.0.1:8082','Content-Type':'application/json'},body:'{}'});
   assert.equal(closed.status,503);assert.equal((await closed.json()).error,'SIGNUP_CLOSED');result.signupReclosed=true;
  }
  // Persist a harmless owned sentinel, restart actual services, and verify data.
  const sentinel=String.raw`import pg from 'pg';import fs from 'node:fs/promises';const u=(await fs.readFile(process.argv[1],'utf8')).trim();const p=new pg.Pool({connectionString:u,max:1});try{
if(process.argv[2]==='write')await p.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES('sentinel','Preserve management test','local')");
const row=(await p.query("SELECT name FROM roomqc_control.hosts WHERE id='sentinel'")).rows[0];if(row?.name!=='Preserve management test')throw Error('SENTINEL_LOST');console.log(JSON.stringify({persisted:true}));}finally{await p.end()}`;
  await runControl(['--input-type=module','-e',sentinel,p+'/admin.dsn','write']);
  await op(['restart','--timeout','30']);await op(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90']);
  await runControl(['--input-type=module','-e',sentinel,p+'/admin.dsn','read']);
  assert.equal((await bootstrap('verify')).code,0);result.restartPreservesData=true;
  // Actual API role cannot access administrator hashes or the alert queue.
  const permissions=String.raw`import pg from 'pg';import fs from 'node:fs/promises';const p=new pg.Pool({connectionString:(await fs.readFile(process.argv[1],'utf8')).trim(),max:1});let checks=0;try{
for(const sql of ['SELECT rolpassword FROM pg_authid','CREATE TABLE roomqc_control.forbidden(id int)']){let denied=false;try{await p.query(sql)}catch(e){denied=e.code==='42501'}if(!denied)throw Error('PRIVILEGE_LEAK');checks++}
const r=(await p.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];if(!r.ssl)throw Error('TLS_MISSING');console.log(JSON.stringify({checks,tls:true}));}finally{await p.end()}`;
  result.privileges=JSON.parse((await runControl(['--input-type=module','-e',permissions,raw.files.apiDsn])).stdout);
  for(const secret of [adminPassword,emailKey,alertToken])assert(!JSON.stringify(bundle).includes(secret));
  result.noSecretsInBundle=true;assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));result.sourceUnchanged=true;result.verified=true;await save();
 }catch(error){failed=true;result.failureCode=/^MANAGEMENT_/.test(error.message??'')?error.message:'MANAGEMENT_BUNDLE_TEST_FAILED';
  if(typeof error.actual==='number'&&typeof error.expected==='number')result.numericAssertion={actual:error.actual,expected:error.expected};
  result.failedCommand=command;await save();emit({event:'management_bundle_failed',run,code:result.failureCode,command});}
 finally{
  try{
   if(auditNetworkConnected){await d(['network','disconnect',networks.directory,backend.gatewayContainer]);auditNetworkConnected=false;}
   if(backendNetworkConnected){await d(['network','disconnect',networks.egress,backend.gatewayContainer]);backendNetworkConnected=false;}
   // Compose-created services receive the test owner label from its private overlay.
   for(const kind of ['container','network','volume']){
    const ids=(await d([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter','label='+label])).stdout.trim().split(/\s+/).filter(Boolean);
    for(const id of ids){const info=JSON.parse((await d([kind,'inspect',id])).stdout)[0];assert.equal((kind==='container'?info.Config.Labels:info.Labels)[owner],run);await d([kind,'rm',...(kind==='container'?['--force']:[]),id],{timeout:60000})}
   }
   result.remaining={};for(const kind of ['container','network','volume']){assert.equal((await d([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter','label='+label])).stdout.trim(),'');result.remaining[kind]=0}
   if(baseline.size){const after=await snapshot();assert([...baseline].every(([id,started])=>after.get(id)===started))}
   result.unrelatedContainersUnchanged=true;result.cleaned=true;
  }catch{failed=true;result.cleanupFailed=true}
  result.finishedAt=new Date().toISOString();await save();emit({event:'management_bundle_terminal',run,verified:result.verified,cleaned:result.cleaned,stateFile});
 }
 if(failed)throw Object.assign(new Error('MANAGEMENT_BUNDLE_TEST_FAILED'),{code:'MANAGEMENT_BUNDLE_TEST_FAILED',stateFile});
 return result;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)runManagementBundleLocal().catch(()=>{emit({event:'management_bundle_setup_failed'});process.exitCode=1});
