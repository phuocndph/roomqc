// Real HTTP + isolated directory + compiled production client. Authority and remote
// receipt are synthetic adapters; this does not prove live Supabase or browser E2E.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {ControlStore,ControlError} from '../server/control/store.mjs';
import {migrateDirectory,importInitialRegistry} from '../server/control/migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '../server/control/test-fixtures.mjs';
import {startControl} from '../server/control/server.mjs';
import {captureBackendSourceBinding} from './control-backend-source-binding.mjs';

const require=createRequire(new URL('../server/control/package.json',import.meta.url)),pg=require('pg');
const root=fileURLToPath(new URL('../',import.meta.url));
const run=randomBytes(6).toString('hex'),name='roomqc-admin-client-'+run,label='roomqc.control-admin-client='+run;
const password=randomBytes(32).toString('hex'),image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1_000_000,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});
const paths=['scripts/test-control-admin-client.mjs','src/lib/control-admin.ts','src/lib/control-admin-routes.ts','src/lib/workspace.ts',
  'src/hooks/super-admin/useControlAdmin.ts','src/hooks/super-admin/useControlScroll.ts','src/hooks/useSuperAdminAuth.ts',
  'src/components/super-admin/SuperAdminLayout.tsx','src/components/super-admin/control/ControlReadState.tsx',
  'src/pages/admin/InfrastructurePage.tsx','src/pages/admin/RegistrationsPage.tsx','src/lib/control-admin-display.ts','src/App.tsx',
  'server/control/admin-read.mjs','server/control/admin.mjs','server/control/app.mjs'];
const hashes=async()=>Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')})));
const startedAtUtc=new Date().toISOString(),sourcesBefore=await hashes(),backendBefore=await captureBackendSourceBinding(root),checks=[],requests=[];
const originalFetch=globalThis.fetch;
let created=false,pool,runtime,store,stage='compile',failure=null,cleanupVerified=false;
const record=(label,passed,details={})=>{checks.push({label,passed:!!passed,...details});assert.equal(!!passed,true,label)};
const artifact='artifacts/roomqc-control-admin-read-'+run+'-local-2026-10-28.json';
try {
  const compiled=await build({absWorkingDir:root,entryPoints:['src/lib/control-admin.ts'],bundle:true,platform:'node',format:'esm',
    write:false,logLevel:'silent',define:{'import.meta.env':'{}'}});
  const {createControlAdminClient}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  stage='directory';docker(['run','-d','--name',name,'--label',label,'--env','POSTGRES_PASSWORD',
    '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m','-p','127.0.0.1::5432',image]);created=true;
  const info=JSON.parse(docker(['inspect',name]))[0];
  const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
  pool=new pg.Pool({connectionString:databaseUrl,max:2,statement_timeout:10000});
  for(let attempt=0;;attempt++){try{await pool.query('SELECT 1');break}catch{if(attempt>=60)throw new Error('DIRECTORY_NOT_READY');await new Promise(resolve=>setTimeout(resolve,200))}}
  await migrateDirectory(pool);
  const config=fixtureConfig(databaseUrl);config.signupEnabled=false;
  await importInitialRegistry(pool,config.clusters);await seedOperationalCluster(pool,'cluster-a',{limit:2000});
  await pool.query(`CREATE ROLE admin_client_runtime LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const apiUrl=new URL(databaseUrl);apiUrl.username='admin_client_runtime';
  config.databaseUrl=apiUrl.href;store=new ControlStore(config);
  const identity={actorId:randomUUID(),sessionId:randomUUID()},target=randomUUID(),tenant=randomUUID(),hotel=randomUUID();
  const token='e30.'+Buffer.from(JSON.stringify({sub:identity.actorId,session_id:identity.sessionId})).toString('base64url')+'.synthetic';
  const session={access_token:token,user:{id:identity.actorId}};
  await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status)
    VALUES($1,'demo-control','Demo 50% & B',$2,'cluster-a',$3,$4,$5,'active')`,[target,run+'-target',tenant,hotel,identity.actorId]);
  await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status,created_at)
    SELECT gen_random_uuid(),'hotel-'||lpad(g::text,4,'0'),'Demo Hotel '||g,$1||'-'||g,'cluster-a',
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
      (ARRAY['reserved','provisioning','active','suspended','migrating','expired'])[1+g%6],now()-make_interval(secs=>g)
    FROM generate_series(1,999)g`,[run]);
  const requestId=randomUUID();await pool.query("INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,'succeeded')",[requestId,target]);
  const binding={workspace_id:target,tenant_id:tenant,hotel_id:hotel,owner_id:identity.actorId};
  runtime=await startControl(config,{store,gateway:{
    supportActor:async supplied=>{if(supplied!==token)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Cần quyền quản trị.');return{id:identity.actorId,clusterId:'cluster-a'}},
    binding:async workspace=>workspace.id===target?binding:null,
  }});
  const origin='http://127.0.0.1:'+runtime.server.address().port;
  // Node needs the origin that a browser supplies for relative URLs. Leave the
  // production controlRequest, headers, cache options and parsing in the path.
  globalThis.fetch=async(url,options)=>{
    if(typeof url==='string'&&url.startsWith('/api/control/')){
      requests.push({path:url.slice('/api/control'.length),method:options.method});
      assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');
      const response=await originalFetch(origin+url,options);assert.equal(response.headers.get('cache-control'),'no-store');return response;
    }
    return originalFetch(url,options);
  };
  const client=createControlAdminClient({getSession:async()=>({data:{session},error:null})});
  const tables=['workspaces','attempts','provisioning_jobs','cluster_events','control_commands','support_actions'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await pool.query(
    `SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS hash FROM roomqc_control.${table} t`)).rows[0].hash])));
  const before=await snapshot();stage='http-reads';
  const list=await client.clusters(identity);record('compiled-client-parses-real-cluster-dto',list.items.length===1&&list.items[0].id==='cluster-a');
  const cluster=await client.cluster(identity,'cluster-a');record('compiled-client-parses-cluster-detail',cluster.id==='cluster-a');
  const search=await client.workspaces(identity,{search:'50% & B'});record('literal-search-escapes-percent-and-ampersand',search.items.length===1&&search.items[0].id===target);
  const requestSearch=await client.workspaces(identity,{search:requestId});record('search-finds-request-id',requestSearch.items.length===1&&requestSearch.items[0].id===target);
  const filtered=await client.workspaces(identity,{status:'active',clusterId:'cluster-a'});
  record('filters-applied-by-database',filtered.items.length>0&&filtered.items.every(item=>item.status==='active'&&item.clusterId==='cluster-a'));
  const detail=await client.workspace(identity,target);
  record('real-workspace-timeline-and-synthetic-remote-receipt',detail.workspace.id===target&&detail.receipt.status==='verified'&&detail.timeline.items[0]?.requestId===requestId);
  const ids=new Set();let cursor;let pages=0;
  do {const page=await client.workspaces(identity,{cursor});pages++;for(const item of page.items){assert.equal(ids.has(item.id),false);ids.add(item.id)}cursor=page.nextCursor??undefined;}while(cursor);
  record('all-1000-metadata-on-server-cursor-without-duplicate-or-omission',ids.size===1000,{metadata:ids.size,pages});
  const unauthorized=await fetch(origin+'/api/control/admin/clusters');record('http-admin-read-denied-without-adapter-token',unauthorized.status===403);
  record('read-client-never-dispatches-mutation',requests.every(request=>request.method==='GET'),{requests:requests.length});
  record('directory-read-effects-unchanged',JSON.stringify(await snapshot())===JSON.stringify(before),{snapshotTables:tables.length});
  record('runtime-role-is-api-member-not-superuser',(await store.pool.query("SELECT current_user AS name,rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0].rolsuper===false);
  stage='source';record('candidate-source-unchanged',JSON.stringify(await hashes())===JSON.stringify(sourcesBefore)
    &&JSON.stringify(await captureBackendSourceBinding(root))===JSON.stringify(backendBefore));
} catch(error) {
  failure={stage,code:/^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'CONTROL_ADMIN_READ_TEST_FAILED'};
  process.exitCode=1;
} finally {
  globalThis.fetch=originalFetch;
  if(runtime)await runtime.shutdown();else if(store)await store.close();
  if(pool)await pool.end();
  if(created){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['roomqc.control-admin-client'],run);docker(['rm','-f',name]);
    cleanupVerified=docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).trim()==='';}
  const result={schemaVersion:1,startedAtUtc,finishedAtUtc:new Date().toISOString(),run,type:'compiled_admin_client_real_http_directory_read',
    verified:!failure&&cleanupVerified,checks,failure,cleanupVerified,source:sourcesBefore,
    backendSource:{sha256:backendBefore.sha256,files:backendBefore.files.length},
    scope:{realHttp:true,realDirectoryDatabase:true,leastPrivilegeRuntimeRole:true,datasetMetadata:1000,
      compiledProductionClient:true,defaultWebTransport:true,browserOriginShim:true,
      syntheticAuthorityAdapter:true,syntheticRemoteReceipt:true,liveSupabaseAuth:false,browserAndroid:false},
    acceptance:{productAccepted:false,reviewer:null,signoff:null},
    limitations:['Synthetic authority and receipt adapters do not prove live Supabase permissions or remote tenant data.',
      'No browser/Android, Linux VPS, external email, offsite restore, load capacity or pilot acceptance.']};
  await writeFile(new URL('../'+artifact,import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({event:failure?'control_admin_read_failed':'control_admin_read_completed',artifact,run,
    verified:result.verified,checks:checks.length,passed:checks.filter(c=>c.passed).length,cleanupVerified,failure}));
}
