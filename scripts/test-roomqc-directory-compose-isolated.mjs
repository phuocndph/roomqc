// Executes the deployable directory template on new owned local resources only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {composePreflightEnvironment} from './control-backend-resource-preflight.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
import {migrationManifest} from '../server/control/migrate.mjs';

const repository=fileURLToPath(new URL('../',import.meta.url));
const emit=value=>console.log(JSON.stringify(value));
const owner='roomqc.directory-compose-test';
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceFiles=['deploy/control/directory.compose.yml','deploy/control/directory-client.compose.yml','deploy/control/directory/postgresql.conf','deploy/control/directory/pg_hba.conf',
  ...['health','alert','setup','summary'].map(name=>'deploy/control/directory-clients/'+name+'.compose.yml')];
const sources=async()=>Promise.all(sourceFiles.map(async path=>({path,sha256:sha(await readFile(join(repository,path)))})));

const probe=String.raw`
import assert from 'node:assert/strict';
import {readdir,access} from 'node:fs/promises';
import pg from 'pg';
import {migrateDirectory,migrationManifest} from './migrate.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input),checks=[];
const check=(name,result)=>{assert.ok(result,name);checks.push(name)};
check('client has only public CA files',JSON.stringify((await readdir('/run/roomqc-directory-ca')).sort())===JSON.stringify(['ca.crt','wrong-ca.crt']));
let noPrivate=false;try{await access('/run/roomqc-directory-private')}catch(e){noPrivate=e.code==='ENOENT'}
check('client cannot see database private volume',noPrivate);
check('no database credentials passed in client environment',!Object.keys(process.env).some(k=>/^(POSTGRES_|PGPASSWORD$|ROOMQC_CONTROL_.*DATABASE_URL$)/.test(k)));
const url=(user,password,{host='roomqc-directory',tls=true,ca='ca.crt'}={})=>{
  const u=new URL('postgresql://'+host+':5432/roomqc_control');u.username=user;u.password=password;
  u.searchParams.set('sslmode',tls?'verify-full':'disable');
  if(tls)u.searchParams.set('sslrootcert','/run/roomqc-directory-ca/'+ca);
  return u.href;
};
const pool=(user,password,options={})=>new pg.Pool({connectionString:url(user,password,options),max:1,connectionTimeoutMillis:3000,idleTimeoutMillis:1000});
const denied=async(options,expected)=>{
  const p=pool('roomqc_directory_api',value.runtimePassword,options);
  try{await p.query('SELECT 1');return false}catch(e){return expected.includes(e.code)}finally{await p.end()}
};
if(value.mode==='migrate'){
  const p=pool('postgres',value.adminPassword);
  try{
    const tls=await p.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
    check('admin uses verified TLS',tls.rows[0]?.ssl===true);
    const manifest=await migrationManifest();
    check('migration files match current public source',JSON.stringify(manifest.map(({version,checksum})=>({version,checksum})))===JSON.stringify(value.manifest));
    const migrated=await migrateDirectory(p);check('all directory migrations applied',migrated.applied.length===value.manifest.length);
    const replay=await migrateDirectory(p);check('migration replay applies no extra migration',replay.applied.length===0);
    assert.match(value.runtimePassword,/^[a-f0-9]{64}$/);
    await p.query("CREATE ROLE roomqc_directory_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3 PASSWORD '"+value.runtimePassword+"'; GRANT roomqc_control_api TO roomqc_directory_api; REVOKE ALL ON DATABASE roomqc_control FROM PUBLIC; GRANT CONNECT ON DATABASE roomqc_control TO roomqc_directory_api; REVOKE CREATE ON SCHEMA public FROM PUBLIC;");
  }finally{await p.end()}
}
const p=pool('roomqc_directory_api',value.runtimePassword);
try{
  const tls=await p.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');check('runtime uses verified TLS',tls.rows[0]?.ssl===true);
  const flags=await p.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname=current_user');
  check('runtime role is limited',Object.entries(flags.rows[0]).every(([k,v])=>k==='rolconnlimit'?v===3:v===false));
  check('runtime reads directory',Number((await p.query('SELECT count(*) AS n FROM roomqc_control.clusters')).rows[0].n)===0);
  check('runtime sees complete migration history',Number((await p.query('SELECT count(*) AS n FROM roomqc_control.schema_migrations')).rows[0].n)===value.manifest.length);
  for(const [name,sql]of [['runtime cannot read password hashes','SELECT rolpassword FROM pg_authid'],['runtime cannot create directory tables','CREATE TABLE roomqc_control.forbidden_test(id int)'],['runtime cannot alter administrator','ALTER ROLE postgres CREATEDB']]){
    let denied=false;try{await p.query(sql)}catch(e){denied=e.code==='42501'}check(name,denied);
  }
}finally{await p.end()}
check('same server wrong hostname rejected',await denied({host:'wrong-directory'},['ERR_TLS_CERT_ALTNAME_INVALID']));
check('wrong CA rejected',await denied({ca:'wrong-ca.crt'},['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']));
check('valid password over plaintext rejected',await denied({tls:false},['28000']));
console.log(JSON.stringify({verified:true,checks,migrations:value.manifest.length,mode:value.mode}));
`;

const workerProbe=String.raw`
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {healthDatabaseUrl} from 'file:///app/workers/health-config.mjs';
import {createHealthPool} from 'file:///app/workers/health-runtime.mjs';
import {loadRuntimeResourceContext} from 'file:///app/resource-runtime.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input),checks=[];
const check=(name,result)=>{assert.ok(result,name);checks.push(name)};
for(const source of value.workerSources){
  const bytes=await readFile('/app/'+source.path);
  check('installed worker source matches '+source.path,createHash('sha256').update(bytes).digest('hex')===source.sha256);
}
const u=new URL('postgresql://'+(value.host??'roomqc-directory')+':5432/roomqc_control');
u.username='roomqc_directory_api';u.password=value.runtimePassword;u.searchParams.set('sslmode',value.plaintext?'disable':'verify-full');
if(!value.plaintext)healthDatabaseUrl(u.href,{production:true});
assert.throws(()=>healthDatabaseUrl(u.href+'&sslrootcert=/arbitrary.pem',{production:true}),{code:'INVALID_HEALTH_CONFIG'});
check('strict worker URL options remain enforced',true);
const resourceContext=loadRuntimeResourceContext({NODE_ENV:'production',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json'},{kind:'directory'});
const p=createHealthPool({databaseUrl:u.href,poolMax:2,production:true,schemaVersion:2,resourceContext,
  connectionBudget:{maxConnections:100,reservedConnections:5,apiInstances:1,apiPoolMax:5,reconcileInstances:0,reconcilePoolMax:2,
    healthInstances:1,healthPoolMax:2,exporterConnections:1,migrationConnections:1,probeInstances:1,probePoolMax:1}});
try{
  let error;
  try{
    const r=await p.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
    check('actual health pool uses TLS through public extra CA',r.rows[0]?.ssl===true);
  }catch(e){error=e.code}
  if(value.expectedErrors)check(value.name+' rejected',value.expectedErrors.includes(error));
  else check('trusted health pool connects',error===undefined);
}finally{await p.end()}
console.log(JSON.stringify({verified:true,checks,name:value.name,poolFunction:'createHealthPool',workerRuntimeStarted:false}));
`;

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==1||args[0]!=='--run'){
    console.log('Usage: node scripts/test-roomqc-directory-compose-isolated.mjs --run\nUses preinstalled pinned images, new isolated resources and ephemeral test credentials. No VPS, serving database, email or customer access.');
    if(args.length&&args[0]!=='--help')process.exitCode=64;return;
  }
  await mkdir(join(repository,'.local'),{recursive:true});
  const run=randomBytes(6).toString('hex'),project='roomqc-directory-check-'+run;
  const root=await mkdtemp(join(repository,'.local',project+'-'));
  const env=composePreflightEnvironment();
  let command=0;
  const privateRun=async(args,{input,timeout=30000,cwd=repository}={})=>{
    const result=await new Promise((accept,reject)=>{
      const child=spawn('docker',args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
      const out=[],err=[];let bytes=0,timedOut=false,overflow=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill()},timeout);timer.unref();
      const collect=(target,data)=>{bytes+=data.length;if(bytes>8*1024*1024){overflow=true;child.kill()}else target.push(data)};
      child.stdout.on('data',b=>collect(out,b));child.stderr.on('data',b=>collect(err,b));
      child.on('error',e=>{clearTimeout(timer);reject(e)});
      child.on('close',(code,signal)=>{clearTimeout(timer);accept({code,signal,timedOut,overflow,stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()})});
      child.stdin.end(input);
    });
    await writeFile(join(root,'command-'+(++command)+'.log'),result.stdout+'\n'+result.stderr,{mode:0o600});
    assert.equal(result.code,0,'DIRECTORY_COMPOSE_COMMAND_FAILED');assert.equal(result.signal,null);assert.equal(result.timedOut,false);assert.equal(result.overflow,false);
    return result.stdout;
  };
  if(process.platform==='win32'){
    const identity=await new Promise((accept,reject)=>{
      const c=spawn('whoami',['/user','/fo','csv','/nh'],{windowsHide:true});let s='';c.stdout.on('data',b=>s+=b);c.on('error',reject);c.on('close',n=>n===0?accept(s):reject(Error('IDENTITY_FAILED')));
    });
    const sid=identity.match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid);
    await new Promise((accept,reject)=>{
      const c=spawn('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});c.on('error',reject);c.on('close',n=>n===0?accept():reject(Error('PRIVATE_DIRECTORY_FAILED')));
    });
  }
  const binding=await captureBackendSourceBinding(repository),initialSources=await sources();
  const manifest=(await migrationManifest()).map(({version,checksum})=>({version,checksum}));
  const workerSources=await Promise.all(['workers/health-runtime.mjs','workers/health-config.mjs','resource-runtime.mjs','resource-budget.mjs'].map(async path=>
    ({path,sha256:sha(await readFile(join(repository,'server/control',path)))})));
  const workerBudget=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));workerBudget.environment='production';
  const workerBudgetFile=join(root,'worker-budget.json');await writeFile(workerBudgetFile,JSON.stringify(workerBudget));
  const loginBudget=structuredClone(workerBudget);loginBudget.databases[0].maxConnections=32;
  loginBudget.databases[0].consumers.find(c=>c.id==='provisioning-worker').replicas=1;
  loginBudget.databases[0].consumers.find(c=>c.id==='deployment-executor').replicas=1;
  loginBudget.databases[0].consumers.push({id:'summary-credential-rotation',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  const loginBudgetFile=join(root,'runtime-budget.json');await writeFile(loginBudgetFile,JSON.stringify(loginBudget));
  const loginFiles=['directory-runtime-plan.mjs','directory-runtime-logins.mjs','directory-runtime-logins-cli.mjs','directory-runtime-wiring.mjs',
    'directory-runtime-wiring-cli.mjs','deployment-runtime.mjs','deployment-journal.mjs','resource-runtime.mjs','config.mjs','server.mjs'];
  const loginSources=await Promise.all(loginFiles.map(async path=>({path,sha256:sha(await readFile(join(repository,'server/control',path)))})));
  const loginProbe=await readFile(join(repository,'scripts/lib/directory-logins-probe.mjs'),'utf8');
  const summaryTemplate=JSON.parse(await readFile(join(repository,'deploy/monitoring/summary-installer.template.json'),'utf8'));
  const evidence=JSON.parse(await readFile(join(repository,'artifacts/roomqc-full-and-rebuild-2026-10-30.json'),'utf8'));
  const packet=JSON.parse(await readFile(join(repository,'artifacts/roomqc-backend-named-image-packet-2026-10-30.json'),'utf8'));
  assert.equal(evidence.fullRun,packet.fullRun);assert.equal(evidence.sourceSha256,packet.backendSourceSha256);assert.equal(evidence.fullExitCode,0);assert.equal(evidence.rebuildExitCode,0);
  const helper=packet.images.find(i=>i.service==='realtime').imageId;
  const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
  const control=process.env.ROOMQC_DIRECTORY_TEST_CONTROL_IMAGE??'roomqc/control@sha256:897b0043af93fa24f04860e41d5be0c2ed48f5bf359858b356ef3d81b4fb5cc3';
  assert.match(control,/^(?:sha256:[a-f0-9]{64}|[a-z0-9/_.-]+@sha256:[a-f0-9]{64})$/,'isolated test requires an immutable image reference');
  for(const ref of [image,helper,control])await privateRun(['image','inspect',ref]);
  const label=owner+'='+run,names={data:project+'-data',private:project+'-private',ca:project+'-ca',network:project+'-network'};
  const result={kind:'roomqc-directory-compose-isolated',run,root,startedAt:new Date().toISOString(),sources:initialSources,backendSourceSha256:binding.sha256,
    databaseImage:image,controlImage:control,syntheticResourceAllocation:true,vpsUsed:false,servingDataChanged:false,signupOpened:false,capacityProven:false,verified:false,cleaned:false};
  const stateFile=join(root,'result.json'),save=()=>writeFile(stateFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  emit({event:'directory_compose_started',run,stateFile});
  let failed=false;
  try{
    for(const name of [names.data,names.private,names.ca])await privateRun(['volume','create','--label',label,name]);
    await privateRun(['network','create','--internal','--label',label,names.network]);
    const network=JSON.parse(await privateRun(['network','inspect',names.network]))[0];assert.equal(network.Internal,true);
    const adminPassword=randomBytes(32).toString('hex'),runtimePassword=randomBytes(32).toString('hex');
    const certScript=String.raw`set -eu
read -r adminPassword
umask 077
cd /work
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj /CN=RoomQC-Owned-Directory-Fixture-CA
openssl req -x509 -newkey rsa:2048 -nodes -keyout wrong-ca.key -out wrong-ca.crt -days 2 -subj /CN=RoomQC-Wrong-Directory-Fixture-CA
openssl req -newkey rsa:2048 -nodes -keyout /private/server.key -out server.csr -subj /CN=roomqc-directory
printf 'subjectAltName=DNS:roomqc-directory\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out /private/server.crt -days 2 -extfile server.ext
printf '%s' "$adminPassword" > /private/admin-password
cp ca.crt wrong-ca.crt /public/
chown -R 70:70 /private /data
chmod 0700 /private /data
chmod 0600 /private/server.key /private/admin-password
chmod 0444 /private/server.crt /public/*.crt
chmod 0755 /public
`;
    await privateRun(['run','--rm','-i','--name',project+'-prepare','--label',label,'--network','none','--user','0:0','--read-only',
      '--cap-drop','ALL','--cap-add','CHOWN','--cap-add','FOWNER','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges',
      '--tmpfs','/work:rw,nosuid,noexec,size=8m','--mount','type=volume,source='+names.data+',target=/data',
      '--mount','type=volume,source='+names.private+',target=/private','--mount','type=volume,source='+names.ca+',target=/public',
      '--entrypoint','sh',helper,'-c',certScript],{input:adminPassword+'\n',timeout:60000});
    const envFile=join(root,'compose.env'),override=join(root,'owned.compose.json');
    await writeFile(envFile,Object.entries({ROOMQC_DEPLOYMENT_ID:project,ROOMQC_DIRECTORY_NETWORK:names.network,ROOMQC_DIRECTORY_DATA_VOLUME:names.data,
      ROOMQC_DIRECTORY_PRIVATE_VOLUME:names.private,ROOMQC_DIRECTORY_MAX_CONNECTIONS:'32',ROOMQC_DIRECTORY_SHARED_BUFFERS:'64MB',
      ROOMQC_DIRECTORY_MEMORY_LIMIT:'512m',ROOMQC_DIRECTORY_CPU_LIMIT:'1',ROOMQC_DIRECTORY_SHM_SIZE:'64m'}).map(([k,v])=>k+'='+v).join('\n')+'\n');
    await writeFile(override,JSON.stringify({services:{'roomqc-directory':{labels:{[owner]:run},networks:{directory:{aliases:['wrong-directory']}}}}}));
    const compose=['compose','--project-name',project,'--project-directory',join(repository,'deploy/control'),'--env-file',envFile,
      '-f',join(repository,'deploy/control/directory.compose.yml'),'-f',override];
    const resolved=JSON.parse(await privateRun([...compose,'config','--format','json']));
    const configured=resolved.services['roomqc-directory'];assert.equal(configured.image,image);assert.equal(configured.user,'70:70');
    assert.equal(configured.ports,undefined);assert.equal(configured.read_only,true);assert.deepEqual(configured.cap_drop,['ALL']);
    assert.ok(configured.volumes.filter(v=>v.type==='bind').every(v=>v.read_only===true&&v.bind.create_host_path===false));
    await privateRun([...compose,'up','--detach','--no-build','--pull','never','--no-deps','--wait','--wait-timeout','60','roomqc-directory'],{timeout:90000});
    emit({event:'directory_compose_tls_started',run});
    const invoke=async(mode,worker)=>{
      const logins=mode==='runtime-logins',source='globalThis.__roomqcProbe = true;\n'+(logins?loginProbe:worker?workerProbe:probe);
      // Code and ephemeral credentials go over stdin, never command args or env.
      const launcher="let text='';for await(const c of process.stdin)text+=c;const v=JSON.parse(text);process.stdin[Symbol.asyncIterator]=async function*(){yield JSON.stringify(v.input)};await import('data:text/javascript;base64,'+Buffer.from(v.source).toString('base64'));";
      // data: imports cannot resolve pg relative to /app; anchor imports explicitly.
      const anchored=source.replace("from 'pg'","from 'file:///app/node_modules/pg/lib/index.js'").replace("from './migrate.mjs'","from 'file:///app/migrate.mjs'")+'\n//# sourceURL=roomqc-directory-probe.mjs';
      const output=await privateRun(['run','--rm','-i','--name',project+'-client','--label',label,'--network',names.network,'--read-only',
        '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','192m','--cpus','1','--pids-limit','64','--workdir','/app',
        ...(logins?['--env','NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/ca.crt',
          '--tmpfs','/run/roomqc-operator:rw,nosuid,noexec,mode=0700,uid=1000,gid=1000,size=4m',
          '--mount','type=bind,source='+loginBudgetFile+',target=/etc/roomqc/runtime-budget.json,readonly',
          ...loginFiles.flatMap(path=>['--mount','type=bind,source='+join(repository,'server/control',path)+',target=/app/'+path+',readonly'])]:[]),
        ...(worker?['--env','NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/'+(worker.caFile??'ca.crt'),
          '--mount','type=bind,source='+workerBudgetFile+',target=/etc/roomqc/resource-budget.json,readonly']:[]),
        '--mount','type=volume,source='+names.ca+',target=/run/roomqc-directory-ca,readonly','--entrypoint','node',control,'--input-type=module','-e',launcher],
        {input:JSON.stringify({source:anchored,input:{mode,manifest,runtimePassword,...(worker?{workerSources,...worker}:{}),
          ...(logins?{sources:loginSources,summaryTemplate}:{}),...(['migrate','runtime-logins'].includes(mode)?{adminPassword}:{})}}),timeout:90000});
      return JSON.parse(output.trim());
    };
    result.initial=await invoke('migrate');assert.equal(result.initial.verified,true);await save();
    result.workerTls=[];
    for(const worker of [{name:'trusted'},
      {name:'wrong-hostname',host:'wrong-directory',expectedErrors:['ERR_TLS_CERT_ALTNAME_INVALID']},
      {name:'wrong-ca',caFile:'wrong-ca.crt',expectedErrors:['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']},
      {name:'plaintext',plaintext:true,expectedErrors:['28000']}]){
      result.workerTls.push(await invoke('worker-tls',worker));await save();
    }
    await privateRun([...compose,'restart','--timeout','30','roomqc-directory'],{timeout:60000});
    // Wait on the owned service's health, not a fixed sleep.
    await privateRun([...compose,'up','--detach','--no-build','--pull','never','--wait','--wait-timeout','60','roomqc-directory'],{timeout:90000});
    result.afterRestart=await invoke('verify');assert.equal(result.afterRestart.verified,true);
    result.runtimeLogins=await invoke('runtime-logins');assert.equal(result.runtimeLogins.verified,true);await save();
    const id=(await privateRun([...compose,'ps','-q','roomqc-directory'])).trim(),info=JSON.parse(await privateRun(['inspect',id]))[0];
    assert.equal(info.Config.Labels[owner],run);assert.deepEqual(info.HostConfig.PortBindings,{});assert.equal(info.Config.User,'70:70');
    assert.equal(info.HostConfig.ReadonlyRootfs,true);assert.equal(info.HostConfig.Memory,512*1024*1024);assert.equal(info.HostConfig.MemorySwap,info.HostConfig.Memory);
    assert.equal(info.HostConfig.NanoCpus,1e9);assert.equal(info.HostConfig.PidsLimit,128);
    assert.equal(info.Mounts.some(m=>m.Type==='volume'&&![names.data,names.private].includes(m.Name)),false);
    result.containerHardeningVerified=true;result.caPrivateKeyNotInRuntime=true;result.publicPorts=0;
    assert.deepEqual(await sources(),initialSources);assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));
    result.sourceBindingUnchanged=true;result.verified=true;await save();
  }catch(error){failed=true;result.verified=false;result.failedCommand=command;result.failureCode='DIRECTORY_COMPOSE_VERIFICATION_FAILED';await save();emit({event:'directory_compose_failed',run,code:result.failureCode,command});}
  finally{
    try{
      for(const kind of ['container','network','volume']){
        const ids=(await privateRun([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter','label='+label])).trim().split(/\s+/).filter(Boolean);
        for(const id of ids){
          const obj=JSON.parse(await privateRun([kind,'inspect',id]))[0];
          assert.equal((kind==='container'?obj.Config.Labels:obj.Labels)?.[owner],run);
          await privateRun([kind,'rm',...(kind==='container'?['--force']:[]),id],{timeout:60000});
        }
      }
      result.independentCleanup={includesStoppedContainers:true};
      for(const kind of ['container','network','volume']){
        assert.equal((await privateRun([kind,'ls',...(kind==='container'?['--all']:[]),'-q','--filter','label='+label])).trim(),'');result.independentCleanup[kind]=0;
      }
      result.cleaned=true;
    }catch{result.cleanupFailed=true;failed=true}
    result.finishedAt=new Date().toISOString();await save();
  }
  emit({event:'directory_compose_terminal',run,verified:result.verified,cleaned:result.cleaned,stateFile});
  if(failed)process.exitCode=1;
}
main().catch(()=>{emit({event:'directory_compose_setup_failed',code:'DIRECTORY_COMPOSE_SETUP_FAILED'});process.exitCode=1});
