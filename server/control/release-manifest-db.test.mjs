import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {ClusterGateway} from './cluster.mjs';
import {ReleaseValidationCatalog,releaseValidationContext} from './release-validation.mjs';
import {fixtureReleaseTrust,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const run=randomBytes(6).toString('hex'),network=`roomqc-manifest-${run}`,dbName=network+'-db',restName=network+'-rest';
const label='roomqc.release-manifest-test',password=randomBytes(32).toString('hex'),jwtSecret=randomBytes(32).toString('hex');
const dbImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const restImage='public.ecr.aws/supabase/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df';
const sql=await readFile(new URL('../../supabase/migrations/20261019114214_control_cluster_release_manifest.sql',import.meta.url),'utf8');
const partitionSql=await readFile(new URL('../../supabase/migrations/20261019142205_control_realtime_partition_attestation.sql',import.meta.url),'utf8');
const recoveryFingerprintSql=await readFile(new URL('../../supabase/migrations/20261028092341_release_schema_fingerprint_v3.sql',import.meta.url),'utf8');
const restoredPartitionSql=await readFile(new URL('../../supabase/migrations/20261030055444_realtime_restored_primary_constraint_attestation.sql',import.meta.url),'utf8');
const migration='20261019114214',challenge='a'.repeat(64);
const pools=[],owned=[];let admin,pool,origin,base;
const docker=(args,env={})=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1_000_000,
  env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
const token=(role,extra={})=>{
  const data=[{alg:'HS256',typ:'JWT'},{role,exp:Math.floor(Date.now()/1000)+120,...extra}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return data+'.'+createHmac('sha256',jwtSecret).update(data).digest('base64url');
};
const dbtest=(title,fn)=>test(title,{skip:!enabled},fn);
async function newDatabase(name,{reverse=false}={}){
  await admin.query(`CREATE DATABASE ${name}`);const url=new URL(base);url.pathname='/'+name;
  const value=new pg.Pool({connectionString:url.href,max:2,statement_timeout:10000});pools.push(value);
  await value.query(`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
    INSERT INTO supabase_migrations.schema_migrations VALUES('${migration}'),('20261019142205'),('20261028092341');
    CREATE SCHEMA private;
    CREATE TABLE public.business_fixture(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,note text NOT NULL DEFAULT 'fixture');
    ALTER TABLE public.business_fixture ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_owner ON public.business_fixture FOR SELECT TO authenticated USING(true);
    GRANT SELECT ON public.business_fixture TO authenticated;
    INSERT INTO public.business_fixture(note) VALUES('synthetic data; not a production release');`);
  // Fully qualified catalog identities exceed PostgreSQL's 63-byte `name`
  // limit even when each component is valid. Reverse creation/OID order to
  // expose truncation or implicit UNION type selection in the canonicalizer.
  await value.query('CREATE TABLE public.very_long_application_table_for_manifest_repeatability (id int)');
  const constraints=['manifest_constraint_for_positive_identity CHECK(id>0)','manifest_constraint_for_upper_bound_identity CHECK(id<100)'];
  for(const constraint of reverse?[...constraints].reverse():constraints){
    await value.query('ALTER TABLE public.very_long_application_table_for_manifest_repeatability ADD CONSTRAINT '+constraint);
  }
  await value.query('BEGIN');try{await value.query(sql);await value.query(partitionSql);await value.query(recoveryFingerprintSql);await value.query(restoredPartitionSql);
    await value.query(`CREATE SCHEMA roomqc_setup;CREATE SCHEMA roomqc_setup_admin;
      REVOKE ALL ON SCHEMA roomqc_setup,roomqc_setup_admin FROM PUBLIC;
      CREATE FUNCTION roomqc_setup.fixture_receipt() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1';
      REVOKE ALL ON FUNCTION roomqc_setup.fixture_receipt() FROM PUBLIC;
      GRANT USAGE ON SCHEMA roomqc_setup TO roomqc_setup_recovery;
      GRANT EXECUTE ON FUNCTION roomqc_setup.fixture_receipt() TO roomqc_setup_recovery;
      CREATE FUNCTION roomqc_setup_admin.fixture_status() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1';
      REVOKE ALL ON FUNCTION roomqc_setup_admin.fixture_status() FROM PUBLIC;`);
    await value.query('COMMIT')}catch(error){await value.query('ROLLBACK');throw error}
  return value;
}
async function asRole(role,query,args=[]){
  const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
    return await client.query(query,args);
  }finally{await client.query('ROLLBACK');client.release()}
}
const fingerprint=async(db=pool)=>(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash;
const rpc=async(bearer,body={p_challenge:challenge})=>fetch(origin+'/rpc/control_cluster_manifest',{
  method:'POST',signal:AbortSignal.timeout(6000),headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});

before(async()=>{
  if(!enabled)return;
  // This fixture contains no application migrations, hooks, mail or providers.
  // Loopback-only ports let the host test runner verify real SQL and HTTP.
  docker(['network','create','--label',`${label}=${run}`,network]);owned.push(['network',network]);
  docker(['run','-d','--name',dbName,'--network',network,'--label',`${label}=${run}`,'--env','POSTGRES_PASSWORD',
    '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=128m','-p','127.0.0.1::5432',dbImage],{POSTGRES_PASSWORD:password});owned.push(['container',dbName]);
  const info=JSON.parse(docker(['inspect',dbName]))[0];base=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
  admin=new pg.Pool({connectionString:base,max:2,statement_timeout:10000});pools.push(admin);
  let ready=false;for(let i=0;i<80;i++){try{await admin.query('SELECT 1');ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
  assert.ok(ready,'Owned manifest database ready');
  await admin.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE supabase_realtime_admin NOLOGIN;CREATE ROLE dashboard_user NOLOGIN;
    CREATE ROLE roomqc_setup_recovery NOLOGIN NOINHERIT;
    CREATE ROLE roomqc_setup_credential_owner NOLOGIN NOINHERIT;
    CREATE ROLE roomqc_setup_credential_issuer NOLOGIN NOINHERIT;
    CREATE ROLE roomqc_setup_credential_installer NOLOGIN NOINHERIT;
    CREATE ROLE scoped_fixture_operator NOLOGIN NOINHERIT;
    CREATE ROLE supabase_admin NOLOGIN;GRANT supabase_realtime_admin TO supabase_admin;
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}';GRANT anon,authenticated,service_role TO authenticator;`);
  pool=await newDatabase('manifest_fixture');
  docker(['run','-d','--name',restName,'--network',network,'--label',`${label}=${run}`,'--env','PGRST_DB_URI','--env','PGRST_JWT_SECRET',
    '--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon','--env','PGRST_DB_POOL=2','-p','127.0.0.1::3000',restImage],
  {PGRST_DB_URI:`postgres://authenticator:${password}@${dbName}:5432/manifest_fixture`,PGRST_JWT_SECRET:jwtSecret});owned.push(['container',restName]);
  const rest=JSON.parse(docker(['inspect',restName]))[0];origin='http://127.0.0.1:'+rest.NetworkSettings.Ports['3000/tcp'][0].HostPort;
  let lastStatus,lastCode;
  ready=false;for(let i=0;i<100;i++){try{const response=await rpc(token('roomqc_control_probe'));lastStatus=response.status;lastCode=(await response.json()).code;
      if(lastCode==='55000'){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100))}
  assert.ok(ready,`Real PostgREST must reach manifest function before metadata installation (status=${lastStatus},code=${lastCode})`);
});
after(async()=>{
  await Promise.allSettled(pools.map(p=>p.end()));
  for(const [kind,name] of owned.reverse()){
    const info=JSON.parse(docker([kind==='network'?'network':'container','inspect',name]))[0];
    assert.equal(kind==='network'?info.Labels[label]:info.Config.Labels[label],run,'Refuse cleanup without exact ownership');
    docker(kind==='network'?['network','rm',name]:['rm','-f',name]);
  }
});

dbtest('manifest: fail closed before installer attestation; fingerprint is stable across independently created catalog OIDs',async()=>{
  await assert.rejects(()=>asRole('roomqc_control_probe','SELECT public.control_cluster_manifest($1)',[challenge]),{code:'55000'});
  const hash=await fingerprint();assert.match(hash,/^[a-f0-9]{64}$/);
  const second=await newDatabase('manifest_rebuild',{reverse:true});assert.equal(await fingerprint(second),hash);
  const a=(await pool.query("SELECT 'public.business_fixture'::regclass::oid AS oid")).rows[0].oid;
  const b=(await second.query("SELECT 'public.business_fixture'::regclass::oid AS oid")).rows[0].oid;assert.notEqual(a,b);
  await pool.query(`INSERT INTO private.roomqc_release_manifest(cluster_id,release_id,contract_version,schema_fingerprint_version,
    artifact_digest,frontend_artifact_digest,migration_set_hash,expected_schema_hash) VALUES('fixture-a','synthetic-v3',3,3,$1,$2,$3,$4)`,
  ['1'.repeat(64),'2'.repeat(64),'3'.repeat(64),hash]);
  const response=await rpc(token('roomqc_control_probe'));assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.challenge,challenge);assert.equal(result.clusterId,'fixture-a');assert.equal(result.releaseId,'synthetic-v3');
  assert.equal(result.schemaManifestHash,hash);assert.equal(result.expectedSchemaManifestHash,hash);
  assert.equal(result.schemaFingerprintVersion,3);assert.equal(result.contractVersion,3);
});

dbtest('registry validator uses the dedicated real manifest role and rejects runtime attestation drift',async()=>{
  const hash=await fingerprint(),publicKey=token('anon'),probeToken=token('roomqc_control_probe');
  const expected={clusterId:'fixture-a',releaseId:'synthetic-v3',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
    migrationSetHash:'3'.repeat(64),schemaManifestHash:hash};
  const entry={id:'fixture-a',url:origin,credentialRef:'fixture-a',hostId:'fixture-host',releaseId:expected.releaseId,
    schemaManifestHash:hash,frontendReady:true,environment:'local'};
  let configuredCredential={publishableKey:publicKey,token:probeToken};
  const catalog=new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:'fixture-a',credential:configuredCredential,
    approval:fixtureReleaseApproval(fixtureReleaseContext({id:'fixture-a',url:origin},expected,{hostId:'fixture-host'}))}]},{trust:fixtureReleaseTrust});
  const config={allowLocal:true,clusters:[{id:'fixture-a',url:origin,publishableKey:publicKey,serviceKey:token('service_role'),vapidPublicKey:'fixture-public-vapid'}],
    inventory:new Map([['fixture-a',entry]]),credentials:new Map([['fixture-a',{publishableKey:publicKey,serviceKey:token('service_role'),vapidPublicKey:'fixture-public-vapid'}]]),
    releaseValidation:{get:()=>({expected,credential:configuredCredential}),expectation:ref=>catalog.expectation(ref),
      authorization:(...args)=>catalog.authorization(...args)}};
  let calls=0;
  const gateway=new ClusterGateway(config,async(url,init)=>{
    assert.equal(url,origin+'/rest/v1/rpc/control_cluster_manifest');calls++;
    assert.equal(init.headers.authorization,'Bearer '+configuredCredential.token);assert.equal(init.headers.apikey,publicKey);
    assert.match(JSON.parse(init.body).p_challenge,/^[a-f0-9]{64}$/);
    return fetch(origin+'/rpc/control_cluster_manifest',init);
  },{authorizeRelease:async row=>releaseValidationContext(config,row)});
  const row={id:'fixture-a',api_url:origin,inventory_ref:'fixture-a',credential_ref:'fixture-a',host_id:'fixture-host'};
  const result=await gateway.validateCluster(row);assert.equal(result.releaseId,expected.releaseId);
  assert.equal(result.schemaManifestHash,hash);assert.equal(result.manifest.schemaFingerprintVersion,3);assert.equal(calls,1);
  await pool.query("UPDATE private.roomqc_release_manifest SET artifact_digest=repeat('e',64)");
  try{await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_MANIFEST_MISMATCH'})}
  finally{await pool.query('UPDATE private.roomqc_release_manifest SET artifact_digest=$1',[expected.artifactDigest])}
  assert.equal((await gateway.validateCluster(row)).schemaManifestHash,hash);
  configuredCredential={publishableKey:publicKey,token:probeToken+'invalid-signature'};
  await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_MANIFEST_MISMATCH'});
  const before=calls;configuredCredential={publishableKey:publicKey,token:token('roomqc_control_probe',{exp:1})};
  await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_MANIFEST_MISMATCH'});assert.equal(calls,before);
  configuredCredential={publishableKey:publicKey,token:probeToken};
  assert.equal((await gateway.validateCluster(row)).schemaManifestHash,hash);
});

dbtest('manifest: anon/authenticated/service-role denied over real REST; probe cannot read or mutate business or attestation',async()=>{
  for(const role of [null,'anon','authenticated','service_role']){
    const response=await rpc(role?token(role):null);assert.ok([401,403,404].includes(response.status),`${role} manifest rejected`);
  }
  for(const role of ['anon','authenticated','service_role']){
    await assert.rejects(()=>asRole(role,'SELECT public.control_cluster_manifest($1)',[challenge]),{code:'42501'});
    await assert.rejects(()=>asRole(role,'SELECT private.roomqc_schema_fingerprint()'),{code:'42501'});
  }
  for(const query of ['SELECT * FROM public.business_fixture','INSERT INTO public.business_fixture(note) VALUES(\'not allowed\')',
    'DELETE FROM private.roomqc_release_manifest','UPDATE private.roomqc_release_manifest SET release_id=\'other\'',
    'CREATE TABLE public.probe_ddl(id int)']){
    await assert.rejects(()=>asRole('roomqc_control_probe',query),{code:'42501'});
  }
  // SET ROLE from a postgres-owned session would use its original superuser
  // authority, so inspect the probe role's actual membership instead.
  assert.equal((await pool.query("SELECT pg_has_role('roomqc_control_probe','authenticated','SET') AS allowed")).rows[0].allowed,false);
  const read=await fetch(origin+'/business_fixture',{signal:AbortSignal.timeout(6000),headers:{authorization:'Bearer '+token('roomqc_control_probe')}});
  assert.equal(read.status,403);
  const validOwner=await fetch(origin+'/business_fixture',{signal:AbortSignal.timeout(6000),headers:{authorization:'Bearer '+token('authenticated')}});
  assert.equal(validOwner.status,200);assert.equal((await validOwner.json()).length,1,'Positive control: correct role can still read fixture');
  assert.ok([401,403].includes((await rpc(token('roomqc_control_probe',{exp:1}))).status));
  assert.equal((await rpc(token('roomqc_control_probe'),{p_challenge:'invalid'})).status,400);
});

dbtest('manifest: schema/function/RLS/ACL/role/publication/migration drift changes observed hash without blessing stored expected hash',async()=>{
  const baseline=await fingerprint();
  const mutations=[
    'ALTER TABLE public.business_fixture ADD COLUMN drift text',
    "ALTER TABLE public.business_fixture ALTER COLUMN note SET DEFAULT 'changed'",
    'ALTER TABLE public.business_fixture ADD CONSTRAINT positive_id CHECK(id>0)',
    'CREATE INDEX drift_index ON public.business_fixture(note)',
    'ALTER TABLE public.business_fixture DISABLE ROW LEVEL SECURITY',
    'ALTER POLICY fixture_owner ON public.business_fixture USING(false)',
    'GRANT SELECT ON public.business_fixture TO roomqc_control_probe',
    'GRANT authenticated TO roomqc_control_probe',
    "CREATE FUNCTION public.fixture_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'",
    "CREATE TYPE public.fixture_enum AS ENUM('a','b')",
    'CREATE PUBLICATION fixture_publication FOR TABLE public.business_fixture',
    "INSERT INTO supabase_migrations.schema_migrations VALUES('99999999999999')",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon"
  ];
  for(const mutation of mutations){
    const client=await pool.connect();await client.query('BEGIN');try{
      await client.query(mutation);const hash=await fingerprint(client);assert.notEqual(hash,baseline,mutation);
      const result=(await client.query('SELECT public.control_cluster_manifest($1) AS value',[challenge])).rows[0].value;
      assert.equal(result.expectedSchemaManifestHash,baseline);assert.equal(result.schemaManifestHash,hash);
    }finally{await client.query('ROLLBACK');client.release()}
    assert.equal(await fingerprint(),baseline,'Rollback must restore canonical schema fingerprint');
  }
  await pool.query("INSERT INTO public.business_fixture(note) VALUES('data change is not schema drift')");
  assert.equal(await fingerprint(),baseline);
});

dbtest('manifest: empty publication, owner and partition-root options remain attested before and after initialization',async()=>{
  const baseline=await fingerprint(),client=await pool.connect();
  await client.query('BEGIN');try{
    await client.query('CREATE PUBLICATION fixture_empty_publication');
    const empty=await fingerprint(client);assert.notEqual(empty,baseline,'Empty publication definitions must not disappear from attestation');
    await client.query('ALTER PUBLICATION fixture_empty_publication SET (publish_via_partition_root=true)');
    const viaRoot=await fingerprint(client);assert.notEqual(viaRoot,empty,'Service-managed partition publication option must remain visible');
    await client.query('ALTER PUBLICATION fixture_empty_publication OWNER TO anon');
    assert.notEqual(await fingerprint(client),viaRoot,'Publication ownership drift must be detected');
    const result=(await client.query('SELECT public.control_cluster_manifest($1) AS value',[challenge])).rows[0].value;
    assert.equal(result.expectedSchemaManifestHash,baseline,'Observing drift must not replace installer expectation');
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal(await fingerprint(),baseline);
});

dbtest('manifest v3: recovery namespaces, function authority, capability graph and default grants are attested',async()=>{
  const baseline=await fingerprint();
  const mutations=[
    'GRANT USAGE ON SCHEMA roomqc_setup_admin TO anon',
    'ALTER SCHEMA roomqc_setup OWNER TO roomqc_setup_credential_owner',
    'GRANT EXECUTE ON FUNCTION roomqc_setup.fixture_receipt() TO PUBLIC',
    'ALTER FUNCTION roomqc_setup.fixture_receipt() OWNER TO roomqc_setup_credential_owner',
    "ALTER FUNCTION roomqc_setup.fixture_receipt() SET search_path=public",
    'ALTER FUNCTION roomqc_setup.fixture_receipt() SECURITY INVOKER',
    "CREATE OR REPLACE FUNCTION roomqc_setup_admin.fixture_status() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 2'",
    "CREATE FUNCTION roomqc_setup_admin.unapproved_surface() RETURNS int LANGUAGE sql AS 'SELECT 1'",
    'ALTER ROLE roomqc_setup_credential_issuer INHERIT',
    'GRANT roomqc_setup_credential_installer TO scoped_fixture_operator',
    'GRANT authenticated TO roomqc_setup_credential_owner',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_setup_admin GRANT EXECUTE ON FUNCTIONS TO anon'
  ];
  for(const mutation of mutations){
    const client=await pool.connect();await client.query('BEGIN');
    try{
      await client.query(mutation);const drift=await fingerprint(client);assert.notEqual(drift,baseline,mutation);
      const manifest=(await client.query('SELECT public.control_cluster_manifest($1) AS value',[challenge])).rows[0].value;
      assert.equal(manifest.schemaFingerprintVersion,3);assert.equal(manifest.schemaManifestHash,drift);
      assert.equal(manifest.expectedSchemaManifestHash,baseline,'Drift must not overwrite approved metadata');
    }finally{await client.query('ROLLBACK');client.release()}
    assert.equal(await fingerprint(),baseline,'Recovery drift rollback must restore the same hash');
  }
});

dbtest('manifest v3: old fingerprint metadata is retained but rejected by the actual RPC until explicitly reapproved',async()=>{
  const baseline=await fingerprint();
  try{
    for(const version of [1,2]){
      await pool.query('UPDATE private.roomqc_release_manifest SET schema_fingerprint_version=$1',[version]);
      const response=await rpc(token('roomqc_control_probe'));assert.equal(response.status,500);
      const result=await response.json();assert.equal(result.code,'55000');
      assert.equal(await fingerprint(),baseline,'Metadata data changes do not approve a new catalog');
    }
  }finally{await pool.query('UPDATE private.roomqc_release_manifest SET schema_fingerprint_version=3')}
  const response=await rpc(token('roomqc_control_probe'));assert.equal(response.status,200);
  assert.equal((await response.json()).schemaFingerprintVersion,3);
});

async function partitionDatabase(name,{reverse=false,days=[-3,-2,-1,0,1,2,3],historicalDroppedColumns=false}={}){
  const db=await newDatabase(name,{reverse});
  await db.query(`CREATE SCHEMA realtime AUTHORIZATION supabase_realtime_admin;
    GRANT USAGE ON SCHEMA realtime TO roomqc_control_probe;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user,postgres;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT SELECT,INSERT ON TABLES TO postgres WITH GRANT OPTION;
    BEGIN;SET LOCAL ROLE supabase_realtime_admin;
    CREATE TABLE realtime.messages(${historicalDroppedColumns?'retired_id bigint,retired_uuid text,':''}
      id uuid NOT NULL DEFAULT gen_random_uuid(),inserted_at timestamp NOT NULL DEFAULT timezone('utc',clock_timestamp()),
      topic text NOT NULL,payload jsonb,binary_payload bytea,PRIMARY KEY(id,inserted_at)) PARTITION BY RANGE(inserted_at);
    ${historicalDroppedColumns?'ALTER TABLE realtime.messages DROP COLUMN retired_id,DROP COLUMN retired_uuid;':''}
    ALTER TABLE realtime.messages ADD CONSTRAINT payload_or_binary CHECK(payload IS NULL OR binary_payload IS NULL) NOT VALID;
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE INDEX messages_topic ON realtime.messages(inserted_at DESC,topic) WHERE payload IS NOT NULL;
    COMMIT;`);
  const rows=(await db.query(`SELECT n,to_char((statement_timestamp() AT TIME ZONE 'UTC')::date+n,'YYYY_MM_DD') AS suffix,
    to_char((statement_timestamp() AT TIME ZONE 'UTC')::date+n,'YYYY-MM-DD') AS start,
    to_char((statement_timestamp() AT TIME ZONE 'UTC')::date+n+1,'YYYY-MM-DD') AS finish
    FROM generate_series(-5,4) n ORDER BY n`)).rows;
  const dates=new Map(rows.map(r=>[r.n,{...r,table:'realtime.messages_'+r.suffix}]));
  const create=async(day,client=db)=>{
    const date=dates.get(day);
    await client.query(`BEGIN;SET LOCAL ROLE supabase_admin;
      CREATE TABLE ${date.table} PARTITION OF realtime.messages FOR VALUES FROM ('${date.start}') TO ('${date.finish}');
      ALTER TABLE ${date.table} OWNER TO supabase_realtime_admin;COMMIT;`);
  };
  for(const day of reverse?[...days].reverse():days)await create(day);
  return {db,dates,create};
}

dbtest('manifest v3: valid daily partition create/drop is normalized but all static schema remains attested across independent builds',async()=>{
  const f=await partitionDatabase('manifest_partitions'),baseline=await fingerprint(f.db);
  const independent=await partitionDatabase('manifest_partition_rebuild',{reverse:true,days:[-1,0,1,2,3]});
  assert.equal(await fingerprint(independent.db),baseline,'Different dates/count/OIDs must not create false static drift');
  await f.create(-4);assert.equal(await fingerprint(f.db),baseline,'One-day retention grace is validated, not hashed by date');
  await f.db.query('DROP TABLE '+f.dates.get(-4).table);assert.equal(await fingerprint(f.db),baseline);
  await f.db.query('DROP TABLE '+f.dates.get(3).table);assert.equal(await fingerprint(f.db),baseline);
  await f.create(3);assert.equal(await fingerprint(f.db),baseline,'Recreated vendor-shaped future partition restores the same attestation');
  const client=await f.db.connect();await client.query('BEGIN');try{
    await client.query('SET LOCAL ROLE roomqc_control_probe');
    assert.equal(await fingerprint(client),baseline,'Invoker probe must validate catalog shape without data or DDL grants');
  }finally{await client.query('ROLLBACK');client.release()}
});

dbtest('manifest v3: actual pg_dump restore retains the validated primary key and the same fingerprint',async()=>{
  const f=await partitionDatabase('manifest_dump_source'),baseline=await fingerprint(f.db);
  const fresh=(await f.db.query(`SELECT connoinherit FROM pg_constraint WHERE contype='p'
    AND conrelid=$1::regclass`,[f.dates.get(3).table])).rows[0];
  assert.equal(fresh.connoinherit,false,'The live CREATE PARTITION representation must reproduce the original case');
  // Keep migration-history rows: the release fingerprint deliberately binds them.
  const dump=docker(['exec',dbName,'pg_dump','-U','postgres','-d','manifest_dump_source','--no-comments']);
  await admin.query('CREATE DATABASE manifest_dump_restored');
  execFileSync('docker',['exec','-i',dbName,'psql','-U','postgres','-d','manifest_dump_restored','-X','-q','-v','ON_ERROR_STOP=1'],
    {input:dump,encoding:'utf8',timeout:30000,maxBuffer:1_000_000,stdio:['pipe','pipe','pipe']});
  const url=new URL(base);url.pathname='/manifest_dump_restored';
  const restored=new pg.Pool({connectionString:url.href,max:2,statement_timeout:10000});pools.push(restored);
  const key=(await restored.query(`SELECT k.convalidated,k.conislocal,k.coninhcount,k.connoinherit,
    p.conrelid::regclass::text AS parent FROM pg_constraint k JOIN pg_constraint p ON p.oid=k.conparentid
    WHERE k.contype='p' AND k.conrelid=$1::regclass`,[f.dates.get(3).table])).rows[0];
  assert.deepEqual(key,{convalidated:true,conislocal:false,coninhcount:1,connoinherit:true,parent:'realtime.messages'});
  const legacy=partitionSql.slice(partitionSql.indexOf('CREATE FUNCTION private.roomqc_managed_realtime_partition_ids()'),
    partitionSql.indexOf('CREATE OR REPLACE FUNCTION private.roomqc_schema_fingerprint()'))
    .replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
  await restored.query(legacy);
  await assert.rejects(()=>fingerprint(restored),{code:'55000'},'Old validation must reject the actual restored representation');
  await restored.query(restoredPartitionSql);
  const partsSql=recoveryFingerprintSql.slice(recoveryFingerprintSql.indexOf('WITH RECURSIVE'),recoveryFingerprintSql.indexOf('SELECT encode(sha256'))
    +`SELECT kind,identity,definition::text AS definition FROM parts ORDER BY kind,identity`;
  const originalParts=(await f.db.query(partsSql)).rows,restoredParts=(await restored.query(partsSql)).rows;
  const restoredByKey=new Map(restoredParts.map(p=>[p.kind+':'+p.identity,p.definition]));
  const changed=originalParts.filter(p=>restoredByKey.get(p.kind+':'+p.identity)!==p.definition).map(p=>p.kind+':'+p.identity);
  const originalKeys=new Set(originalParts.map(p=>p.kind+':'+p.identity));
  changed.push(...restoredParts.filter(p=>!originalKeys.has(p.kind+':'+p.identity)).map(p=>'added:'+p.kind+':'+p.identity));
  assert.equal(await fingerprint(restored),baseline,'Actual restored constraints must preserve the complete static fingerprint: '+changed.join(', '));
  const client=await restored.connect();await client.query('BEGIN');try{
    await client.query(`ALTER TABLE ${f.dates.get(3).table} ADD CONSTRAINT unauthorized_extra CHECK(topic<>'forbidden')`);
    await assert.rejects(()=>fingerprint(client),{code:'55000'},'The restore fix must still reject an extra constraint');
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal(await fingerprint(restored),baseline);
});

dbtest('manifest v3: vendor creator default ACL is preserved and rewritten on transfer to the Realtime owner',async()=>{
  const f=await partitionDatabase('manifest_creator_acl'),table=f.dates.get(3).table;
  assert.equal((await f.db.query('SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass',[table])).rows[0].owner,
    'supabase_realtime_admin');
  const grants=(await f.db.query(`SELECT pg_get_userbyid(e.grantor) AS grantor,pg_get_userbyid(e.grantee) AS grantee,
    e.privilege_type,e.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) e
    WHERE c.oid=$1::regclass`,[table])).rows;
  assert.ok(grants.some(g=>g.grantor==='supabase_realtime_admin'&&g.grantee==='dashboard_user'&&g.privilege_type==='SELECT'));
  assert.ok(grants.some(g=>g.grantor==='supabase_realtime_admin'&&g.grantee==='postgres'&&g.privilege_type==='SELECT'&&g.is_grantable));
  assert.ok(!grants.some(g=>g.grantee==='supabase_admin'||g.grantor==='supabase_admin'),'ALTER OWNER rewrites creator entries');
  const baseline=await fingerprint(f.db),client=await f.db.connect();await client.query('BEGIN');try{
    await client.query(`GRANT SELECT ON ${table} TO anon`);
    await assert.rejects(()=>fingerprint(client),{code:'55000'},'Only the exact transformed creator ACL is accepted');
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal(await fingerprint(f.db),baseline);
});

dbtest('manifest v3: vendor historical dropped columns do not require identical physical attribute or index positions',async()=>{
  // Realtime MessagesUsingUuid drops the original id/uuid columns. Fresh daily
  // children have compact attnums, unlike their upgraded parent. Compare logical
  // column order and index column identity, never unrelated physical positions.
  const f=await partitionDatabase('manifest_dropped_columns',{historicalDroppedColumns:true}),table=f.dates.get(3).table;
  const positions=(await f.db.query(`SELECT c.oid::regclass::text AS relation,array_agg(a.attnum ORDER BY a.attnum) AS positions
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.oid IN ('realtime.messages'::regclass,$1::regclass) GROUP BY c.oid ORDER BY c.oid`,[table])).rows;
  assert.notDeepEqual(positions[0].positions,positions[1].positions,'Reproduction must retain physical gaps on the parent only');
  const keys=(await f.db.query(`SELECT indkey::text AS positions FROM pg_index WHERE indisprimary
    AND indrelid IN ('realtime.messages'::regclass,$1::regclass) ORDER BY indrelid`,[table])).rows;
  assert.notEqual(keys[0].positions,keys[1].positions,'The inherited primary index uses different physical attribute numbers');
  const baseline=await fingerprint(f.db);
  await f.db.query('DROP TABLE '+table);await f.create(3);assert.equal(await fingerprint(f.db),baseline);
  const client=await f.db.connect();await client.query('BEGIN');try{
    await client.query(`GRANT SELECT(topic) ON ${table} TO anon`);
    await assert.rejects(()=>fingerprint(client),{code:'55000'},'Logical-position normalization must not hide a column grant');
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal(await fingerprint(f.db),baseline);
});

dbtest('manifest v3: changing creator defaults and every child grant cannot re-bless a changed static ACL',async()=>{
  const f=await partitionDatabase('manifest_creator_default_drift'),baseline=await fingerprint(f.db),client=await f.db.connect();
  await client.query('BEGIN');try{
    await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT SELECT ON TABLES TO anon');
    await client.query('SET LOCAL ROLE supabase_realtime_admin');
    for(const day of [-3,-2,-1,0,1,2,3])await client.query('GRANT SELECT ON '+f.dates.get(day).table+' TO anon');
    await client.query('RESET ROLE');
    assert.equal((await client.query('SELECT cardinality(private.roomqc_managed_realtime_partition_ids()) AS count')).rows[0].count,7,
      'The deliberately altered child ACLs now match altered defaults, so the static attestation must detect this change');
    assert.notEqual(await fingerprint(client),baseline,'Creator defaults remain part of the immutable approved static fingerprint');
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal(await fingerprint(f.db),baseline);
});

dbtest('manifest v3: partition grants, bounds, columns, constraints, indexes, policies and publication tampering are rejected',async()=>{
  const f=await partitionDatabase('manifest_partition_negative'),baseline=await fingerprint(f.db),table=f.dates.get(3).table;
  const index=(await f.db.query(`SELECT c.oid::regclass::text AS name FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid
    WHERE x.indrelid=$1::regclass AND NOT x.indisprimary`,[table])).rows[0].name;
  const mutations=[
    `GRANT SELECT ON ${table} TO anon`,
    `GRANT SELECT(id) ON ${table} TO anon`,
    `ALTER TABLE ${table} ALTER COLUMN topic SET DEFAULT 'changed'`,
    `ALTER TABLE ${table} ADD CONSTRAINT extra_check CHECK(topic<>'forbidden')`,
    `CREATE INDEX extra_child_index ON ${table}(topic)`,
    `ALTER INDEX ${index} SET(fillfactor=70)`,
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    `CREATE POLICY extra_child_policy ON ${table} FOR SELECT TO anon USING(true)`,
    `ALTER TABLE ${table} OWNER TO postgres`,
    `ALTER TABLE ${table} SET(autovacuum_enabled=false)`,
    `ALTER TABLE ${table} REPLICA IDENTITY FULL`,
    `CREATE PUBLICATION extra_child_publication FOR TABLE ${table}`,
    `ALTER TABLE ${table} RENAME TO messages_${f.dates.get(-4).suffix}`,
    `ALTER TABLE ${table} RENAME TO unrecognized_partition`,
    `ALTER TABLE ${table} SET SCHEMA public`,
    `DROP TABLE ${f.dates.get(1).table}`,
    `SET LOCAL ROLE supabase_realtime_admin;CREATE TABLE ${f.dates.get(4).table} PARTITION OF realtime.messages
      FOR VALUES FROM ('${f.dates.get(4).start}') TO ('${f.dates.get(4).finish}')`,
    `SET LOCAL ROLE supabase_realtime_admin;CREATE TABLE ${f.dates.get(-5).table} PARTITION OF realtime.messages
      FOR VALUES FROM ('${f.dates.get(-5).start}') TO ('${f.dates.get(-5).finish}')`
  ];
  for(const mutation of mutations){
    const client=await f.db.connect();await client.query('BEGIN');try{
      await client.query(mutation);
      await client.query('RESET ROLE');
      await assert.rejects(()=>fingerprint(client),{code:'55000'},mutation);
    }finally{await client.query('ROLLBACK');client.release()}
    assert.equal(await fingerprint(f.db),baseline,'Rollback of '+mutation+' must restore the original validation');
  }
  const client=await f.db.connect();await client.query('BEGIN');try{
    await client.query('ALTER TABLE realtime.messages DETACH PARTITION '+table);
    assert.notEqual(await fingerprint(client),baseline,'Detached objects return to static attestation; they are not excluded by prefix');
  }finally{await client.query('ROLLBACK');client.release()}
});

dbtest('manifest v3: migration never promotes the prior v1 installer approval',async()=>{
  const client=await pool.connect();await client.query('BEGIN');try{
    await client.query('UPDATE private.roomqc_release_manifest SET schema_fingerprint_version=1');
    await assert.rejects(()=>client.query('SELECT public.control_cluster_manifest($1)',[challenge]),{code:'55000'});
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal((await rpc(token('roomqc_control_probe'))).status,200);
});
