// Real published directory19 ->20 ->21 with populated predecessor history. Only
// this exact-owned database/temporary migration directory may be modified.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrateDirectory,migrationManifest,importInitialRegistry} from '../migrate.mjs';
import {fixtureReleaseContext,seedFixtureReleaseAuthority} from '../release-test-fixtures.mjs';
import {SetupWorkerStore} from '../setup-worker-store.mjs';
import {supportIntentTransaction} from '../support-intents.mjs';

export async function runSupportDirectoryUpgradeNativeChecks({input,db,cluster,expected,seed,accept}){
  const name='roomqc_support_upgrade_'+input.run,password=randomBytes(32).toString('hex');
  const apiRole='support_upgrade_api_'+input.run,workerRole='support_upgrade_worker_'+input.run;
  const checks=[],check=label=>checks.push({label,passed:true});
  let admin,directory,replica,api,workerPool,created=false,partial,baselineRoles,result;
  try{
    admin=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1});
    baselineRoles=(await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
    await admin.query('CREATE DATABASE '+name);created=true;
    directory=new pg.Pool({host:'db',database:name,user:'supabase_admin',password:input.databasePassword,max:3,statement_timeout:20000});
    replica=new pg.Pool({host:'db',database:name,user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:20000});
    const manifest=await migrationManifest();assert.equal(manifest.length,21);assert.equal(manifest.at(-1).version,'0021-support-command-intents.sql');
    partial=await mkdtemp('/tmp/roomqc-support-upgrade-'+input.run+'-');
    for(const m of manifest.slice(0,19))await writeFile(join(partial,m.version),m.sql,{flag:'wx',mode:0o600});
    const installed=await migrateDirectory(directory,{location:pathToFileURL(partial+'/')});
    assert.equal(installed.applied.length,19);
    const c={...cluster,hostId:cluster.id,publishableKey:input.publishableKey,vapidPublicKey:'owned',maxWorkspaces:99};
    await importInitialRegistry(directory,[c]);
    await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[c.id]);
    await directory.query('UPDATE roomqc_control.clusters SET host_id=id,inventory_ref=id');
    await seedFixtureReleaseAuthority(directory,fixtureReleaseContext(c,expected));
    await directory.query(`CREATE ROLE ${apiRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api;
      CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_setup_runtime`);
    api=new pg.Pool({host:'db',database:name,user:apiRole,password,max:1,statement_timeout:10000});
    workerPool=new pg.Pool({host:'db',database:name,user:workerRole,password,max:1,statement_timeout:10000});
    for(const key of ['active','revoked']){
      const p=seed.metadata[key],receipt=(await db.query('SELECT tenant_id,hotel_id FROM private.workspace_provisioning WHERE workspace_id=$1',[p.p_workspace_id])).rows[0];
      await directory.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status,tenant_id,hotel_id,expires_at)
        VALUES($1,$2,'Owned upgrade history',$3,$4,$5,'active',$6,$7,NULL)`,
        [p.p_workspace_id,'upgrade-'+key,createHash('sha256').update(seed[key].email).digest('hex'),c.id,p.p_owner_id,receipt.tenant_id,receipt.hotel_id]);
    }
    const pending=seed.metadata.pending,jobId=randomUUID();
    await directory.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status)
      VALUES($1,'upgrade-pending','Owned upgrade pending',$2,$3,$4,'provisioning')`,
      [pending.p_workspace_id,createHash('sha256').update(seed.pending.email).digest('hex'),c.id,pending.p_owner_id]);
    await directory.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
      VALUES($1,$2,$3,$4,1,$5)`,[pending.p_dispatch_id,pending.p_workspace_id,c.id,pending.p_owner_id,pending.p_payload_sha256]);
    await directory.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id)
      VALUES($1,$2,1,$3)`,[jobId,pending.p_workspace_id,pending.p_dispatch_id]);
    const binding=(await directory.query(`SELECT r.cluster_id AS "clusterId",r.approval_id AS "approvalId",r.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef"
      FROM roomqc_control.release_authority r JOIN roomqc_control.release_approvals a ON a.approval_id=r.approval_id
      JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows[0];
    const claim=await new SetupWorkerStore(workerPool,{bindings:[binding],leaseMs:300000}).claim();
    assert.equal(claim.id,jobId);
    const actor=seed.active.id,oldId=randomUUID(),oldKey=randomUUID(),consumedId=randomUUID(),consumedKey=randomUUID();
    for(const [id,key]of [[oldId,oldKey],[consumedId,consumedKey]])await directory.query(`INSERT INTO roomqc_control.control_commands(
      id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,payload_hash,expected_version,reason,status,result,finished_at)
      VALUES($1,$2,$3,'close_admission',$3,$4,$5,1,'Owned old command','succeeded','{"historical":true}',clock_timestamp())`,
      [id,actor,c.id,key,'c'.repeat(64)]);
    await directory.query(`INSERT INTO roomqc_control.support_actions(id,request_id,workspace_id,actor_id,authority_cluster_id,
      reason,outcome,before_state,after_state,finished_at)
      VALUES($1,$2,$3,$4,$5,'Owned legacy null context','reconciled','{"status":"active"}','{"status":"active"}',clock_timestamp())`,
      [randomUUID(),randomUUID(),seed.metadata.active.p_workspace_id,actor,c.id]);
    await directory.query(`INSERT INTO roomqc_control.workspace_recheck_commands(id,actor_id,authority_cluster_id,workspace_id,
      idempotency_key,payload_hash,reason,result) VALUES($1,$2,$3,$4,$5,$6,'Owned historical recheck','{"historical":true}')`,
      [randomUUID(),actor,c.id,pending.p_workspace_id,randomUUID(),'d'.repeat(64)]);
    const names19=(await directory.query("SELECT tablename FROM pg_tables WHERE schemaname='roomqc_control' ORDER BY tablename")).rows.map(r=>r.tablename);
    const snapshotNames=async names=>Object.fromEntries(await Promise.all(names.map(async table=>{
      assert.match(table,/^[a-z_]+$/);return [table,(await directory.query(`SELECT to_jsonb(t) AS row FROM roomqc_control.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row)];
    })));
    const baseline19=await snapshotNames(names19),history19=baseline19.schema_migrations;
    assert.equal(history19.length,19);assert.equal(baseline19.control_commands.length,2);assert.equal(baseline19.support_actions.length,1);
    assert(!Object.hasOwn(baseline19.support_actions[0],'command_key'));assert(!Object.hasOwn(baseline19.support_actions[0],'payload_hash'));
    const catalog=async()=>{
      const rows=await directory.query(`SELECT 'relation' AS kind,c.relname AS identity,
        jsonb_build_object('kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) AS value
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
        UNION ALL SELECT 'column',c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
          'notNull',a.attnotnull,'identity',a.attidentity,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid))
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
        WHERE n.nspname='roomqc_control' AND a.attnum>0 AND NOT a.attisdropped
        UNION ALL SELECT 'function',p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='roomqc_control' AND p.prokind='f'
        UNION ALL SELECT 'constraint',c.relname||'.'||k.conname,jsonb_build_object('definition',pg_get_constraintdef(k.oid))
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
        UNION ALL SELECT 'trigger',c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='roomqc_control' AND NOT t.tgisinternal ORDER BY kind,identity`);
      return rows.rows;
    };
    const catalog19=await catalog(),acceptanceMigration=manifest[19],fault20=await directory.connect();
    assert.equal(acceptanceMigration.version,'0020-support-command-acceptances.sql');
    check('directory19-real-install-populated-command-legacy-recheck-and-live-worker-lease-before-new-columns');
    try{
      await fault20.query('BEGIN');await fault20.query(acceptanceMigration.sql);
      await fault20.query('INSERT INTO roomqc_control.schema_migrations(version,checksum,execution_ms) VALUES($1,$2,0)',[acceptanceMigration.version,acceptanceMigration.checksum]);
      await assert.rejects(()=>fault20.query('SELECT 1/0'),{code:'22012'});
    }finally{await fault20.query('ROLLBACK');fault20.release()}
    assert.deepEqual(await snapshotNames(names19),baseline19);assert.deepEqual(await catalog(),catalog19);
    assert.equal((await directory.query("SELECT to_regclass('roomqc_control.support_authority_identity') IS NULL AS absent")).rows[0].absent,true);
    check('directory20-full-sql-history-fault-rollback-preserves19-data-schema-triggers-functions-and-acl');
    await writeFile(join(partial,acceptanceMigration.version),acceptanceMigration.sql,{flag:'wx',mode:0o600});
    const options20={location:pathToFileURL(partial+'/')};
    await assert.rejects(()=>migrateDirectory(api,options20),{code:'42501'});
    assert.deepEqual(await snapshotNames(names19),baseline19);assert.deepEqual(await catalog(),catalog19);
    check('directory20-runtime-api-login-cannot-migrate-and-denial-preserves19');
    const upgrade20=await Promise.all([migrateDirectory(directory,options20),migrateDirectory(replica,options20)]);
    assert.deepEqual(upgrade20.map(r=>r.applied.length).sort(),[0,1]);
    const after20=await snapshotNames(names19);assert.deepEqual(after20.schema_migrations.slice(0,19),history19);
    for(const name of names19){
      if(name==='schema_migrations')continue;
      const rows=name==='support_actions'?after20[name].map(({command_key,payload_hash,...row})=>{assert.equal(command_key,null);assert.equal(payload_hash,null);return row}):after20[name];
      assert.deepEqual(rows,baseline19[name],name+' predecessor rows must survive19->20');
    }
    assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.support_command_acceptances')).rows[0].n,0);
    assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.support_authority_identity')).rows[0].n,1);
    const authority20=(await api.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience;
    await assert.rejects(()=>workerPool.query('SELECT audience FROM roomqc_control.support_authority_identity'),{code:'42501'});
    await assert.rejects(()=>api.query('UPDATE roomqc_control.support_authority_identity SET audience=audience'),{code:'42501'});
    check('directory20-two-migrators-one-apply-all19-rows-preserved-null-legacy-context-one-new-identity-and-no-invented-consumption');
    const rerun20=await snapshotNames([...names19,'support_authority_identity','support_command_acceptances']);
    assert.equal((await migrateDirectory(directory,options20)).applied.length,0);
    assert.deepEqual(await snapshotNames([...names19,'support_authority_identity','support_command_acceptances']),rerun20);
    assert.equal((await api.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience,authority20);
    check('directory20-rerun-preserves-identity-history-and-live-lease');
    try{
      await directory.query('UPDATE roomqc_control.schema_migrations SET checksum=$2 WHERE version=$1',[acceptanceMigration.version,'0'.repeat(64)]);
      await assert.rejects(()=>migrateDirectory(replica,options20),{code:'MIGRATION_CHECKSUM_MISMATCH'});
    }finally{await directory.query('UPDATE roomqc_control.schema_migrations SET checksum=$2 WHERE version=$1',[acceptanceMigration.version,acceptanceMigration.checksum])}
    assert.deepEqual(await snapshotNames([...names19,'support_authority_identity','support_command_acceptances']),rerun20);
    assert.equal((await directory.query('SELECT state=$2 AND lease_token=$3 AND lease_until>clock_timestamp() AS preserved FROM roomqc_control.provisioning_jobs WHERE id=$1',
      [jobId,'leased',claim.token])).rows[0].preserved,true);
    check('directory20-checksum-denial-and-restoration-preserve-live-worker-lease-token-and-original-history');
    const audience=(await directory.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience;
    const accepted=await accept({p_attempt_id:randomUUID(),p_audience:audience,p_operation:'cluster_command',
      p_target:c.id,p_request_key:consumedKey,p_payload_sha256:'c'.repeat(64)});
    assert.equal(accepted.status,200);const a=accepted.data;
    await directory.query(`INSERT INTO roomqc_control.support_command_acceptances(
      acceptance_id,protocol_version,audience,actor_id,authority_cluster_id,session_id,attempt_id,operation,target,request_key,payload_hash,
      accepted_at_ms,observed_at_ms,expires_at_ms,control_command_id)
      VALUES($1,1,$2,$3,$4,$5,$6,'cluster_command',$4,$7,$8,$9,$10,$11,$12)`,
      [a.acceptanceId,audience,actor,c.id,a.sessionId,a.attemptId,consumedKey,'c'.repeat(64),a.acceptedAtMs,a.observedAtMs,a.expiresAtMs,consumedId]);
    check('directory20-real-published-install-populated-legacy-command-null-context-recheck-consumption-and-live-lease');
    const tableNames=(await directory.query("SELECT tablename FROM pg_tables WHERE schemaname='roomqc_control' ORDER BY tablename")).rows.map(r=>r.tablename);
    const snapshot=async()=>Object.fromEntries(await Promise.all(tableNames.map(async table=>{
      assert.match(table,/^[a-z_]+$/);
      const rows=(await directory.query(`SELECT to_jsonb(t) AS row FROM roomqc_control.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
      return [table,rows];
    })));
    const baseline=await snapshot(),priorHistory=baseline.schema_migrations;
    assert.equal(priorHistory.length,20);assert.equal(baseline.support_command_acceptances.length,1);
    assert.equal(baseline.support_actions[0].command_key,null);
    const newest=manifest.at(-1),fault=await directory.connect();
    try{
      await fault.query('BEGIN');await fault.query(newest.sql);
      await fault.query('INSERT INTO roomqc_control.schema_migrations(version,checksum,execution_ms) VALUES($1,$2,0)',[newest.version,newest.checksum]);
      await assert.rejects(()=>fault.query('SELECT 1/0'),{code:'22012'});
    }finally{await fault.query('ROLLBACK');fault.release()}
    assert.deepEqual(await snapshot(),baseline);
    assert.equal((await directory.query("SELECT to_regclass('roomqc_control.support_command_intents') IS NULL AS absent")).rows[0].absent,true);
    check('directory21-full-body-and-history-fault-rollback-preserves-populated20');
    const results=await Promise.all([migrateDirectory(directory),migrateDirectory(replica)]);
    assert.deepEqual(results.map(r=>r.applied.length).sort(),[0,1]);
    const after=await snapshot();assert.deepEqual(after.schema_migrations.slice(0,20),priorHistory);
    delete after.schema_migrations;const prior={...baseline};delete prior.schema_migrations;assert.deepEqual(after,prior);
    for(const t of ['support_command_intents','support_command_attempts','support_attempt_closures','support_intent_results'])
      assert.equal((await directory.query('SELECT count(*)::int AS count FROM roomqc_control.'+t)).rows[0].count,0);
    assert.equal((await directory.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience,audience);
    check('directory21-two-migrators-one-apply-preserve-every-predecessor-row-and-audience-without-invented-receipts');
    assert.equal((await directory.query('SELECT state=$2 AND lease_token=$3 AND lease_until>clock_timestamp() AS preserved FROM roomqc_control.provisioning_jobs WHERE id=$1',
      [jobId,'leased',claim.token])).rows[0].preserved,true);
    check('directory21-preserves-live-worker-lease-token-deadline-attempt-and-routing');
    const beforeRerun=await snapshot();assert.equal((await migrateDirectory(directory)).applied.length,0);
    assert.deepEqual(await snapshot(),beforeRerun);check('directory21-rerun-no-changes');
    const wrong='0'.repeat(64);
    try{
      await directory.query('UPDATE roomqc_control.schema_migrations SET checksum=$2 WHERE version=$1',[newest.version,wrong]);
      await assert.rejects(()=>migrateDirectory(replica),{code:'MIGRATION_CHECKSUM_MISMATCH'});
    }finally{await directory.query('UPDATE roomqc_control.schema_migrations SET checksum=$2 WHERE version=$1',[newest.version,newest.checksum])}
    assert.deepEqual(await snapshot(),beforeRerun);check('directory21-tampered-history-denies-without-changing-business-or-schema');
    const apiRead=await api.query('SELECT result FROM roomqc_control.control_commands WHERE id=$1',[oldId]);
    assert.deepEqual(apiRead.rows[0].result,{historical:true});
    // The authority callback is a fixture live SQL observation. This checks
    // coordinator replay compatibility, not the HTTP gateway authorization.
    const replay=await supportIntentTransaction(api,{actor:{id:actor,clusterId:c.id},sessionId:seed.active.session,
      initialAttemptId:randomUUID(),command:{kind:'control',operation:'close_admission',acceptanceOperation:'cluster_command',
        target:c.id,key:oldKey,payloadHash:'c'.repeat(64)},
      verifyAuthority:async()=>{assert.equal((await db.query('SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN public.user_roles r ON r.user_id=s.user_id WHERE s.id=$1 AND r.role=$2) AS live',
        [seed.active.session,'super_admin'])).rows[0].live,true)},
      lookup:async client=>(await client.query('SELECT result FROM roomqc_control.control_commands WHERE id=$1',[oldId])).rows[0].result,
      mutate:async()=>{throw new Error('OWNED_OLD_COMMAND_MUST_NOT_EXECUTE')},
      beforeCommit:async()=>{throw new Error('OWNED_OLD_COMMAND_MUST_NOT_ACCEPT')}});
    assert.deepEqual(replay,{historical:true});assert.deepEqual(await snapshot(),beforeRerun);
    assert.equal((await api.query('SELECT count(*)::int AS count FROM roomqc_control.support_command_intents')).rows[0].count,0);
    check('directory21-current-coordinator-replays-old-command-without-effect-intent-or-fake-acceptance');
    result={verified:true,checks,priorMigrations:19,intermediateMigrations:20,targetMigrations:21,actualMigrators:2,rollbackSqlstate:'22012',
      upgrade19to20:{verified:true,populatedTables:names19.length,allPredecessorRowsPreserved:true,newLegacyColumnsNull:true,
        fullBodyHistoryCatalogAclRollback:true,apiMigrationDenied:true,twoMigratorsOneApply:true,newIdentityCount:1,
        noInventedConsumption:true,rerunPreservesIdentity:true,checksumMismatchDenied:true,liveLeasePreserved:true,
        baselineSha256:createHash('sha256').update(JSON.stringify(baseline19)).digest('hex')},
      priorRowSha256:createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),priorTables:tableNames.length,
      audiencePreserved:true,liveLeasePreserved:true,legacyNullContextPreserved:true,consumedReceiptPreserved:true,
      noBackfilledIntents:true,oldBinaryRollbackVerified:false,
      limits:['Fixture SQL seeds predecessor rows; canonical consumption uses a real Auth receipt but is inserted by fixture administrator.',
        'Replay uses the real coordinator and API LOGIN role, with a fixture live-SQL authority callback; not full API/CLI transport acceptance.']};
    return result;
  }finally{
    await workerPool?.end();await api?.end();await replica?.end();await directory?.end();
    if(created)await admin.query('DROP DATABASE '+name);
    if(admin&&baselineRoles){
      const after=(await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
      const added=after.filter(r=>!baselineRoles.includes(r)),allowed=new Set(['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics',
        'roomqc_control_probe_runtime','roomqc_control_probe_installer','roomqc_control_release_installer','roomqc_control_release_writer',
        'roomqc_control_alerts','roomqc_control_setup_runtime','roomqc_control_setup_writer','roomqc_control_backfill_reader',
        'roomqc_control_backfill_runtime','roomqc_control_backfill_writer','roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer',apiRole,workerRole]);
      assert.ok(added.every(r=>allowed.has(r)));
      for(const role of added)await admin.query('DROP ROLE '+role);
      assert.deepEqual((await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),baselineRoles);
      if(result)result.roleCleanup={verified:true,removed:added.length,baselineCount:baselineRoles.length};
    }
    await admin?.end();
    if(partial){assert.equal(dirname(partial),'/tmp');assert.ok(partial.startsWith('/tmp/roomqc-support-upgrade-'+input.run+'-'));await rm(partial,{recursive:true,force:true})}
  }
}
