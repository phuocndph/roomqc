// Owned persistent control directory; never changes the source Supabase DB/config.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,open,unlink,chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,join } from 'node:path';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';

const root=fileURLToPath(new URL('../',import.meta.url));
const local=join(root,'.local','control'),stateFile=join(local,'state.local');
const args=process.argv.slice(2),command=args[0]||'preflight';
const sourceFlag=args.indexOf('--source');
const source=sourceFlag<0?root:resolve(args[sourceFlag+1]);
const composeFile=join(root,'docker-compose.control.local.yml');
const docker=(args,input)=>execFileSync('docker',args,{cwd:root,input,encoding:'utf8',timeout:180000,maxBuffer:4_000_000,stdio:['pipe','pipe','pipe']});
const compose=(args,input)=>docker(['compose','-f',composeFile,...args],input);
const key=()=>randomBytes(32).toString('hex');
async function state(){try{return JSON.parse(await readFile(stateFile,'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}}
async function save(value){await writeFile(stateFile+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await rename(stateFile+'.tmp',stateFile)}
function assertOwned(info){assert.equal(info.Config.Labels['roomqc.control-local'],'v3');assert.equal(info.Config.Labels['com.docker.compose.project'],'roomqc-control-local')}
function inspectService(service){
  // Does not depend on env files: prepare may have been interrupted before writing them.
  const id=docker(['ps','-a','--filter','label=com.docker.compose.project=roomqc-control-local',
    '--filter','label=roomqc.control-local=v3',
    '--filter',`label=com.docker.compose.service=${service}`,'--format','{{.ID}}']).trim();if(!id)return null;
  assert.match(id,/^[a-f0-9]{12,64}$/,'More than one matching service requires operator review');
  const info=JSON.parse(docker(['inspect',id]))[0];assertOwned(info);return info;
}
async function available(port){
  await new Promise((accept,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(accept))});
}
async function preflight(){
  docker(['info','--format','{{.ServerVersion}}']);
  const existing=await state();
  if(existing){assert.equal(existing.format,1);assert.equal(existing.owner,'roomqc-control-local');
    const db=inspectService('directory');
    if(db)assert.ok(db.Config.Env.includes('POSTGRES_PASSWORD='+existing.databasePassword),'Saved directory credential does not match its owned container');
    const api=inspectService('roomqc-control');
    if(api){assert.ok(api.Config.Env.includes('ROOMQC_CONTROL_EMAIL_HASH_KEY='+existing.emailHashKey),'Email hash key changed; restore the original key');
      if(api.State.Running)return {docker:true,port:8091,owned:true};}}
  if(!existing){
    const volumes=docker(['volume','ls','--filter','name=roomqc-control-local_directory-data','--format','{{.Name}}']).trim();
    const containers=docker(['ps','-a','--filter','label=com.docker.compose.project=roomqc-control-local','--format','{{.ID}}']).trim();
    assert.ok(!volumes && !containers,'Restore saved local control secrets before reusing an existing directory');
  }
  await available(8091);return {docker:true,port:8091,owned:false};
}
async function prepare(){
  if(await state())return;
  // Resolve local keys using the project's installed CLI, without printing its output.
  const npmCommand=process.platform==='win32'?'cmd.exe':'npx';
  const npmArgs=process.platform==='win32'?['/d','/s','/c','npx --no-install supabase status --output json']:['--no-install','supabase','status','--output','json'];
  const result=execFileSync(npmCommand,npmArgs,{cwd:source,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  const backend=JSON.parse(result.slice(result.indexOf('{')));
  const url=new URL(backend.API_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  const publicEnv=parseEnv(await readFile(join(source,'.env'),'utf8'));
  assert.ok(backend.ANON_KEY && backend.SERVICE_ROLE_KEY && publicEnv.VITE_VAPID_PUBLIC_KEY,'Local backend/VAPID configuration is required');
  const value={format:1,owner:'roomqc-control-local',createdAt:new Date().toISOString(),source,
    databasePassword:key(),runtimePassword:key(),workerPassword:key(),metricsPassword:key(),emailHashKey:key(),
    cluster:{id:'local-a',url:url.origin,internalUrl:`http://host.docker.internal:${url.port||'80'}`,publishableKey:backend.ANON_KEY,
      serviceKey:backend.SERVICE_ROLE_KEY,vapidPublicKey:publicEnv.VITE_VAPID_PUBLIC_KEY,maxWorkspaces:20}};
  await save(value);
}
async function configure(value){
  assert.equal(value.owner,'roomqc-control-local');
  const write=(name,env)=>writeFile(join(local,name),Object.entries(env).map(([k,v])=>{
    assert.ok(!/[\r\n]/.test(String(v)));return `${k}=${v}`;
  }).join('\n')+'\n',{mode:0o600});
  await write('db.env.local',{POSTGRES_DB:'roomqc_control',POSTGRES_PASSWORD:value.databasePassword});
  // No migration/superuser credentials enter the API container environment.
  await write('api.env.local',{NODE_ENV:'development',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_PUBLIC_URL:'http://127.0.0.1:8082',
    ROOMQC_CONTROL_HOST:'0.0.0.0',ROOMQC_CONTROL_PORT:8091,ROOMQC_CONTROL_SIGNUP_ENABLED:'false',ROOMQC_CONTROL_SUPPORT_CLUSTER_ID:value.cluster.id,
    ROOMQC_CONTROL_DATABASE_URL:`postgresql://roomqc_local_api:${value.runtimePassword}@directory:5432/roomqc_control`,
    ROOMQC_CONTROL_EMAIL_HASH_KEY:value.emailHashKey,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([value.cluster]),ROOMQC_CONTROL_POOL_MAX:5,ROOMQC_CONTROL_POOL_BUDGET:20});
}
async function migrate(value){
  const code=`import {ControlStore} from './store.mjs'; let text='';for await(const chunk of process.stdin)text+=chunk;
    const config=JSON.parse(text); const store=new ControlStore(config);try{console.log(JSON.stringify(await store.migrate()))}finally{await store.close()}`;
  compose(['run','--rm','-T','--no-deps','roomqc-control','node','--input-type=module','-e',code],JSON.stringify({
    databaseUrl:`postgresql://postgres:${value.databasePassword}@directory:5432/roomqc_control`,clusters:[value.cluster]}));
  const sql=['api','worker','metrics'].map(role=>{
    const name=`roomqc_local_${role}`,password=role==='api'?value.runtimePassword:value[role+'Password'];assert.match(password,/^[a-f0-9]{64}$/);
    return `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${name}') THEN CREATE ROLE ${name} LOGIN; END IF; END $$;
      ALTER ROLE ${name} PASSWORD '${password}'; GRANT roomqc_control_${role} TO ${name};`;
  }).join('\n');
  compose(['exec','-T','directory','psql','-U','postgres','-d','roomqc_control','-X','-q','-v','ON_ERROR_STOP=1'],sql);
}
async function verify(){
  const results={};
  for(const endpoint of ['livez','readyz','healthz']){
    const response=await fetch(`http://127.0.0.1:8091/api/control/${endpoint}`,{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');results[endpoint]=await response.json();
  }
  const closed=await fetch('http://127.0.0.1:8091/api/control/signup-intents',{method:'POST',headers:{Origin:'http://127.0.0.1:8082','Content-Type':'application/json'},body:'{}'});
  assert.equal(closed.status,503);assert.equal((await closed.json()).error,'SIGNUP_CLOSED');
  const api=inspectService('roomqc-control'),db=inspectService('directory');assert.ok(api.State.Running && db.State.Running);
  assert.equal(api.HostConfig.RestartPolicy.Name,'unless-stopped');assert.equal(db.HostConfig.RestartPolicy.Name,'unless-stopped');
  assert.ok(!api.Config.Env.some(line=>line.includes('MIGRATION_DATABASE_URL')||line.startsWith('POSTGRES_PASSWORD=')));
  assert.equal(db.HostConfig.PortBindings?.['5432/tcp'],undefined);
  assert.ok(db.Mounts.some(mount=>mount.Type==='volume'&&mount.Name==='roomqc-control-local_directory-data'&&mount.Destination==='/var/lib/postgresql/data'));
  return {...results,signup:'closed',database:'private-persistent',runtime:'least-privilege'};
}

async function restartCheck(){
  await verify(); // Never stop a directory until ownership and closed signup are established.
  inspectService('roomqc-control');inspectService('directory');
  const stateTables=[['schema_migrations','version'],['hosts','id'],['clusters','id'],['cluster_policies','cluster_id'],
    ['cluster_health_current','cluster_id'],['cluster_admission_current','cluster_id'],['control_commands','id'],
    ['provisioning_jobs','id'],['signup_affinities','email_hash'],['signup_affinity_conflicts','email_hash'],
    ['cluster_events','id'],['alerts','id'],['backup_runs','id'],['workspaces','id'],['attempts','id'],['support_actions','id']];
  const snapshotSql='SELECT md5(jsonb_build_object('+stateTables.map(([table,key])=>
    `'${table}',(SELECT jsonb_agg(t ORDER BY ${key}) FROM roomqc_control.${table} t)`).join(',')+')::text)';
  const snapshot=()=>compose(['exec','-T','directory','psql','-U','postgres','-d','roomqc_control','-X','-qAt','-c',snapshotSql]).trim();
  const before=snapshot();
  compose(['stop','directory']);
  try{
    const live=await fetch('http://127.0.0.1:8091/api/control/livez',{signal:AbortSignal.timeout(5000)});
    const ready=await fetch('http://127.0.0.1:8091/api/control/readyz',{signal:AbortSignal.timeout(5000)});
    assert.equal(live.status,200);assert.equal(ready.status,503);
  }finally{compose(['up','-d','--wait','directory'])}
  compose(['restart','roomqc-control']);
  let verified;
  for(let i=0;i<30;i++){
    try{verified=await verify();break}catch{await new Promise(resolve=>setTimeout(resolve,250))}
  }
  assert.ok(verified,'Control must recover after directory and API restart');assert.equal(snapshot(),before);
  return {restart:'passed',directoryData:'unchanged',verifiedTables:stateTables.length,dbDown:{livez:200,readyz:503},...verified};
}

if(!['preflight','prepare','up','verify','restart-check','stop'].includes(command))throw new Error('Use preflight, prepare, up, verify, restart-check or stop');
if(command==='preflight'){
  try{console.log(JSON.stringify(await preflight()))}catch(error){console.error(JSON.stringify({error:'CONTROL_PREFLIGHT_FAILED',code:error.code||'CHECK_DOCKER_AND_PORT'}));process.exitCode=1}
}else{
  await mkdir(local,{recursive:true,mode:0o700});
  if(process.platform==='win32'){
    const user=execFileSync('whoami',[],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    execFileSync('icacls',[local,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'ignore'});
  }else await chmod(local,0o700);
  // Do not break a lock based on age: inspect the recorded process first.
  const lockFile=join(local,'operation.lock.local');let lock;
  try{
    lock=await open(lockFile,'wx',0o600);await lock.writeFile(String(process.pid));
    if(command==='prepare'||command==='up'){
      await preflight();await prepare();const value=await state();await configure(value);
      if(command==='up'){
        compose(['build','roomqc-control']);compose(['up','-d','--wait','directory']);await migrate(value);
        compose(['up','-d','--wait','roomqc-control']);console.log(JSON.stringify(await verify()));
      }else console.log(JSON.stringify({prepared:true,signup:'closed',secrets:'local-only'}));
    }else if(command==='verify')console.log(JSON.stringify(await verify()));
    else if(command==='restart-check')console.log(JSON.stringify(await restartCheck()));
    else{assert.ok(await state());inspectService('roomqc-control');inspectService('directory');compose(['stop']);console.log(JSON.stringify({stopped:true,volume:'preserved'}))}
  }catch(error){
    console.error(JSON.stringify({error:'CONTROL_LOCAL_FAILED',code:error.code||'INSPECT_LOCAL_CONFIGURATION',
      message:error.code==='EEXIST'?'Operation lock exists; inspect its PID before removing it.':'See the runbook; credentials and subprocess diagnostics were redacted.'}));process.exitCode=1;
  }finally{if(lock){await lock.close();await unlink(lockFile)}}
}
