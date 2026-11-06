// Owned PostgreSQL + real PostgREST JWT verification. Never uses serving DBs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {SignJWT} from 'jose';
import {readTenantSummary,tenantSummaryBinding} from './tenant-summary.mjs';

const enabled=process.env.ROOMQC_TENANT_SUMMARY_DB_TEST==='true';
test('native summary reads exact A/B cluster with verified JWT, denies cross binding/privileged reads, revocation, expiry and preserves rows',
  {skip:!enabled,timeout:120000},async()=>{
  const run=process.env.ROOMQC_TENANT_SUMMARY_TEST_RUN??randomBytes(6).toString('hex');assert.match(run,/^[a-f0-9]{12}$/);
  const prefix='roomqc-summary-'+run,label='roomqc.tenant-summary-test',password=randomBytes(32).toString('hex'),secret=randomBytes(48).toString('hex');
  const created=[],pools=[];let network=false;
  const docker=(args,env={})=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:500000,
    windowsHide:true,env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  const start=(suffix,args,env={})=>{const name=prefix+'-'+suffix;docker(['run','-d','--name',name,'--label',label+'='+run,'--network',prefix,...args],env);created.push(name);return name};
  const port=(name,key)=>JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports[key][0].HostPort;
  try{
    docker(['network','create','--label',label+'='+run,prefix]);network=true;
    const db=start('db',['--env','POSTGRES_PASSWORD','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=256m','-p','127.0.0.1::5432',
      'postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383'],{POSTGRES_PASSWORD:password});
    const url='postgresql://postgres:'+password+'@127.0.0.1:'+port(db,'5432/tcp')+'/postgres';
    const admin=new pg.Pool({connectionString:url,max:2});pools.push(admin);
    let ready=false;for(let i=0;i<75;i++){try{await admin.query('SELECT 1');ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}assert.equal(ready,true);
    await admin.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}';GRANT anon TO authenticator;`);
    await admin.query('CREATE DATABASE cluster_b');
    // The test administrator prepares only fixtures, never the runtime credential.
    const fixture=`REVOKE ALL ON SCHEMA public FROM PUBLIC;
      CREATE SCHEMA private;CREATE TABLE public.tenants(id uuid PRIMARY KEY,name text,subscription_status text,trial_ends_at timestamptz);
      CREATE TABLE public.hotels(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants);
      CREATE TABLE public.users(id uuid PRIMARY KEY,tenant_id uuid,deleted_at timestamptz,status text);
      CREATE TABLE public.rooms(id uuid PRIMARY KEY,hotel_id uuid NOT NULL REFERENCES public.hotels);
      CREATE TABLE private.workspace_provisioning(workspace_id uuid PRIMARY KEY,tenant_id uuid,owner_id uuid,hotel_id uuid);`;
    const migration=await readFile(new URL('../../supabase/migrations/20261029135816_tenant_summary_scoped_read.sql',import.meta.url),'utf8');
    const workspace={id:randomUUID(),tenant_id:randomUUID(),owner_id:randomUUID(),hotel_id:randomUUID(),routing_version:1};
    const otherTenant=randomUUID(),otherHotel=randomUUID();
    const targets=[];
    for(const [index,database]of ['postgres','cluster_b'].entries()){
      const dbUrl=new URL(url);dbUrl.pathname='/'+database;
      const pool=new pg.Pool({connectionString:dbUrl.href,max:2});pools.push(pool);
      await pool.query(fixture);await pool.query('BEGIN');await pool.query(migration);await pool.query('COMMIT');
      const rest=start('rest-'+index,['-p','127.0.0.1::3000','--env','PGRST_DB_URI','--env','PGRST_JWT_SECRET','--env','PGRST_DB_SCHEMAS=roomqc_summary',
        '--env','PGRST_DB_ANON_ROLE=anon','--env','PGRST_DB_POOL=2','--env','PGRST_JWT_CACHE_MAX_LIFETIME=0',
        'public.ecr.aws/supabase/postgrest@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df'],
        {PGRST_DB_URI:'postgresql://authenticator:'+password+'@'+db+':5432/'+database,PGRST_JWT_SECRET:secret});
      const cluster={id:'cluster-'+(index?'b':'a'),ref:'summary-key',inventoryRef:'summary-inventory-'+index,
        url:'http://127.0.0.1:'+port(rest,'3000/tcp'),approvedAddresses:[],publishableKey:'fixture-publishable'};
      const binding=tenantSummaryBinding(cluster),iat=Math.floor(Date.now()/1000),exp=iat+600,id=randomUUID();
      await pool.query('INSERT INTO private.tenant_summary_authority VALUES(true,$1,$2)',[cluster.id,binding.bindingHash]);
      await pool.query('INSERT INTO private.tenant_summary_credentials VALUES($1,$2,$3,to_timestamp($4),to_timestamp($5),null)',[id,cluster.id,binding.bindingHash,iat,exp]);
      await pool.query('INSERT INTO public.tenants VALUES($1,$2,$3,null),($4,$5,$3,null)',[workspace.tenant_id,index?'Cluster B hotel':'Cluster A hotel','trial',otherTenant,'Private other tenant']);
      await pool.query('INSERT INTO public.hotels VALUES($1,$2),($3,$4)',[workspace.hotel_id,workspace.tenant_id,otherHotel,otherTenant]);
      await pool.query('INSERT INTO public.users VALUES($1,$2,null,$3),($4,$2,now(),$3),($5,$6,null,$3)',[workspace.owner_id,workspace.tenant_id,'active',randomUUID(),randomUUID(),otherTenant]);
      if(index)await pool.query('INSERT INTO public.rooms VALUES($1,$2)',[randomUUID(),workspace.hotel_id]);
      await pool.query('INSERT INTO public.rooms VALUES($1,$2)',[randomUUID(),otherHotel]);
      await pool.query('INSERT INTO private.workspace_provisioning VALUES($1,$2,$3,$4)',[workspace.id,workspace.tenant_id,workspace.owner_id,workspace.hotel_id]);
      const jwtClaims={role:'roomqc_tenant_summary',iss:'roomqc-tenant-summary/v1',aud:'authenticated',jti:id,cluster_id:cluster.id,
        binding_sha256:binding.bindingHash,iat,exp};
      const sign=c=>new SignJWT(c).setProtectedHeader({alg:'HS256'}).sign(Buffer.from(secret));
      const token=await sign(jwtClaims),credential={version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:'fixture-publishable',token};
      const bound={...workspace,cluster_id:cluster.id,api_url:cluster.url};
      const raw=(body,access=token,path='tenant_summary')=>fetch(cluster.url+'/rpc/'+path,{method:'POST',signal:AbortSignal.timeout(5000),
        headers:{authorization:'Bearer '+access,'content-type':'application/json','Content-Profile':'roomqc_summary'},body:JSON.stringify(body)});
      const body={p_workspace_id:workspace.id,p_tenant_id:workspace.tenant_id,p_owner_id:workspace.owner_id,p_hotel_id:workspace.hotel_id};
      // PostgREST is mounted directly here; gateway retains the production RPC
      // path and actual safe transport, translated only by the test adapter.
      const {createClusterFetch}=await import('./safe-http.mjs');
      const config={allowLocal:true,inventory:new Map([[cluster.inventoryRef,{...cluster}]])};
      const safe=createClusterFetch(config,{maxResponseBytes:16384});
      const fetcher=(address,options,target)=>safe(address.replace('/rest/v1/','/'),options,target);
      let up=false;for(let i=0;i<75;i++){try{const r=await raw(body);if(r.ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.equal(up,true,'Native PostgREST readiness');
      const snapshot=async()=>JSON.stringify((await pool.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM public.tenants t) AS tenants,
        (SELECT jsonb_agg(u ORDER BY id) FROM public.users u) AS users,(SELECT jsonb_agg(r ORDER BY id) FROM public.rooms r) AS rooms,
        (SELECT jsonb_agg(w ORDER BY workspace_id) FROM private.workspace_provisioning w) AS receipts`)).rows);
      const before=await snapshot();
      const result=await readTenantSummary(config,cluster,bound,{fetcher,loadCredential:async()=>credential});
      assert.equal(result.tenant.name,index?'Cluster B hotel':'Cluster A hotel');assert.equal(result.tenant.hotelCount,1);
      assert.equal(result.tenant.staffCount,1);assert.equal(result.tenant.roomCount,index?1:0);
      assert.equal((await raw({...body,p_tenant_id:otherTenant})).status,400);
      assert.equal((await raw({...body,p_owner_id:randomUUID()})).status,400);
      assert.equal((await raw({...body,p_workspace_id:randomUUID()}).then(r=>r.json())).state,'missing');
      for(const change of [{role:'service_role'},{role:'authenticated'},{iss:'wrong'},{cluster_id:'other-cluster'},{binding_sha256:'f'.repeat(64)}]){
        const response=await raw(body,await sign({...jwtClaims,...change}));assert.equal(response.ok,false);
      }
      const tampered=token.slice(0,-8)+'AAAAAAAA';assert.equal((await raw(body,tampered)).status,401);
      const surface=(await pool.query(`SELECT has_schema_privilege('roomqc_tenant_summary','public','USAGE') AS public_usage,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private','auth','storage')
          AND c.relkind IN('r','p','v','m') AND (has_table_privilege('roomqc_tenant_summary',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege('roomqc_tenant_summary',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS table_grants,
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('roomqc_summary','private')
          AND has_schema_privilege('roomqc_tenant_summary',n.oid,'USAGE') AND has_function_privilege('roomqc_tenant_summary',p.oid,'EXECUTE')) AS rpc_grants`)).rows[0];
      assert.deepEqual(surface,{public_usage:false,table_grants:0,rpc_grants:1});
      await pool.query('UPDATE private.tenant_summary_credentials SET revoked_at=now() WHERE id=$1',[id]);
      await assert.rejects(readTenantSummary(config,cluster,bound,{fetcher,loadCredential:async()=>credential}),{code:'TENANT_SUMMARY_CREDENTIAL_DENIED'});
      await pool.query('UPDATE private.tenant_summary_credentials SET revoked_at=null WHERE id=$1',[id]);
      assert.equal((await raw(body)).ok,true);assert.equal(await snapshot(),before);
      targets.push({cluster,credential,bound,fetcher,raw,body,pool,sign,jwtClaims,id,config});
    }
    const [a,b]=targets;
    // A credential cannot read B even though the business UUIDs coincide.
    assert.equal((await b.raw(b.body,a.credential.token)).ok,false);
    const expired=await a.sign({...a.jwtClaims,iat:Math.floor(Date.now()/1000)-300,exp:Math.floor(Date.now()/1000)-120});
    assert.equal((await a.raw(a.body,expired)).status,401);
    await a.pool.query('UPDATE private.tenant_summary_credentials SET expires_at=clock_timestamp()-interval \'1 second\',not_before=clock_timestamp()-interval \'30 seconds\' WHERE id=$1',[a.id]);
    assert.equal((await a.raw(a.body)).status,403,'Database expiry independently rejects still-valid signed token');
    console.log(JSON.stringify({run,clusters:2,realPostgrest:true,migrationAppliedInIsolatedFixtures:true,servingWrites:0}));
  }finally{
    await Promise.allSettled(pools.map(p=>p.end()));
    for(const name of created.reverse()){
      const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels[label],run);docker(['rm','-f',name]);
    }
    if(network){const info=JSON.parse(docker(['network','inspect',prefix]))[0];assert.equal(info.Labels[label],run);docker(['network','rm',prefix]);}
  }
});
