// Fresh, closed backend configuration. Never adopts a serving database and
// never turns a local acceptance receipt into production approval.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deploymentEnvironment} from '../server/control/deployment-environment.mjs';
import {deploymentCompose} from '../server/control/vps-deploy.mjs';
import {businessMigrationManifest} from '../server/control/business-migrate.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const exec=promisify(execFile),sha=x=>createHash('sha256').update(x).digest('hex');
export const backendServices=['api-gw','auth','db','functions','imgproxy','realtime','rest','storage'];
export function backendPostMigrationRest(){
 const compose={services:{rest:{environment:{PGRST_DB_SCHEMAS:'public,graphql_public,roomqc_setup,roomqc_summary'}}}};
 return {compose,sha256:sha(JSON.stringify(compose))};
}
export const vendorCommit='bc27d2661edd09a5d0b8d76ce33da6d4071a756e';
const limits={db:[768,0.75],auth:[128,0.125],rest:[128,0.125],realtime:[384,0.25],storage:[256,0.25],imgproxy:[128,0.125],functions:[384,0.25],'api-gw':[128,0.125]};
export function backendOptions({clusterId,releaseId,publicUrl,listenPort}){
 assert.match(clusterId??'',/^[a-z][a-z0-9-]{1,39}$/);assert.match(releaseId??'',/^[a-z][a-z0-9-]{1,39}$/);
 const url=new URL(publicUrl);assert.equal(url.protocol,'https:');assert.equal(url.origin,publicUrl);
 assert(Number.isSafeInteger(listenPort)&&listenPort>=1024&&listenPort<=65535);
 return {clusterId,releaseId,publicUrl,listenPort};
}
const token=(secret,role)=>{
 const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000),body=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iss:'supabase',iat:now,exp:now+10*365*86400});
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
};
export async function buildBackendBundle({repository,sourceState,controlImage,...input}){
 const options=backendOptions(input),{clusterId,releaseId,publicUrl,listenPort}=options;
 assert.match(controlImage??'',/^roomqc\/control@sha256:[a-f0-9]{64}$/);
 const source=JSON.parse(await readFile(sourceState,'utf8'));
 assert.equal(source.cleaned,true);assert.equal(source.sourceBindingVerifiedAtEnd,true);
 assert.equal(source.customerJourneyControls?.verified,true);assert.equal(source.customerJourneyControls.checks.length,93);
 assert(source.customerJourneyControls.checks.every(c=>c.passed));assert.equal(source.packagedFunctions?.functions,42);
 assert.equal(source.packagedFunctions.perHandlerClones,false);assert.equal(source.packagedFunctions.normalGatewayRoutes,true);
 assertBackendSourceBinding(source.sourceBinding,await captureBackendSourceBinding(repository));
 const run=async(command,args,extra={})=>exec(command,args,{windowsHide:true,maxBuffer:4*1024*1024,...extra});
 const vendor=join(source.root,'upstream');
 assert.equal((await run('git',['rev-parse','HEAD'],{cwd:vendor})).stdout.trim(),vendorCommit);
 const original=async path=>(await run('git',['show',vendorCommit+':docker/'+path],{cwd:vendor})).stdout;
 const images={};
 for(const name of backendServices){
  const locked=source.imageLock.find(i=>i.service===name);assert(locked);
  const info=JSON.parse((await run('docker',['image','inspect',locked.imageId])).stdout)[0];
  assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
  // Dedicated transport names preserve repository@digest on containerd imports.
  const tag='roomqc/backend-'+name+':'+locked.imageId.slice(7,27);
  await run('docker',['tag',locked.imageId,tag]);
  images[name]={tag,reference:'roomqc/backend-'+name+'@'+locked.imageId,imageId:locked.imageId,rootFsLayers:info.RootFS.Layers};
 }
 const control=JSON.parse((await run('docker',['image','inspect',controlImage])).stdout)[0];
 assert.equal(control.Config.Labels['roomqc.control.backend'],source.sourceBinding.sha256);
 const migration=await businessMigrationManifest();
 assert.equal(migration.sha256,source.productBusinessMigration.migrationReceipt.migrationSetSha256);
 await mkdir(join(repository,'.local'),{recursive:true});const root=await mkdtemp(join(repository,'.local/roomqc-backend-install-'));
 if(process.platform==='win32'){
  const sid=(await run('whoami',['/user','/fo','csv','/nh'])).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];assert(sid);
  await run('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
 }
 const work=join(root,'vendor'),assets=join(work,'volumes');await mkdir(assets,{recursive:true});
 const required=['realtime.sql','webhooks.sql','roles.sql','jwt.sql','_supabase.sql','logs.sql','pooler.sql'].map(x=>'db/'+x)
  .concat(['envoy.yaml','cds.yaml','lds.template.yaml','docker-entrypoint.sh'].map(x=>'api/envoy/'+x));
 const files=[];
 for(const name of required){const text=await original('volumes/'+name),target=join(assets,name);await mkdir(dirname(target),{recursive:true});
  await writeFile(target,text,{flag:'wx'});files.push({path:'config/assets/'+name,content:text,mode:0o444});}
 const sqlSource=await original('docker-compose.yml');await writeFile(join(work,'docker-compose.yml'),sqlSource);
 const values={};
 for(const line of (await original('.env.example')).split(/\r?\n/)){
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);if(match)values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
 }
 const password=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex');
 Object.assign(values,{POSTGRES_PASSWORD:password,JWT_SECRET:jwt,ANON_KEY:token(jwt,'anon'),SERVICE_ROLE_KEY:token(jwt,'service_role'),
  POSTGRES_HOST:'db',POSTGRES_PORT:'5432',POSTGRES_DB:'postgres',JWT_EXPIRY:'3600',DISABLE_SIGNUP:'true',ENABLE_EMAIL_SIGNUP:'true',
  ENABLE_EMAIL_AUTOCONFIRM:'false',ENABLE_ANONYMOUS_USERS:'false',ENABLE_PHONE_SIGNUP:'false',ENABLE_PHONE_AUTOCONFIRM:'false',
  SITE_URL:publicUrl,API_EXTERNAL_URL:publicUrl,SUPABASE_PUBLIC_URL:publicUrl,ADDITIONAL_REDIRECT_URLS:publicUrl+'/**',
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'',SMTP_PASS:'',SMTP_ADMIN_EMAIL:'noreply@roomqc.com',SMTP_SENDER_NAME:'RoomQC',
  DASHBOARD_USERNAME:'roomqc',DASHBOARD_PASSWORD:randomBytes(32).toString('hex'),REALTIME_DB_ENC_KEY:randomBytes(8).toString('hex'),
  SECRET_KEY_BASE:randomBytes(48).toString('hex'),VAULT_ENC_KEY:randomBytes(16).toString('hex'),PG_META_CRYPTO_KEY:randomBytes(32).toString('hex')});
 const envFile=join(root,'render.env');await writeFile(envFile,Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
 const model=JSON.parse((await run('docker',['compose','--project-directory',work,'--env-file',envFile,'-f',join(work,'docker-compose.yml'),'config','--format','json'],{env:{...process.env,...values}})).stdout);
 delete model.name;model.volumes={'db-data':{},'db-config':{},'object-data':{}};model.networks={default:{driver:'bridge'}};
 const remoteRoot='/opt/RoomQC/clusters/'+clusterId;
 for(const name of Object.keys(model.services))if(!backendServices.includes(name))delete model.services[name];
 for(const [name,s]of Object.entries(model.services)){
  delete s.container_name;delete s.ports;delete s.depends_on;s.restart='unless-stopped';s.image=images[name].reference;s.pull_policy='never';
  if(name==='functions')s.volumes=[];
  s.networks={default:{aliases:name==='realtime'?['realtime-dev','realtime-dev.supabase-realtime']:name==='api-gw'?['envoy','kong']:[]}};
  s.mem_limit=limits[name][0]*1024**2;s.cpus=limits[name][1];s.pids_limit=name==='db'?192:128;
  s.logging={driver:'json-file',options:{'max-size':'5m','max-file':'2'}};
  if(name!=='db')s.depends_on={db:{condition:'service_healthy'}};
  for(const m of s.volumes??[]){
   if(m.target==='/var/lib/postgresql/data')Object.assign(m,{type:'volume',source:'db-data'});
   else if(m.target==='/var/lib/storage')Object.assign(m,{type:'volume',source:'object-data'});
   else if(m.type==='bind'){
    const path=relative(assets,m.source).replaceAll('\\','/');assert(required.includes(path));
    m.source=remoteRoot+'/config/assets/'+path;m.read_only=true;
   }
   delete m.bind;
  }
  if(name==='db'){s.command.push('-c','max_connections=100','-c','shared_buffers=128MB','-c','cron.launch_active_jobs=off');s.shm_size=128*1024**2;}
  if(name==='auth')Object.assign(s.environment,{GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD:'true',GOTRUE_AUDIT_LOG_DISABLE_POSTGRES:'false',GOTRUE_JWT_ISSUER:publicUrl+'/auth/v1'});
  if(name==='rest'){
   // Scoped RPC schemas do not exist until business migrations have finished.
   s.environment.PGRST_DB_SCHEMAS='public,graphql_public';
   s.healthcheck={test:['CMD','postgrest','--ready'],interval:'5s',timeout:'5s',retries:12};
  }
  if(name==='realtime'){
   s.environment.ROOMQC_HEALTH_TOKEN=values.ANON_KEY;
   s.healthcheck.test=['CMD-SHELL','curl -sSfL --head -o /dev/null -H "Authorization: Bearer $$ROOMQC_HEALTH_TOKEN" http://localhost:4000/api/tenants/realtime-dev/health'];
  }
  if(name==='functions'){
   s.volumes=[];s.read_only=true;s.tmpfs=['/tmp:rw,nosuid,noexec,size=32m'];
   s.command=['start','--user-worker-request-idle-timeout','150000','--main-service','/home/deno/functions/main.eszip'];
   s.healthcheck={test:['CMD-SHELL',"timeout 1 bash -c '</dev/tcp/127.0.0.1/9000'"],interval:'5s',timeout:'5s',retries:12};
   Object.assign(s.environment,{VERIFY_JWT:'true',ROOMQC_CONTROL_CLUSTER_ID:clusterId,ROOMQC_CONTROL_RELEASE_ID:releaseId,
    ROOMQC_EMAIL_PROVIDER:'resend',ROOMQC_EMAIL_ENVIRONMENT:'production',ROOMQC_PUBLIC_URL:publicUrl});
  }
  const env=deploymentEnvironment(Object.fromEntries(Object.entries(s.environment??{}).map(([k,v])=>[k,String(v??'')])),clusterId);
  files.push({path:env.path.slice(remoteRoot.length+1),content:env.source,mode:0o600});delete s.environment;s.env_file=[env.envFile];
 }
 model.services['api-gw'].ports=[{target:8000,published:String(listenPort),host_ip:'127.0.0.1',protocol:'tcp'}];
 const compose=deploymentCompose(model,{clusterId,releaseId,image:images.db.reference});
 const privateData={publishableKey:values.ANON_KEY,serviceKey:values.SERVICE_ROLE_KEY,jwtSecret:jwt,
  databaseUrl:'postgres://supabase_admin:'+password+'@db:5432/postgres?sslmode=disable',databasePassword:password};
 files.push({path:'config/operator/backend.json',content:JSON.stringify(privateData)+'\n',mode:0o600});
 const body={version:2,kind:'roomqc-fresh-backend-install',...options,project:'roomqc-'+clusterId,root:remoteRoot,controlImage,
  sourceSha256:source.sourceBinding.sha256,migration:{count:migration.count,sha256:migration.sha256},images,
  compose:compose.model,composeSha256:compose.sha256,postMigrationRest:backendPostMigrationRest(),files:files.map(f=>({...f,sha256:sha(f.content)})),
  memoryRequiredBytes:Object.values(limits).reduce((n,[m])=>n+m*1024**2,128*1024**2),cpusRequired:2,
  requiredRuntimeDiskBytes:768*1024**2,signupOpened:false,productionReady:false};
 const bundle={...body,specSha256:sha(JSON.stringify(body))},path=join(root,'backend.json');
 await writeFile(path,JSON.stringify(bundle,null,2)+'\n',{mode:0o600,flag:'wx'});
 assertBackendSourceBinding(source.sourceBinding,await captureBackendSourceBinding(repository));
 return {path,specSha256:bundle.specSha256,services:8,migrations:migration.count,signupOpened:false,productionReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help')console.log('Usage: --source-state ABSOLUTE_JSON --control-image NAME@DIGEST --cluster-id ID --release-id ID --public-url HTTPS_ORIGIN --listen-port LOOPBACK_PORT');
 else try{
  assert.equal(args.length,12);const map=new Map();for(let i=0;i<args.length;i+=2){assert(!map.has(args[i]));map.set(args[i],args[i+1]);}
  assert.deepEqual([...map.keys()].sort(),['--source-state','--control-image','--cluster-id','--release-id','--public-url','--listen-port'].sort());
  console.log(JSON.stringify(await buildBackendBundle({repository:fileURLToPath(new URL('../',import.meta.url)),sourceState:resolve(map.get('--source-state')),controlImage:map.get('--control-image'),clusterId:map.get('--cluster-id'),releaseId:map.get('--release-id'),publicUrl:map.get('--public-url'),listenPort:Number(map.get('--listen-port'))})));
 }catch{console.error('BACKEND_BUNDLE_FAILED');process.exitCode=1;}
}
