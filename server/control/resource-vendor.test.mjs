import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {vendorResourceCatalog as catalog} from './resource-vendor-catalog.mjs';
import {resourceConsumerManifest,preflightResourceConsumers} from './resource-vendor.mjs';
import {resourceConsumerMain} from '../../scripts/control-backend-resource-consumer-preflight.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),nativeImage='registry.example.invalid/roomqc/control@sha256:'+'a'.repeat(64);
const example=JSON.parse(readFileSync(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const image=id=>catalog.entries.find(e=>e.id===id).image;
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'roomqc-vendor-plan-test-')),raw=structuredClone(example);raw.environment='local';
  for(const d of raw.databases)for(const c of d.consumers)c.replicas=0;
  raw.databases[0].consumers[0].replicas=1;
  const auth=raw.databases[1].consumers.find(c=>c.id==='auth'),rest=raw.databases[1].consumers.find(c=>c.id==='rest');
  auth.replicas=2;auth.pools=[{id:'main',max:3}];rest.replicas=2;rest.pools=[{id:'main',max:2}];rest.fixedConnectionsPerReplica=1;
  const budgetFile=join(root,'budget.json');writeFileSync(budgetFile,JSON.stringify(raw));
  const project=(id,services)=>({id,files:[join(root,id+'.compose.yml')],envFiles:[],profiles:[],services});
  const entry=(name,adapter,image,databaseId=raw.databases[1].id)=>({name,adapter,image,databaseId});
  const manifest={schemaVersion:1,environment:'local',budgetFile,budgetSha256:sha(readFileSync(budgetFile)),vendorCatalogId:catalog.id,
    nativeProjects:[project('native',[entry('api','control-api',nativeImage,raw.databases[0].id)])],
    vendorProjects:[project('vendor',[entry('auth','auth',image('auth')),entry('rest','rest',image('rest'))])]};
  const url=role=>`postgresql://${role}:fixture-private-password@db.internal:5432/fixture_database?sslmode=disable`;
  const native={name:'native',services:{api:{image:nativeImage,working_dir:'/app',command:['node','server.mjs'],
    environment:{ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/budget.json',ROOMQC_CONTROL_POOL_MAX:'5',ROOMQC_CONTROL_POOL_BUDGET:'20',ROOMQC_CONTROL_API_INSTANCES:'1'},
    volumes:[{type:'bind',source:budgetFile,target:'/etc/roomqc/budget.json',read_only:true,bind:{create_host_path:false}}]}}};
  const vendor={name:'vendor',services:{auth:{image:image('auth'),scale:2,environment:{GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:url('fixture_auth_role'),
    GOTRUE_DB_CONN_PERCENTAGE:'0',GOTRUE_DB_MAX_POOL_SIZE:'3',GOTRUE_DB_MAX_IDLE_POOL_SIZE:'0'}},
    rest:{image:image('rest'),scale:2,command:['postgrest'],environment:{PGRST_DB_URI:url('fixture_rest_role'),PGRST_DB_POOL:'2',PGRST_DB_CONFIG:'false',PGRST_DB_CHANNEL_ENABLED:'true'}}}};
  const resolved={native,vendor};const resolveProject=async p=>structuredClone(resolved[p.id]);
  const rebind=()=>{writeFileSync(budgetFile,JSON.stringify(raw));manifest.budgetSha256=sha(readFileSync(budgetFile))};
  return {root,raw,manifest,native,vendor,resolved,resolveProject,rebind};
}
const run=f=>preflightResourceConsumers(f.manifest,{resolveProject:f.resolveProject});
const roomqcAuth='roomqc/gotrue@sha256:5501a98d4819812bca0acdf2a28677bf5779ae4e34ab2e11f021320b8e5da7c8';
function withRoomqcAuth(f=fixture()){
  f.manifest.vendorProjects[0].services[0].image=roomqcAuth;
  f.vendor.services.auth.image=roomqcAuth;
  Object.assign(f.vendor.services.auth.environment,{GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD:'true',GOTRUE_AUDIT_LOG_DISABLE_POSTGRES:'false'});
  return f;
}
test('reviewed RoomQC Auth retains finite pool accounting and requires password/audit guards',async()=>{
  const f=withRoomqcAuth(),r=await run(f),s=r.services.find(s=>s.service==='auth');
  assert.equal(s.poolPlanVerified,true);assert.equal(s.plannedServerConnections,6);
  assert.equal(s.image,roomqcAuth);assert.equal(s.imageRecipe,'roomqc-password-guard-v1');
  assert.equal(s.sourceCommit,'4eee58f296d9698a1c2c0ae14d7a0b379c7622d3');
  assert.equal(r.runtimeVerified,false);assert.equal(r.capacityProven,false);assert.equal(r.deploymentReady,false);
  for(const key of ['GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD','GOTRUE_AUDIT_LOG_DISABLE_POSTGRES']){
    for(const value of [undefined,'',key.includes('SECURITY')?'false':'true']){
      const broken=withRoomqcAuth();if(value===undefined)delete broken.vendor.services.auth.environment[key];else broken.vendor.services.auth.environment[key]=value;
      await assert.rejects(()=>run(broken),{code:'RESOURCE_VENDOR_PASSWORD_GUARD_REQUIRED'});
    }
  }
});
test('RoomQC Auth recipe cannot be borrowed by a different digest, repository or process',async()=>{
  for(const image of [roomqcAuth.replace('roomqc/','unreviewed/'),roomqcAuth.slice(0,-1)+'9']){
    const f=withRoomqcAuth();f.manifest.vendorProjects[0].services[0].image=image;f.vendor.services.auth.image=image;
    await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
  }
  for(const mutate of [s=>s.command=['sh','-c','auth'],s=>s.volumes=[{target:'/usr/local/bin/auth'}],s=>s.environment.LD_PRELOAD='unreviewed']){
    const f=withRoomqcAuth();mutate(f.vendor.services.auth);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
  }
  const pool=withRoomqcAuth();pool.vendor.services.auth.environment.GOTRUE_DB_CONN_PERCENTAGE='50';
  await assert.rejects(()=>run(pool),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  const tls=withRoomqcAuth();tls.manifest.nativeProjects=[];tls.manifest.environment='staging';tls.raw.environment='staging';tls.rebind();
  await assert.rejects(()=>run(tls),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
  for(const s of Object.values(tls.vendor.services))for(const k of ['GOTRUE_DB_DATABASE_URL','PGRST_DB_URI'])if(s.environment[k])s.environment[k]=s.environment[k].replace('disable','verify-full');
  const verifiedTls=await run(tls);assert.equal(verifiedTls.services.find(s=>s.service==='auth').poolPlanVerified,true);
  assert.equal(verifiedTls.fullyCovered,false);assert.equal(verifiedTls.runtimeVerified,false);
});
test('CLI reports a missing RoomQC Auth guard without echoing private configuration',async()=>{
  const f=withRoomqcAuth();delete f.vendor.services.auth.environment.GOTRUE_AUDIT_LOG_DISABLE_POSTGRES;
  const file=join(f.root,'manifest.json');writeFileSync(file,JSON.stringify(f.manifest));let output='';
  assert.equal(await resourceConsumerMain(['--manifest',file],{resolveProject:f.resolveProject,output:{write:s=>output+=s}}),1);
  assert.equal(JSON.parse(output).code,'RESOURCE_VENDOR_PASSWORD_GUARD_REQUIRED');
  assert.ok(!output.includes('fixture-private-password'));
});
function withStorage(f=fixture()){
  const c=f.raw.databases[1].consumers.find(c=>c.id==='storage');c.replicas=2;c.pools=[{id:'main',max:2}];c.fixedConnectionsPerReplica=2;
  f.manifest.vendorProjects[0].services.push({name:'storage',adapter:'storage',databaseId:f.raw.databases[1].id,image:image('storage')});
  f.vendor.services.storage={image:image('storage'),scale:2,working_dir:'/app',command:['node','dist/start/server.js'],
    volumes:[{type:'volume',source:'fixture-data',target:'/var/lib/storage'}],environment:{
      DATABASE_URL:'postgresql://fixture_storage_role:fixture-private-password@db.internal:5432/fixture_database?sslmode=disable',
      DATABASE_ENGINE:'postgres',DATABASE_MAX_CONNECTIONS:'2',WORKERS_NUM:'1',MULTI_TENANT:'false',IS_MULTITENANT:'false',
      PG_QUEUE_ENABLE:'false',ENABLE_QUEUE_EVENTS:'false',PG_QUEUE_WORKERS_ENABLE:'false',VECTOR_ENABLED:'false',
      VECTOR_STORE_MIGRATIONS_ENABLED:'false',ICEBERG_ENABLED:'false',DATABASE_ENABLE_QUERY_CANCELLATION:'false',
      DATABASE_TLS_SESSION_RESUMPTION:'false',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage'}};
  f.rebind();return f;
}

test('reviewed catalog binds exact upstream commits, public source hashes and supported image digests',()=>{
  assert.equal(catalog.entries.length,7);assert.equal(catalog.baselineFiles.length,3);assert.ok(Object.isFrozen(catalog.entries[0].sources));
  assert.equal(catalog.sourceToImageProvenanceVerified,false);
  for(const e of catalog.entries){assert.match(e.commit,/^[a-f0-9]{40}$/);for(const s of e.sources){assert.ok(s.url.includes('/'+e.commit+'/'));assert.match(s.sha256,/^[a-f0-9]{64}$/)}}
  assert.ok(image('auth').startsWith('supabase/gotrue@sha256:'));assert.ok(image('rest').startsWith('postgrest/postgrest@sha256:'));
  assert.ok(image('storage').startsWith('supabase/storage-api@sha256:'));
});
test('fixed-project Storage allocation includes main pool, listener and separate startup reserve per replica',async()=>{
  const f=withStorage(),r=await run(f),s=r.services.find(s=>s.adapter==='storage');assert.equal(r.fullyCovered,true);
  assert.equal(s.plannedServerConnections,8);assert.equal(s.resources.steadyStatePlannedConnections,3);
  assert.equal(s.resources.fixedConnectionsPerReplica,2);assert.equal(s.resources.startupConnectionsReserved,1);
  assert.deepEqual(s.resources.components.map(c=>[c.id,c.max]),[['tenant-main',2],['pubsub',1],['startup-migration',1]]);
  assert.equal(s.resources.connectionBoundScope,'configured-client-allocation');assert.equal(r.capacityProven,false);
  for(const secret of ['fixture_storage_role','fixture-private-password','db.internal','fixture_database'])assert.ok(!JSON.stringify(r).includes(secret));
  f.raw.databases[1].consumers.find(c=>c.id==='storage').fixedConnectionsPerReplica=1;f.rebind();
  await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_BUDGET_MISMATCH'});
});
test('Storage refuses tenant, worker, queue, vector, alternate target and query-cancellation paths outside recipe',async()=>{
  for(const value of [undefined,'0','02','2oops','2.5','-1','10001']){
    const f=withStorage();if(value===undefined)delete f.vendor.services.storage.environment.DATABASE_MAX_CONNECTIONS;
    else f.vendor.services.storage.environment.DATABASE_MAX_CONNECTIONS=value;
    await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  }
  for(const key of ['MULTI_TENANT','IS_MULTITENANT','PG_QUEUE_ENABLE','ENABLE_QUEUE_EVENTS','PG_QUEUE_WORKERS_ENABLE',
    'VECTOR_ENABLED','VECTOR_STORE_MIGRATIONS_ENABLED','ICEBERG_ENABLED','DATABASE_ENABLE_QUERY_CANCELLATION','DATABASE_TLS_SESSION_RESUMPTION']){
    for(const value of [undefined,'','true']){
      const f=withStorage();if(value===undefined)delete f.vendor.services.storage.environment[key];else f.vendor.services.storage.environment[key]=value;
      await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'},key);
    }
  }
  for(const key of ['DATABASE_POOL_URL','DATABASE_MULTITENANT_URL','DATABASE_MULTITENANT_POOL_URL','MULTITENANT_DATABASE_URL',
    'MULTITENANT_DATABASE_POOL_URL','PG_QUEUE_CONNECTION_URL','VECTOR_DATABASE_URL','CLUSTER_DISCOVERY','WORKERS_NUM','DATABASE_ENGINE','DATABASE_MAX_CONNECTIONS']){
    const f=withStorage();f.vendor.services.storage.environment[key]=key==='DATABASE_MAX_CONNECTIONS'?'3':'2';await assert.rejects(()=>run(f),
      {code:key==='DATABASE_MAX_CONNECTIONS'?'RESOURCE_VENDOR_BUDGET_MISMATCH':'RESOURCE_VENDOR_POOL_UNBOUNDED'},key);
  }
});
test('Storage only allows the reviewed Node process, one data mount and reviewed process/database environment',async()=>{
  for(const mutate of [s=>s.command=['node','dist/start/worker.js'],s=>s.command=['npm','start'],s=>s.working_dir='/var/lib/storage',
    s=>s.entrypoint=['node'],s=>s.volumes.push({type:'volume',source:'unreviewed',target:'/app'}),s=>s.volumes[0].target='/app',
    s=>delete s.volumes,s=>s.volumes[0].type='tmpfs',s=>s.environment.PATH='/var/lib/storage',s=>s.environment.NODE_OPTIONS='--import=/data/hook.mjs',
    s=>s.environment.PGOPTIONS='-c role=postgres',s=>s.environment.DATABASE_SEARCH_PATH='storage -c role=postgres',
    s=>s.environment.DB_SEARCH_PATH='public',s=>s.environment.DATABASE_MULTITENANT_MAX_CONNECTIONS='10',s=>s.secrets=['unreviewed']]){
    const f=withStorage();mutate(f.vendor.services.storage);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
  }
  const f=withStorage();f.vendor.services.storage.volumes=[{type:'bind',source:'/owned/storage',target:'/var/lib/storage',bind:{create_host_path:false}}];
  assert.equal((await run(f)).fullyCovered,true);
  f.vendor.services.storage.environment.DATABASE_URL=f.vendor.services.storage.environment.DATABASE_URL.replace('sslmode=disable','sslmode=disable&options=-c%20role=postgres');
  await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
});
test('combined native/Auth/PostgREST plan maps all fixture consumers, replicas, pools and a separate listener',async()=>{
  const f=fixture(),r=await run(f);assert.equal(r.fullyCovered,true);assert.equal(r.nativePlanChecked,true);
  assert.equal(r.services.length,3);assert.equal(r.services.find(s=>s.adapter==='auth').plannedServerConnections,6);
  assert.equal(r.services.find(s=>s.adapter==='rest').plannedServerConnections,6);
  assert.deepEqual(r.unresolvedConsumers,[]);assert.deepEqual(r.unresolvedServices,[]);
  for(const k of ['runtimeVerified','databaseIdentityVerified','capacityProven','deploymentReady','sourceToImageProvenanceVerified'])assert.equal(r[k],false);
  for(const secret of ['fixture-private-password','postgresql://','fixture_auth_role','fixture_rest_role','fixture_database','db.internal'])assert.ok(!JSON.stringify(r).includes(secret));
});
test('disabled listener removes only its explicitly declared fixed connection',async()=>{
  const f=fixture();f.vendor.services.rest.environment.PGRST_DB_CHANNEL_ENABLED='false';
  await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_BUDGET_MISMATCH'});
  f.raw.databases[1].consumers.find(c=>c.id==='rest').fixedConnectionsPerReplica=0;f.rebind();
  assert.equal((await run(f)).services.find(s=>s.adapter==='rest').plannedServerConnections,4);
});
test('replicas are aggregated across independent vendor projects and duplicate mappings cannot hide oversubscription',async()=>{
  const f=fixture(),extra=structuredClone(f.manifest.vendorProjects[0]);extra.id='vendor-other';extra.services=[extra.services[0]];
  f.vendor.services.auth.scale=1;f.manifest.vendorProjects.push(extra);f.resolved[extra.id]={name:extra.id,services:{auth:{...structuredClone(f.vendor.services.auth),scale:1}}};
  assert.equal((await run(f)).fullyCovered,true);
  f.resolved[extra.id].services.auth.scale=2;await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_REPLICA_MISMATCH'});
});
test('Auth requires an explicit finite pool, idle cap and disabled percentage override',async()=>{
  for(const mutate of [e=>delete e.GOTRUE_DB_MAX_POOL_SIZE,e=>e.GOTRUE_DB_MAX_POOL_SIZE='0',e=>e.GOTRUE_DB_MAX_POOL_SIZE='3garbage',
    e=>e.GOTRUE_DB_MAX_POOL_SIZE='3.5',e=>e.GOTRUE_DB_MAX_POOL_SIZE='-1',e=>e.GOTRUE_DB_MAX_POOL_SIZE='03',
    e=>e.GOTRUE_DB_CONN_PERCENTAGE='10',e=>delete e.GOTRUE_DB_CONN_PERCENTAGE,e=>e.GOTRUE_DB_MAX_IDLE_POOL_SIZE='4',e=>e.GOTRUE_DB_DRIVER='pgx']){
    const f=fixture();mutate(f.vendor.services.auth.environment);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  }
});
test('PostgREST requires explicit pool/channel and prevents in-database config overrides',async()=>{
  for(const mutate of [e=>delete e.PGRST_DB_POOL,e=>e.PGRST_DB_POOL='0',e=>e.PGRST_DB_POOL='2oops',e=>e.PGRST_DB_CONFIG='true',
    e=>delete e.PGRST_DB_CONFIG,e=>delete e.PGRST_DB_CHANNEL_ENABLED,e=>e.PGRST_DB_CHANNEL_ENABLED='yes']){
    const f=fixture();mutate(f.vendor.services.rest.environment);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_POOL_UNBOUNDED'});
  }
});
test('unreviewed images, commands, overlays, env files and loader/session injection cannot borrow a recipe',async()=>{
  for(const mutate of [s=>s.command=['sh','-c','postgrest'],s=>s.entrypoint=['postgrest'],s=>s.build={},s=>s.env_file=['secret.env'],
    s=>s.volumes=[{target:'/app'}],s=>s.secrets=['config'],s=>s.tmpfs=['/tmp'],s=>s.environment.PGOPTIONS='-c role=postgres',
    s=>s.environment.NODE_OPTIONS='--import=evil',s=>s.environment.DATABASE_URL='private',s=>s.environment.PGRST_DB_POOL=2,s=>s.privileged=true]){
    const f=fixture();mutate(f.vendor.services.rest);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
  }
  const f=fixture();f.vendor.services.auth.image='supabase/gotrue@sha256:'+'b'.repeat(64);f.manifest.vendorProjects[0].services[0].image=f.vendor.services.auth.image;
  await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
});
test('direct target metadata excludes file references, injected URL options, invalid encoding and unverified staging TLS',async()=>{
  for(const bad of ['@/run/secrets/uri','postgresql://role:password@db.internal:5432/name',
    'postgresql://role:password@db.internal:5432/name?sslmode=disable&options=-c%20role=postgres',
    'postgresql://role:%zz@db.internal:5432/name?sslmode=disable','postgresql://role:password@db.internal:65536/name?sslmode=disable',
    'postgresql://role:password@db.internal/name?sslmode=disable&sslmode=verify-full']){
    const f=fixture();f.vendor.services.rest.environment.PGRST_DB_URI=bad;await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
  }
  const f=fixture();f.manifest.nativeProjects=[];f.raw.environment='staging';f.manifest.environment='staging';f.rebind();
  await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
  for(const s of Object.values(f.vendor.services))for(const k of ['GOTRUE_DB_DATABASE_URL','PGRST_DB_URI'])if(s.environment[k])s.environment[k]=s.environment[k].replace('disable','verify-full');
  const r=await run(f);assert.equal(r.fullyCovered,false);assert.ok(r.unresolvedConsumers.some(c=>c.consumerId==='control-api'));
});
test('dynamic vendor consumers remain unknown, including meta per-request pools and Supavisor metadata/data separation',async()=>{
  for(const adapter of ['realtime','storage','meta','supavisor','functions','studio','gateway','imgproxy','database']){
    const f=fixture(),entry={name:'extra',adapter,databaseId:f.raw.databases[1].id,image:'registry.example.invalid/vendor@sha256:'+'d'.repeat(64)};
    f.manifest.vendorProjects[0].services.push(entry);f.vendor.services.extra={image:entry.image,environment:{DB_POOL_SIZE:'5',POOLER_DEFAULT_POOL_SIZE:'20',POOLER_MAX_CLIENT_CONN:'100',PG_META_DB_MAX_CONNECTIONS:'1'}};
    const r=await run(f);assert.equal(r.fullyCovered,false);assert.equal(r.unresolvedServices.length,1);assert.equal(r.services.find(s=>s.service==='extra').plannedServerConnections,null);
    assert.ok(r.unresolvedServices[0].reasons.length>0);
  }
});
test('pinned Realtime exposes partial inventory while metadata pool cannot satisfy the tenant or total budget',async()=>{
  const f=fixture();f.manifest.vendorProjects[0].services.push({name:'realtime',adapter:'realtime',databaseId:f.raw.databases[1].id,image:image('realtime')});
  f.vendor.services.realtime={image:image('realtime'),environment:{DB_POOL_SIZE:'2',RUN_JANITOR:'true',SEED_SELF_HOST:'true'}};
  f.raw.databases[1].consumers.find(c=>c.id==='realtime').replicas=1;f.rebind();
  const r=await run(f),s=r.services.find(s=>s.adapter==='realtime');
  assert.equal(r.fullyCovered,false);assert.equal(s.poolPlanVerified,false);assert.equal(s.plannedServerConnections,null);
  assert.equal(s.inventory.metadata.activePoolMax,2);assert.equal(s.inventory.scheduledMaintenance.maxConcurrentTasks,5);
  assert.ok(r.unresolvedConsumers.some(c=>c.consumerId==='realtime'));assert.equal(r.unresolvedServices.length,1);
  assert.equal(s.inventory.startup.storedTenantOverridesSurviveReseed,false);
  const file=join(f.root,'realtime-manifest.json');writeFileSync(file,JSON.stringify(f.manifest));let output='';
  assert.equal(await resourceConsumerMain(['--manifest',file],{resolveProject:f.resolveProject,output:{write:s=>output+=s}}),2);
  assert.equal(JSON.parse(output).capacityProven,false);
});
test('active budget consumers omitted from declared projects remain unresolved rather than zero',async()=>{
  const f=fixture();f.raw.databases[1].consumers.find(c=>c.id==='storage').replicas=1;f.rebind();
  const r=await run(f);assert.equal(r.fullyCovered,false);assert.ok(r.unresolvedConsumers.some(c=>c.consumerId==='storage'));
});
test('unlisted, one-off-like declarations, conflicting scales and wrong business bindings are rejected',async()=>{
  const f=fixture();f.vendor.services.hidden={image:image('auth')};await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_UNCLASSIFIED_SERVICE'});
  for(const mutate of [f=>f.vendor.services.rest.deploy={replicas:1},f=>f.vendor.services.rest.container_name='fixed',f=>f.vendor.services.rest.scale=1.5]){
    const f=fixture();mutate(f);await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_REPLICA_MISMATCH'});
  }
  const d=fixture();d.manifest.vendorProjects[0].services[0].databaseId=d.raw.databases[0].id;
  await assert.rejects(()=>run(d),{code:'RESOURCE_VENDOR_PROCESS_MISMATCH'});
});
test('profiles and zero replicas are explicit plan states, not proof of a disabled running service',async()=>{
  const f=fixture();f.vendor.services.optional={image:image('auth'),profiles:['maintenance']};
  assert.equal((await run(f)).fullyCovered,true);
  f.manifest.vendorProjects[0].profiles=['maintenance'];await assert.rejects(()=>run(f),{code:'RESOURCE_VENDOR_UNCLASSIFIED_SERVICE'});
  delete f.vendor.services.optional;f.vendor.services.rest.scale=0;
  const r=await run(f);assert.equal(r.fullyCovered,false);assert.equal(r.services.find(s=>s.adapter==='rest').inactive,true);assert.equal(r.runtimeVerified,false);
});
test('closed manifest validates catalog, paths, unique projects and service adapters',()=>{
  for(const mutate of [r=>r.extra=true,r=>r.vendorCatalogId='unreviewed',r=>r.schemaVersion=2,r=>r.budgetFile='relative',
    r=>r.nativeProjects=[],r=>r.vendorProjects[0].id='native',r=>r.vendorProjects[0].services[0].adapter='generic',
    r=>r.vendorProjects[0].services[0].image='supabase/gotrue:v2.197.0',r=>r.vendorProjects[0].services[0].extra='ignored']){
    const f=fixture();mutate(f.manifest);
    if(f.manifest.nativeProjects.length===0)f.manifest.vendorProjects=[];
    assert.throws(()=>resourceConsumerManifest(f.manifest));
  }
});
test('budget changes while resolving Compose require a new plan check',async()=>{
  const f=fixture();await assert.rejects(()=>preflightResourceConsumers(f.manifest,{resolveProject:async p=>{
    if(p.id==='vendor')writeFileSync(f.manifest.budgetFile,JSON.stringify(f.raw)+'\n');return structuredClone(f.resolved[p.id]);
  }}),{code:'RESOURCE_VENDOR_PROFILE_MISMATCH'});
});
test('CLI returns scoped zero/two/one outcomes and suppresses raw resolver diagnostics',async()=>{
  const f=fixture(),file=join(f.root,'manifest.json');writeFileSync(file,JSON.stringify(f.manifest));let output='';
  assert.equal(await resourceConsumerMain(['--manifest',file],{resolveProject:f.resolveProject,output:{write:s=>output+=s}}),0);
  assert.equal(JSON.parse(output).deploymentReady,false);
  f.raw.databases[1].consumers.find(c=>c.id==='storage').replicas=1;f.rebind();writeFileSync(file,JSON.stringify(f.manifest));output='';
  assert.equal(await resourceConsumerMain(['--manifest',file],{resolveProject:f.resolveProject,output:{write:s=>output+=s}}),2);
  output='';assert.equal(await resourceConsumerMain(['--manifest',file],{resolveProject:async()=>{throw new Error('fixture-private-password')},output:{write:s=>output+=s}}),1);
  assert.ok(!output.includes('fixture-private-password'));assert.equal(JSON.parse(output).consumerPlanChecked,false);
});
