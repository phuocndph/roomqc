import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import pg from 'pg';
import {attestResourceDatabases,resourceDatabaseConnection,readResourceDatabaseTarget} from './resource-database.mjs';
import {attestResourceConsumerTargets} from './resource-consumer-targets.mjs';
import {resourceTargetFixture} from './testing/resource-target-fixtures.mjs';
import {startControl} from './server.mjs';
import {fixtureConfig} from './test-fixtures.mjs';
import {loadRuntimeResourceContext,runtimeResourceView} from './resource-runtime.mjs';
import {createResourcePoolSampler} from './resource-pool-observation.mjs';
import {resourcePoolCheckMain} from '../../scripts/control-backend-resource-pool-check.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const run=process.env.ROOMQC_CONTROL_DB_TEST_RUN??randomBytes(6).toString('hex');
if(!/^[a-f0-9]{12}$/.test(run))throw new Error('Invalid owned resource database test run');
const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const password=randomBytes(32).toString('hex'),attestor='resource_attestor_'+run,servers=[],created=[],volumes=[],pools=[];
const appRoles=Object.fromEntries(['api','auth','rest','alert'].map(key=>[key,'target_'+key+'_'+run]));
const appProjects=[];
let root,example;
const sha=v=>createHash('sha256').update(v).digest('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1000000,windowsHide:true,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});
const connectConfig=(server,database,user='postgres')=>({host:'127.0.0.1',port:server.port,database,user,password,ssl:false,max:1,
  options:'-c search_path=pg_catalog -c timezone=UTC -c datestyle=ISO,YMD',replication:'false',sslnegotiation:'postgres',client_encoding:'UTF8',connectionTimeoutMillis:3000,query_timeout:4000});
async function ready(server){
  for(let i=0;i<80;i++){
    const c=new pg.Client(connectConfig(server,'postgres'));
    try{await c.connect();await c.query('SELECT 1');return} catch{} finally{await c.end()}
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Owned resource database readiness failed (details redacted)');
}
async function freePort(){
  const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
  const port=socket.address().port;await new Promise((resolve,reject)=>socket.close(err=>err?reject(err):resolve()));return port;
}
before(async()=>{
  if(!enabled)return;
  root=await mkdtemp(join(tmpdir(),'roomqc-resource-database-'+run+'-'));
  example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  for(let i=0;i<2;i++){
    const container='roomqc-resource-db-'+run+'-'+i,volume=container+'-data',port=await freePort();
    docker(['volume','create','--label','roomqc.resource-database-test='+run,volume]);volumes.push(volume);
    docker(['run','-d','--name',container,'--label','roomqc.resource-database-test='+run,'--env','POSTGRES_PASSWORD',
      '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data','-p','127.0.0.1:'+port+':5432',image]);created.push(container);
    const info=JSON.parse(docker(['inspect',container]))[0],server={container,port:Number(info.NetworkSettings.Ports['5432/tcp'][0].HostPort)};
    servers.push(server);await ready(server);
    const admin=new pg.Pool(connectConfig(server,'postgres'));admin.on('error',()=>{});pools.push(admin);server.admin=admin;
    await admin.query(`CREATE ROLE ${attestor} LOGIN CONNECTION LIMIT 1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${attestor}`);
    for(const role of Object.values(appRoles))await admin.query(`CREATE ROLE ${role} LOGIN CONNECTION LIMIT 20 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    server.dbAdmins=new Map();
    for(const name of ['resource_directory','resource_business']){
      await admin.query('CREATE DATABASE '+name);
      const p=new pg.Pool(connectConfig(server,name));p.on('error',()=>{});pools.push(p);
      server.dbAdmins.set(name,p);
      await p.query('REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM PUBLIC');
      await p.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${attestor}`);
      for(const role of Object.values(appRoles))await p.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${role}`);
      await p.query('CREATE TABLE public.resource_fixture_marker(id integer PRIMARY KEY, value text)');
      await p.query("INSERT INTO public.resource_fixture_marker VALUES(1,'unchanged owned marker')");
    }
  }
});
after(async()=>{
  for(const project of appProjects){
    const containers=docker(['container','ls','-a','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);
    for(const id of containers){const info=JSON.parse(docker(['inspect',id]))[0];assert.equal(info.Config.Labels['com.docker.compose.project'],project);docker(['rm','-f',id])}
    const networks=docker(['network','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);
    for(const id of networks){const info=JSON.parse(docker(['network','inspect',id]))[0];assert.equal(info.Labels['com.docker.compose.project'],project);docker(['network','rm',id])}
  }
  await Promise.allSettled(pools.map(p=>p.end()));
  for(const container of created){const info=JSON.parse(docker(['inspect',container]))[0];
    assert.equal(info.Config.Labels['roomqc.resource-database-test'],run);docker(['rm','-f',container]);}
  for(const volume of volumes){const info=JSON.parse(docker(['volume','inspect',volume]))[0];
    assert.equal(info.Labels['roomqc.resource-database-test'],run);docker(['volume','rm',volume]);}
  for(const kind of ['container','volume','network']){
    const output=docker([kind,'ls',...(kind==='container'?['-a']:[]),'--filter','label=roomqc.resource-database-test='+run,'--format','{{.ID}}']);
    assert.equal(output.trim(),'');
  }
  if(root){
    assert.equal(resolve(dirname(root)),resolve(tmpdir()));
    assert(basename(root).startsWith('roomqc-resource-database-'+run+'-'));
    await rm(root,{recursive:true,force:true});
  }
});
const dbtest=(title,fn)=>test(title,{skip:!enabled},fn);
let sequence=0;
async function consumerFixture({independent=false}={}){
  const folder=join(root,'consumer-'+(++sequence));await mkdir(folder);
  const endpoints=[];
  for(let i=0;i<2;i++){
    const server=servers[independent?i:0],databaseName=i===0?'resource_directory':'resource_business';
    const identity=(await server.admin.query(`SELECT c.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid"
      FROM pg_catalog.pg_control_system() c JOIN pg_catalog.pg_database d ON d.datname=$1`,[databaseName])).rows[0];
    endpoints.push({...identity,databaseName,port:server.port});
  }
  return resourceTargetFixture(folder,{password,attestor,endpoints,roles:appRoles});
}
async function controlFixture(){
  const f=await consumerFixture(),config=fixtureConfig(f.uri(appRoles.api,0));
  const context=loadRuntimeResourceContext({ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:f.budgetFile},{kind:'directory'});
  Object.assign(config,{resourceContext:context,resourceBudget:context.budget,poolMax:5,poolBudget:20,apiInstances:1,port:0,shutdownTimeoutMs:1000});
  return {...f,config};
}

dbtest('real Control application exposes opt-in samples of its actual pool on a separate private listener',async()=>{
 const f=await controlFixture(),runtime=await startControl(f.config,{poolObservations:true,poolStatusPort:0});
 const uri='http://127.0.0.1:'+runtime.poolStatus.server.address().port+'/resource-targets';
 try{
  const response=await fetch(uri);assert.equal(response.status,200);const sample=await response.json();
  assert.equal(sample.bindings.length,1);assert.equal(sample.bindings[0].consumerId,'control-api');
  const ref=await attestResourceDatabases(f.databaseManifest);assert.equal(sample.bindings[0].databaseIdentitySha256,ref.targets[0].databaseIdentitySha256);
  assert.equal((await fetch('http://127.0.0.1:'+runtime.server.address().port+'/api/control/resource-targets')).status,404);
  f.config.databaseUrl=f.uri(appRoles.api,0).replace(':'+servers[0].port+'/',':'+servers[1].port+'/');
  const later=await(await fetch(uri)).json();assert.equal(later.bindings[0].databaseIdentitySha256,sample.bindings[0].databaseIdentitySha256);
  assert.doesNotMatch(JSON.stringify(later),new RegExp(password+'|resource_directory|'+appRoles.api));
 }finally{await runtime.shutdown()}
 assert.equal(runtime.poolStatus.server.listening,false);assert.equal(runtime.store.pool.ended,true);
});

dbtest('real application pool saturation times out without unbounded queued samples and recovers when a slot returns',async()=>{
 const f=await controlFixture(),runtime=await startControl(f.config),clients=[];
 const sampler=createResourcePoolSampler({resources:runtimeResourceView(f.config,'control-api'),budget:f.config.resourceBudget,
  pools:[{consumerId:'control-api',getPool:()=>runtime.store.pool}],timeoutMs:100});
 try{
  for(let i=0;i<5;i++)clients.push(await runtime.store.pool.connect());
  await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});
  await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_BUSY'});assert.equal(runtime.store.pool.waitingCount,1);
  clients.pop().release();for(let i=0;i<30&&runtime.store.pool.waitingCount;i++)await new Promise(r=>setTimeout(r,10));
  await new Promise(r=>setTimeout(r,20));assert.equal(runtime.store.pool.waitingCount,0);
  for(const c of clients.splice(0))c.release();assert.equal((await sampler.sample()).bindings.length,1);
 }finally{for(const c of clients)c.release();await sampler.stop();await runtime.shutdown()}
});

dbtest('catalog privilege revoked from a real loaded pool fails safely and recovers without pool credential fallback',async()=>{
 const f=await controlFixture(),runtime=await startControl(f.config,{poolObservations:true,poolStatusPort:0}),admin=servers[0].dbAdmins.get('resource_directory');
 const uri='http://127.0.0.1:'+runtime.poolStatus.server.address().port+'/resource-targets';
 try{
  await admin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${appRoles.api}`);
  const denied=await fetch(uri);assert.equal(denied.status,503);assert.deepEqual(await denied.json(),{code:'RESOURCE_POOL_UNAVAILABLE'});
  await admin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${appRoles.api}`);
  assert.equal((await fetch(uri)).status,200);
 }finally{await admin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${appRoles.api}`);await runtime.shutdown()}
});

test('actual Control image/container and CLI sample its loaded pool in the application namespace and reject wrong live targets',
 {skip:!enabled||process.env.ROOMQC_CONTROL_POOL_CONTAINER_TEST!=='true'},async()=>{
 const f=await consumerFixture(),buildRoot=join(root,'build');await mkdir(join(buildRoot,'server/control'),{recursive:true});
 await cp('server/control',join(buildRoot,'server/control'),{recursive:true,filter:source=>!source.split(/[\\/]/).includes('node_modules')});
 await mkdir(join(buildRoot,'supabase'),{recursive:true});
 await cp('supabase/migrations',join(buildRoot,'supabase/migrations'),{recursive:true});
 const iid=join(root,'image.id');
 execFileSync('docker',['build','--file',join(buildRoot,'server/control/Dockerfile'),'--iidfile',iid,buildRoot],{
  encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:2000000,stdio:['ignore','pipe','pipe']});
 const imageId=(await readFile(iid,'utf8')).trim();assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
 const project='roomqc-pool-'+run;appProjects.push(project);
 const service=structuredClone(f.api);service.image=imageId;service.user='1000:1000';service.read_only=true;service.cap_drop=['ALL'];service.security_opt=['no-new-privileges:true'];
 service.networks={default:{}};
 Object.assign(service.environment,{NODE_ENV:'development',ROOMQC_RESOURCE_POOL_OBSERVATIONS:'true',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_HOST:'127.0.0.1',
  ROOMQC_CONTROL_DATABASE_URL:f.uri(appRoles.api,0).replace('@127.0.0.1:','@host.docker.internal:'),ROOMQC_CONTROL_EMAIL_HASH_KEY:'owned-fixture-key-'.repeat(3),
  ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'fixture-cluster',url:'http://127.0.0.1:54321',publishableKey:'fixture-public',serviceKey:'fixture-private',vapidPublicKey:'fixture-vapid',maxWorkspaces:10}])});
 const compose=await f.put('pool.compose.json',{name:project,services:{api:service},networks:{default:{name:project+'-default'}}});
 const native={schemaVersion:1,environment:'local',budgetFile:f.budgetFile,budgetSha256:f.consumerManifest.budgetSha256,
  projects:[{id:project,files:[compose],envFiles:[],profiles:[],services:[{name:'api',adapter:'control-api',databaseId:f.budget.databases[0].id,image:imageId}]}]};
 const manifest={schemaVersion:1,nativeManifest:native,databaseManifest:f.databaseManifest,
  bindings:[{project,service:'api',databaseId:f.budget.databases[0].id,consumerId:'control-api',role:appRoles.api}]};
 const file=await f.put('pool-target-manifest.json',manifest),args=['compose','--project-name',project,'--file',compose];
 docker([...args,'up','--detach','--no-build','--pull','never']);
 let output='',exit;const invoke=async()=>{output='';exit=await resourcePoolCheckMain(['--manifest',file],{output:{write:s=>output+=s}});return JSON.parse(output)};
 let report;for(let i=0;i<30;i++){report=await invoke();if(exit===0)break;await new Promise(r=>setTimeout(r,200))}
 assert.equal(exit,0,output);assert.equal(report.loadedPoolSamplesVerified,true);assert.equal(report.bindings.length,1);
 assert.equal(report.sampleExecutedInApplicationProcess,true);assert.equal(report.runtimeVerified,false);assert.equal(report.fullyCovered,false);
 const originalIdentity=report.bindings[0].databaseIdentitySha256;
 // A restart with the same budget but a different physical DB must fail.
 service.environment.ROOMQC_CONTROL_DATABASE_URL=service.environment.ROOMQC_CONTROL_DATABASE_URL.replace(':'+servers[0].port+'/',':'+servers[1].port+'/');
 await f.put('pool.compose.json',{name:project,services:{api:service},networks:{default:{name:project+'-default'}}});docker([...args,'up','--detach','--no-build','--pull','never','--force-recreate']);
 for(let i=0;i<30;i++){report=await invoke();if(report.code==='RESOURCE_POOL_TARGET_MISMATCH')break;await new Promise(r=>setTimeout(r,200))}
 assert.equal(exit,1);assert.equal(report.code,'RESOURCE_POOL_TARGET_MISMATCH');
 service.environment.ROOMQC_CONTROL_DATABASE_URL=service.environment.ROOMQC_CONTROL_DATABASE_URL.replace(':'+servers[1].port+'/',':'+servers[0].port+'/');
 await f.put('pool.compose.json',{name:project,services:{api:service},networks:{default:{name:project+'-default'}}});docker([...args,'up','--detach','--no-build','--pull','never','--force-recreate']);
 for(let i=0;i<30;i++){report=await invoke();if(exit===0)break;await new Promise(r=>setTimeout(r,200))}
 assert.equal(exit,0,output);assert.equal(report.bindings[0].databaseIdentitySha256,originalIdentity);
 const ids=docker(['container','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']).trim().split(/\r?\n/);
 assert.equal(ids.length,1);const actual=JSON.parse(docker(['inspect',ids[0]]))[0];assert.equal(actual.Config.User,'1000:1000');assert.equal(actual.HostConfig.ReadonlyRootfs,true);
 assert.equal(Object.keys(actual.NetworkSettings.Ports??{}).filter(k=>actual.NetworkSettings.Ports[k]!==null).length,0);
 assert.doesNotMatch(output,new RegExp(password+'|'+appRoles.api+'|resource_directory|postgresql'));
});
async function fixture({independent=false}={}){
  const raw=structuredClone(example);raw.environment='local';
  for(const db of raw.databases)db.consumers.push({id:'resource-attestor',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  const tag=String(++sequence),budgetFile=join(root,tag+'-budget.json');
  await writeFile(budgetFile,JSON.stringify(raw));
  const manifest={schemaVersion:1,environment:'local',budgetFile,budgetSha256:sha(await readFile(budgetFile)),databases:[]};
  for(let i=0;i<2;i++){
    const server=servers[independent?i:0],name=i===0?'resource_directory':'resource_business';
    const identity=(await server.admin.query(`SELECT c.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid"
      FROM pg_catalog.pg_control_system() c JOIN pg_catalog.pg_database d ON d.datname=$1`,[name])).rows[0];
    const dsnFile=join(root,tag+'-'+i+'.dsn');
    await writeFile(dsnFile,`postgresql://${attestor}:${password}@127.0.0.1:${server.port}/${name}?sslmode=disable`,{mode:0o600});
    manifest.databases.push({databaseId:raw.databases[i].id,dsnFile,expected:{...identity,databaseName:name,role:attestor}});
  }
  const rebind=async()=>{await writeFile(budgetFile,JSON.stringify(raw));manifest.budgetSha256=sha(await readFile(budgetFile))};
  return {manifest,raw,rebind};
}

dbtest('configured consumer targets query real native/vendor LOGINs and a secret worker, preserving markers and closing every session',async()=>{
  const f=await consumerFixture(),r=await attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject});
  assert.equal(r.allConfiguredTargetsVerified,true);assert.equal(r.bindings.length,4);assert.equal(r.servers.length,1);
  assert.equal(r.runtimeVerified,false);assert.equal(r.databaseIdentityVerified,false);assert.equal(r.capacityProven,false);
  assert.doesNotMatch(JSON.stringify(r),new RegExp(password+'|'+attestor+'|postgresql|resource_directory|resource_business'));
  for(const name of ['resource_directory','resource_business']){
    const p=servers[0].dbAdmins.get(name);assert.equal((await p.query('SELECT value FROM public.resource_fixture_marker')).rows[0].value,'unchanged owned marker');
    assert.equal((await p.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='roomqc-resource-attestor'")).rows[0].n,0);
  }
});

dbtest('configured app DSN with identical database and LOGIN names on another real server is rejected',async()=>{
  const f=await consumerFixture();f.api.environment.ROOMQC_CONTROL_DATABASE_URL=f.uri(appRoles.api,0).replace(':'+servers[0].port+'/',':'+servers[1].port+'/');
  await assert.rejects(()=>attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject}),{code:'RESOURCE_DATABASE_IDENTITY_MISMATCH'});
});

dbtest('configured consumer targets on two independently identified servers keep distinct server budgets',async()=>{
  const f=await consumerFixture({independent:true}),r=await attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject});
  assert.equal(r.allConfiguredTargetsVerified,true);assert.equal(r.servers.length,2);
  assert.notEqual(r.servers[0].lineageSha256,r.servers[1].lineageSha256);
});

dbtest('app catalog privilege denial is a failed binding and no attestor/service fallback occurs',async()=>{
  const f=await consumerFixture(),admin=servers[0].dbAdmins.get('resource_business');
  await admin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${appRoles.auth}`);
  try{await assert.rejects(()=>attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject}),{code:'RESOURCE_CONSUMER_TARGET_READ_FAILED'})}
  finally{await admin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${appRoles.auth}`)}
  assert.equal((await attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject})).allConfiguredTargetsVerified,true);
});

dbtest('an actual elevated application LOGIN is rejected and restoration recovers the same configured check',async()=>{
  const f=await consumerFixture(),admin=servers[0].admin;await admin.query(`ALTER ROLE ${appRoles.api} CREATEDB`);
  try{await assert.rejects(()=>attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject}),{code:'RESOURCE_DATABASE_ROLE_MISMATCH'})}
  finally{await admin.query(`ALTER ROLE ${appRoles.api} NOCREATEDB`)}
  assert.equal((await attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject})).allConfiguredTargetsVerified,true);
});

dbtest('consumer-target CLI resolves real Compose documents, queries real databases and emits only the safe report',async()=>{
  const f=await consumerFixture(),path=await f.put('target-manifest.json',f.manifest);
  for(const [name,document]of Object.entries(f.resolved))await f.put(name+'.compose.json',document);
  const output=await new Promise((resolveOutput,reject)=>{
    import('node:child_process').then(({execFile})=>execFile(process.execPath,['scripts/control-backend-resource-consumer-target-check.mjs','--manifest',path],
      {cwd:process.cwd(),windowsHide:true,timeout:60000,env:{...process.env,PGHOST:'untrusted.invalid',PGUSER:'wrong',PGDATABASE:'wrong',PGPASSWORD:'wrong',PGOPTIONS:'-c role=postgres'}},
      (err,stdout)=>err?reject(new Error('Owned configured-target CLI failed; safe stdout: '+stdout)):resolveOutput(stdout))).catch(reject);
  });
  assert.equal(JSON.parse(output).allConfiguredTargetsVerified,true);assert.equal(JSON.parse(output).bindings.length,4);
  assert.doesNotMatch(output,new RegExp(password+'|'+appRoles.api+'|postgresql|dsnFile'));
});

dbtest('real restricted attestor reads both databases, aggregates one server and leaves business markers unchanged',async()=>{
  const f=await fixture(),result=await attestResourceDatabases(f.manifest);
  assert.equal(result.databaseTargetsVerified,true);assert.equal(result.servers.length,1);assert.equal(result.servers[0].committedConnections,56);
  assert.equal(result.databaseIdentityVerified,false);assert.equal(result.capacityProven,false);
  for(const name of ['resource_directory','resource_business']){
    const admin=new pg.Client(connectConfig(servers[0],name));await admin.connect();
    try{const rows=(await admin.query('SELECT * FROM public.resource_fixture_marker')).rows;
      assert.deepEqual(rows,[{id:1,value:'unchanged owned marker'}]);
      assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_catalog.pg_tables WHERE schemaname='public'")).rows[0].n,1);
    }finally{await admin.end()}
  }
});
dbtest('real attestor defaults to read-only and cannot create schema objects',async()=>{
  const f=await fixture(),e=f.manifest.databases[0],config=resourceDatabaseConnection(await readFile(e.dsnFile,'utf8'),e,'local');
  const client=new pg.Client(config);await client.connect();
  try{assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    await assert.rejects(()=>client.query('CREATE TABLE public.must_not_exist(id integer)'),{code:'25006'});
  }finally{await client.end()}
  assert.equal((await attestResourceDatabases(f.manifest)).databaseTargetsVerified,true);
});
dbtest('two independent real PostgreSQL instances retain separate capacity groups',async()=>{
  const f=await fixture({independent:true}),report=await attestResourceDatabases(f.manifest);
  assert.equal(report.servers.length,2);assert.notEqual(report.servers[0].lineageSha256,report.servers[1].lineageSha256);
});
dbtest('real database alias mapping cannot count one database twice',async()=>{
  const f=await fixture();f.manifest.databases[1].expected={...f.manifest.databases[0].expected};
  await writeFile(f.manifest.databases[1].dsnFile,await readFile(f.manifest.databases[0].dsnFile));
  await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_DUPLICATE_TARGET'});
});
dbtest('shared server overcommit is rejected though each logical database budget passes',async()=>{
  const f=await fixture();for(const db of f.raw.databases)db.maxConnections=50;await f.rebind();
  await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_SERVER_OVERCOMMITTED'});
});
dbtest('configured maximum or reserved slots must fit observed PostgreSQL settings',async()=>{
  for(const mutation of [d=>d.maxConnections=101,d=>d.reservedConnections=2]){
    const f=await fixture();mutation(f.raw.databases[0]);await f.rebind();
    await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_SETTINGS_MISMATCH'});
  }
});
dbtest('missing control-system privilege is refused and restoring only that privilege recovers',async()=>{
  const f=await fixture(),admin=servers[0].dbAdmins.get('resource_directory');await admin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${attestor}`);
  try{await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_READ_FAILED'})}
  finally{await admin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${attestor}`)}
  assert.equal((await attestResourceDatabases(f.manifest)).databaseTargetsVerified,true);
});
dbtest('role membership and unconstrained connection limit fail and recover on the same actual database',async()=>{
  const f=await fixture(),admin=servers[0].admin,group='attestor_extra_'+run;
  await admin.query('CREATE ROLE '+group);await admin.query(`GRANT ${group} TO ${attestor}`);
  try{await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_ROLE_MISMATCH'})}
  finally{await admin.query(`REVOKE ${group} FROM ${attestor}`)}
  await admin.query(`ALTER ROLE ${attestor} CONNECTION LIMIT 2`);
  try{await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_ROLE_MISMATCH'})}
  finally{await admin.query(`ALTER ROLE ${attestor} CONNECTION LIMIT 1`)}
  assert.equal((await attestResourceDatabases(f.manifest)).databaseTargetsVerified,true);
});
dbtest('real stopped endpoint is refused with a bounded connection attempt and recovers after restart',async()=>{
  const f=await fixture({independent:true});docker(['stop','--time','2',servers[1].container]);
  try{await assert.rejects(()=>attestResourceDatabases(f.manifest),{code:'RESOURCE_DATABASE_READ_FAILED'})}
  finally{docker(['start',servers[1].container]);await ready(servers[1])}
  assert.equal((await attestResourceDatabases(f.manifest)).databaseTargetsVerified,true);
});
dbtest('actual PostgreSQL restart during observations rejects drift, then a fresh check recovers',async()=>{
  const f=await fixture();let calls=0;
  await assert.rejects(()=>attestResourceDatabases(f.manifest,{readTarget:async c=>{
    const observation=await readResourceDatabaseTarget(c);
    if(++calls===2){docker(['restart','--time','2',servers[0].container]);await ready(servers[0])}
    return observation;
  }}),{code:'RESOURCE_DATABASE_OBSERVATION_DRIFT'});
  assert.equal((await attestResourceDatabases(f.manifest)).databaseTargetsVerified,true);
});
dbtest('CLI reads actual restricted credentials and emits no DSN, password or physical database names',async()=>{
  const f=await fixture(),file=join(root,'cli-manifest.json');await writeFile(file,JSON.stringify(f.manifest));
  const output=await new Promise((resolve,reject)=>{
    import('node:child_process').then(({execFile})=>execFile(process.execPath,['scripts/control-backend-resource-database-check.mjs','--manifest',file],
      {cwd:process.cwd(),windowsHide:true,timeout:30000,env:{...process.env,PGHOST:'untrusted.invalid',PGUSER:'wrong',PGDATABASE:'wrong',PGPASSWORD:'wrong',
        PGOPTIONS:'-c role=postgres',PGSSLMODE:'no-verify',PGSSLNEGOTIATION:'untrusted',PGCLIENT_ENCODING:'untrusted',PGREPLICATION:'database'}},
      (err,stdout)=>err?reject(new Error('Owned CLI check failed (private stderr withheld)')):resolve(stdout))).catch(reject);
  });
  assert.equal(JSON.parse(output).databaseTargetsVerified,true);
  for(const secret of [password,'postgresql://','resource_directory','resource_business',attestor])assert.ok(!output.includes(secret));
});
