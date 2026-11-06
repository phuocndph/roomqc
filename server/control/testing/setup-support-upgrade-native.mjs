// Populated business585 ->586 ->587. Credentials and tokens returned between
// phases stay inside the owned orchestrator; only summary is public evidence.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {recoveryBinding} from '../setup-recovery.mjs';
import {runSupportDirectoryUpgradeNativeChecks} from './setup-support-directory-upgrade-native.mjs';

export async function runSupportUpgradePhase(input){
  assert.match(input.run,/^[a-f0-9]{12}$/);
  assert.ok(['seed585','verify586','verify587'].includes(input.phase));
  const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:3,
    statement_timeout:20000,connectionTimeoutMillis:5000});
  const checks=[],check=label=>checks.push({label,passed:true}),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cluster={id:'cluster-a',url:'http://127.0.0.1:8082',internalUrl:'http://127.0.0.1:8000',
    inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1']};
  const expected={clusterId:cluster.id,releaseId:'owned-recovery-fixture',artifactDigest:'a'.repeat(64),
    frontendArtifactDigest:'b'.repeat(64),migrationSetHash:'c'.repeat(64),schemaManifestHash:'d'.repeat(64)};
  async function call(path,token,body){
    const response=await fetch('http://127.0.0.1:8000'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  async function rpc(name,token,body){
    const end=Date.now()+10000;
    while(true){const result=await call('/rest/v1/rpc/'+name,token,body);
      if(result.status!==404||Date.now()>=end)return result;await sleep(100)}
  }
  const tables=['public.tenants','public.hotels','public.users','public.user_roles','public.user_hotels',
    'public.room_types','public.item_categories','public.laundry_categories','public.maintenance_categories',
    'public.email_deliveries','private.workspace_provisioning','private.workspace_setup_dispatches',
    'private.setup_recovery_authority','private.setup_recovery_credentials','auth.users','auth.sessions','auth.refresh_tokens'];
  const facts=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{
    const r=(await db.query(`SELECT count(*)::int AS count,
      encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS sha256
      FROM ${table} t`)).rows[0];return [table,r];
  })));
  const history=async()=>(await db.query('SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
  const acceptanceFacts=async()=>(await db.query(`SELECT count(*)::int AS count,
    encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') AS sha256
    FROM private.platform_support_acceptances t`)).rows[0];
  const accept=(a,args)=>rpc('accept_platform_support_command',a.token,args);
  async function account(label){
    const email='support-upgrade-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
    const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
    const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
    return {id:created.data.id,email,token:login.data.access_token,session:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
  }
  const metadata=a=>{
    const fields=JSON.stringify({fullName:'Owned populated upgrade',phone:'0901234567',tenantName:'Owned populated upgrade',
      hotelName:'Owned populated upgrade',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:3,workspaceSlug:'owned-upgrade'});
    return {p_workspace_id:randomUUID(),p_dispatch_id:randomUUID(),p_owner_id:a.id,p_routing_version:1,
      p_payload_sha256:createHash('sha256').update(fields).digest('hex'),p_fields_json:fields,p_session_id:a.session};
  };
  try{
    const count=(await history()).length;assert.equal(count,{seed585:585,verify586:586,verify587:587}[input.phase]);
    if(input.phase==='seed585'){
      assert.equal((await db.query("SELECT to_regclass('private.platform_support_acceptances') IS NULL AS absent")).rows[0].absent,true);
      const active=await account('active'),revoked=await account('revoked'),pending=await account('pending');
      const p=metadata(active),q=metadata(revoked),r=metadata(pending);
      for(const target of [p,q]){
        const provisioned=await rpc('provision_workspace_setup_dispatch',input.serviceKey,target);
        assert.equal(provisioned.status,200);assert.equal(provisioned.data.state,'committed');
      }
      for(const a of [active,revoked])await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[a.id]);
      await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[revoked.id]);
      await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[revoked.id]);
      assert.equal((await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[revoked.session,revoked.id])).rowCount,1);
      const binding=recoveryBinding(cluster,expected),credentialId=randomUUID();
      await db.query('INSERT INTO private.setup_recovery_authority(singleton,cluster_id,binding_sha256) VALUES(true,$1,$2)',[cluster.id,binding.bindingHash]);
      await db.query(`INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at,revoked_at)
        VALUES($1,$2,$3,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes',clock_timestamp())`,
        [credentialId,cluster.id,binding.bindingHash]);
      const baseline=await facts(),baselineHistory=await history();
      assert.ok(baseline['public.tenants'].count>=2);assert.ok(baseline['private.workspace_provisioning'].count>=2);
      check('seed585-real-auth-provisioned-hotels-trial-roles-revoked-owner-and-revoked-service-key');
      return {verified:true,phase:input.phase,checks,seed:{active,revoked,pending,metadata:{active:p,revoked:q,pending:r},credentialId,
        baseline,baselineHistory},summary:{phase:input.phase,checks,priorMigrations:585,businessTables:tables.length,
        actualAuth:true,actualProvision:true,containsSecrets:false}};
    }
    const seed=input.seed;assert.ok(seed?.active?.token);assert.deepEqual(await facts(),seed.baseline);
    assert.deepEqual((await history()).slice(0,585),seed.baselineHistory);
    check(input.phase+'-preserves-all17-business-auth-session-credential-tables-and-prior-history');
    if(input.phase==='verify586'){
      const args={p_attempt_id:randomUUID(),p_audience:randomUUID(),p_operation:'cluster_command',
        p_target:cluster.id,p_request_key:randomUUID(),p_payload_sha256:'e'.repeat(64)};
      const made=await accept(seed.active,args);assert.equal(made.status,200);assert.ok(made.data.acceptanceId);
      assert.equal(made.data.observedAtMs,undefined);
      const beforeDenial=await acceptanceFacts(),denied=await accept(seed.revoked,{...args,p_attempt_id:randomUUID()});
      assert.ok([401,403].includes(denied.status));assert.equal(denied.data.code,'42501');assert.deepEqual(await acceptanceFacts(),beforeDenial);
      assert.deepEqual(await facts(),seed.baseline);check('586-actual-auth-acceptance-and-revoked-actor-denial');
      return {verified:true,phase:input.phase,checks,seed:{...seed,acceptance:{args,receipt:made.data,facts:await acceptanceFacts()}},
        summary:{phase:input.phase,checks,priorMigrations:585,targetMigrations:586,
          preservesBusiness:true,actualCanonicalAcceptance:true,revokedActorDenied:true,containsSecrets:false}};
    }
    assert.deepEqual(await acceptanceFacts(),seed.acceptance.facts);
    check('587-preserves-original586-acceptance-id-expiry-and-full-row');
    const end=Date.now()+8000;
    while(!(await db.query('SELECT expires_at<=clock_timestamp() AS expired FROM private.platform_support_acceptances WHERE id=$1',
      [seed.acceptance.receipt.acceptanceId])).rows[0].expired){
      assert.ok(Date.now()<end,'OWNED_ACCEPTANCE_EXPIRY_TIMEOUT');await sleep(20);
    }
    const expired=await accept(seed.active,seed.acceptance.args);
    assert.equal(expired.data.code,'55000');assert.ok(expired.status>=400);
    assert.deepEqual(await acceptanceFacts(),seed.acceptance.facts);
    check('587-old-expired-attempt-denies-without-renewal-or-new-history');
    const fresh=await accept(seed.active,{...seed.acceptance.args,p_attempt_id:randomUUID(),p_request_key:randomUUID()});
    assert.equal(fresh.status,200);assert.ok(Number.isSafeInteger(fresh.data.observedAtMs));
    assert.ok(fresh.data.observedAtMs>=fresh.data.acceptedAtMs&&fresh.data.observedAtMs<fresh.data.expiresAtMs);
    check('587-new-canonical-acceptance-has-monotonic-handoff-clock-contract');
    const before=await acceptanceFacts(),denied=await accept(seed.revoked,{...seed.acceptance.args,p_attempt_id:randomUUID()});
    assert.ok([401,403].includes(denied.status));assert.equal(denied.data.code,'42501');assert.deepEqual(await acceptanceFacts(),before);
    assert.deepEqual(await facts(),seed.baseline);
    check('587-revoked-session-role-account-and-service-credential-remain-revoked');
    const directory=await runSupportDirectoryUpgradeNativeChecks({input,db,cluster,expected,seed,
      accept:args=>accept(seed.active,args)});
    assert.deepEqual(await facts(),seed.baseline);check('directory-upgrade-and-api-compatibility-do-not-change-existing-business');
    return {verified:true,phase:input.phase,checks,business:{priorMigrations:585,intermediateMigrations:586,targetMigrations:587,
      populatedTables:seed.baseline,preservedOriginalAcceptance:true,realExpiry:true,actualAuth:true,actualRest:true,
      priorHistoryPreserved:true,baselineHistorySha256:createHash('sha256').update(JSON.stringify(seed.baselineHistory)).digest('hex')},
      directory,containsSecrets:false,
      limits:['Fixtures use admin-confirmed Auth accounts and SQL preparation; not public email signup.',
        'One disposable PostgreSQL host; no VPS, A/B, physical backup/restore or product acceptance.',
        'No old application binary rollback or permission to rewrite published migration checksums.']};
  }finally{await db.end()}
}
